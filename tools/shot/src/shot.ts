// tools/shot: open a registered scene in headless Chromium, optionally step its sim to an exact
// time, and write a PNG plus a JSON log (console errors and warnings, fps, sim time, git commit).
// Usage: see printHelp() or README.md.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import {
  BOOT_ERROR_KEY,
  READY_FLAG,
  TEST_API_KEY,
  URL_PARAM_PAUSED,
  URL_PARAM_SCENE,
} from '@beananza/shared';
import { SIM_HZ } from '@beananza/sim';
import { describeStep, parseScript, waitSteps, type ShotScript } from './script';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLIENT = join(REPO, 'packages/client');
const APP_MARKER = '<meta name="application-name" content="beananza"';

interface Options {
  scenes: string[];
  all: boolean;
  scripts: string[];
  times: (number | undefined)[];
  outDir: string;
  port: number;
  baseUrl: string | undefined;
  fpsMs: number;
  width: number;
  height: number;
  headed: boolean;
  softwareGl: boolean;
  timeoutMs: number;
}

interface ConsoleEntry {
  type: string;
  text: string;
  location?: string;
}

interface FpsSample {
  sampleMs: number;
  frames: number;
  avgFps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  phaserActualFps: number | null;
}

interface ShotLog {
  ok: boolean;
  error: string | null;
  /** Non-fatal remarks, e.g. --t given for a scene without a sim. */
  note: string | null;
  scene: string;
  url: string;
  requestedSimTime: number | null;
  simTime: number | null;
  screenshot: string | null;
  git: { commit: string | null; dirty: boolean | null };
  timestamp: string;
  viewport: { width: number; height: number };
  browser: string;
  /** WebGL renderer string (GPU or SwiftShader), or null if the canvas is not WebGL. */
  glRenderer: string | null;
  server: ServerMode;
  console: { errors: number; warnings: number; entries: ConsoleEntry[] };
  fps: FpsSample | null;
  sceneState: unknown;
}

type ServerMode = 'started' | 'reused' | 'external';

/** One input step of a script as it was run. */
interface ScriptInputLog {
  step: number;
  action: string;
  /** Sim time when the step ran. Input becomes sim commands, applied at the next step. */
  simTime: number | null;
}

/** Log for one `shot` step of a script. */
interface ScriptShotLog {
  ok: boolean;
  error: string | null;
  script: string;
  scene: string;
  shot: string;
  step: number;
  url: string;
  simTime: number | null;
  screenshot: string | null;
  git: { commit: string | null; dirty: boolean | null };
  timestamp: string;
  viewport: { width: number; height: number };
  browser: string;
  glRenderer: string | null;
  server: ServerMode;
  /** Every non-shot step run so far, in order. */
  inputs: ScriptInputLog[];
  /** Console output since the page loaded (cumulative). */
  console: { errors: number; warnings: number; entries: ConsoleEntry[] };
  sceneState: unknown;
}

function printHelp(): void {
  console.log(`Usage: pnpm shot [options]

  --scene <name>   Scene to shoot (repeatable). Default: the game's default scene.
  --all            Shoot every registered scene.
  --script <file>  Run a scripted playthrough (repeatable; JSON, see README.md). The scene
                   starts paused; keys and taps go through Playwright's keyboard and mouse,
                   and only "wait" steps advance the sim, in whole fixed steps.
                   Cannot be combined with --scene, --all or --t.
  --t <seconds>    Pause the sim at t = 0, step it to this time, then shoot (repeatable).
                   Without --t the scene runs live and is shot after the fps sample.
                   Scenes without a sim ignore --t (noted in the log).
  --out <dir>      Output directory (default: artifacts/shots).
  --port <n>       Dev server port to reuse or start (default: 5180). If another app
                   holds it, a server is started on a free port instead.
  --url <url>      Use this server instead (e.g. a preview build); nothing is started.
  --fps-ms <ms>    How long to sample frame times (default: 2000).
  --width <px>     Viewport width (default: 1280).
  --height <px>    Viewport height (default: 720).
  --timeout <ms>   How long to wait for window.__ready (default: 30000).
  --headed         Show the browser window.
  --software-gl    Use the headless shell with SwiftShader (no GPU) instead of Chromium's
                   new headless mode, which uses the GPU when there is one.

Writes <out>/<scene>[_t<time>].png and .json; a script writes
<out>/<script name>/<shot name>.png and .json, plus run.json. Exits non-zero if any shot has a console
error, a page error, a failed request, or does not become ready.`);
}

function parseOptions(): Options | null {
  const { values } = parseArgs({
    options: {
      scene: { type: 'string', multiple: true },
      all: { type: 'boolean', default: false },
      script: { type: 'string', multiple: true },
      t: { type: 'string', multiple: true },
      out: { type: 'string', default: 'artifacts/shots' },
      port: { type: 'string', default: '5180' },
      url: { type: 'string' },
      'fps-ms': { type: 'string', default: '2000' },
      width: { type: 'string', default: '1280' },
      height: { type: 'string', default: '720' },
      timeout: { type: 'string', default: '30000' },
      headed: { type: 'boolean', default: false },
      'software-gl': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    printHelp();
    return null;
  }
  const num = (name: string, raw: string): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a non-negative number, got "${raw}"`);
    return n;
  };
  const times = values.t?.map((raw) => num('t', raw));
  const scripts = values.script ?? [];
  if (scripts.length > 0 && (values.scene || values.all || values.t)) {
    throw new Error('--script cannot be combined with --scene, --all or --t (the script names its scene)');
  }
  return {
    scenes: values.scene ?? [],
    all: values.all,
    // pnpm runs this from tools/shot; resolve script paths against where the command was typed.
    scripts: scripts.map((f) => resolve(process.env.INIT_CWD ?? process.cwd(), f)),
    times: times && times.length > 0 ? times : [undefined],
    outDir: resolve(REPO, values.out),
    port: num('port', values.port),
    baseUrl: values.url,
    fpsMs: num('fps-ms', values['fps-ms']),
    width: num('width', values.width),
    height: num('height', values.height),
    headed: values.headed,
    softwareGl: values['software-gl'],
    timeoutMs: num('timeout', values.timeout),
  };
}

function gitInfo(): { commit: string | null; dirty: boolean | null } {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

/** Reuse a running dev server of this app, or start one in this process. */
async function ensureServer(opts: Options): Promise<{ baseUrl: string; mode: ServerMode; server?: ViteDevServer }> {
  if (opts.baseUrl) return { baseUrl: opts.baseUrl, mode: 'external' };
  const probeUrl = `http://localhost:${opts.port}/`;
  let portTaken = false;
  try {
    const res = await fetch(probeUrl, { signal: AbortSignal.timeout(2000) });
    if ((await res.text()).includes(APP_MARKER)) return { baseUrl: probeUrl, mode: 'reused' };
    portTaken = true;
    console.log(`shot: port ${opts.port} is serving another app; starting a server on a free port.`);
  } catch {
    // Nothing listening: start our own on that port.
  }
  const server = await createServer({
    root: CLIENT,
    configFile: join(CLIENT, 'vite.config.ts'),
    server: portTaken ? { port: 0, strictPort: false } : { port: opts.port, strictPort: true },
    logLevel: 'warn',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error('Vite started but reported no local URL.');
  return { baseUrl, mode: 'started', server };
}

/**
 * In-page code is passed as strings: functions serialized from this file would carry
 * esbuild helpers (tsx sets keepNames) that do not exist inside the page.
 */
const gameExpr = `window[${JSON.stringify(TEST_API_KEY)}]`;
const readyExpr = `window[${JSON.stringify(READY_FLAG)}] === true`;
const bootErrorExpr = `window[${JSON.stringify(BOOT_ERROR_KEY)}] ?? null`;

/** Wait until the scene is ready; throw at once if the game reports a boot error. */
async function waitForReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(`${readyExpr} || (${bootErrorExpr}) !== null`, undefined, { timeout: timeoutMs });
  const bootError = (await page.evaluate(bootErrorExpr)) as string | null;
  if (bootError) throw new Error(`boot error: ${bootError}`);
}

const glRendererExpr = `(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
})()`;

function callGame<R>(page: Page, call: string): Promise<R> {
  return page.evaluate(`(async () => {
    const game = ${gameExpr};
    if (!game) throw new Error('window.${TEST_API_KEY} is missing');
    return game.${call};
  })()`) as Promise<R>;
}

async function measureFps(page: Page, sampleMs: number): Promise<FpsSample> {
  const stamps = (await page.evaluate(`new Promise((done) => {
    const out = [];
    const frame = (ts) => {
      out.push(ts);
      if (ts - out[0] < ${sampleMs}) requestAnimationFrame(frame);
      else done(out);
    };
    requestAnimationFrame(frame);
  })`)) as number[];
  const gaps = stamps.slice(1).map((ts, i) => ts - (stamps[i] ?? ts));
  const total = gaps.reduce((a, b) => a + b, 0);
  const phaserActualFps = await callGame<number>(page, 'actualFps()');
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    sampleMs: round(total),
    frames: gaps.length,
    avgFps: gaps.length ? round((gaps.length * 1000) / total) : 0,
    avgFrameMs: gaps.length ? round(total / gaps.length) : 0,
    maxFrameMs: gaps.length ? round(Math.max(...gaps)) : 0,
    phaserActualFps: round(phaserActualFps),
  };
}

/** A new page that records console errors and warnings, page errors and failed requests. */
async function openPage(browser: Browser, opts: Options) {
  const entries: ConsoleEntry[] = [];
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const loc = msg.location();
    entries.push({ type, text: msg.text(), location: loc.url ? `${loc.url}:${loc.lineNumber}` : undefined });
  });
  page.on('pageerror', (err) => entries.push({ type: 'pageerror', text: err.stack ?? err.message }));
  page.on('requestfailed', (req) =>
    entries.push({ type: 'requestfailed', text: `${req.url()} ${req.failure()?.errorText ?? ''}`.trim() }),
  );
  return { context, page, entries };
}

function consoleSummary(entries: ConsoleEntry[]) {
  return {
    errors: entries.filter((e) => e.type !== 'warning').length,
    warnings: entries.filter((e) => e.type === 'warning').length,
    entries: [...entries],
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] ?? String(err) : String(err);
}

async function shoot(
  browser: Browser,
  baseUrl: string,
  serverMode: ServerMode,
  scene: string,
  t: number | undefined,
  opts: Options,
): Promise<ShotLog> {
  const base = t === undefined ? scene : `${scene}_t${t.toFixed(3)}`;
  const pngPath = join(opts.outDir, `${base}.png`);
  const url = new URL(baseUrl);
  url.searchParams.set(URL_PARAM_SCENE, scene);
  if (t !== undefined) url.searchParams.set(URL_PARAM_PAUSED, '1');

  const { context, page, entries } = await openPage(browser, opts);

  const log: ShotLog = {
    ok: false,
    error: null,
    note: null,
    scene,
    url: url.toString(),
    requestedSimTime: t ?? null,
    simTime: null,
    screenshot: null,
    git: gitInfo(),
    timestamp: new Date().toISOString(),
    viewport: { width: opts.width, height: opts.height },
    browser: `chromium ${browser.version()}${opts.softwareGl ? ' (headless shell)' : ''}`,
    glRenderer: null,
    server: serverMode,
    console: { errors: 0, warnings: 0, entries },
    fps: null,
    sceneState: null,
  };

  try {
    await page.goto(url.toString(), { waitUntil: 'load' });
    await waitForReady(page, opts.timeoutMs);
    if (t !== undefined) {
      if ((await callGame<number | null>(page, 'simTime()')) === null) {
        log.note = 'scene has no sim; --t ignored and the scene was shot live';
      } else {
        await callGame(page, `advanceTo(${t})`);
      }
    }
    log.fps = await measureFps(page, opts.fpsMs);
    log.simTime = await callGame<number | null>(page, 'simTime()');
    log.sceneState = await callGame(page, 'debugState()');
    log.glRenderer = (await page.evaluate(glRendererExpr)) as string | null;
  } catch (err) {
    log.error = errorMessage(err);
  }

  try {
    mkdirSync(dirname(pngPath), { recursive: true });
    await page.screenshot({ path: pngPath });
    log.screenshot = relative(REPO, pngPath).replaceAll('\\', '/');
  } catch (err) {
    log.error ??= `screenshot failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  await context.close();

  log.console = consoleSummary(entries);
  log.ok = log.error === null && log.console.errors === 0;
  writeFileSync(join(opts.outDir, `${base}.json`), `${JSON.stringify(log, null, 2)}\n`);
  return log;
}

/**
 * Run one script: open its scene paused, send each input through Playwright's keyboard and
 * mouse (so the client's own input handling turns it into sim commands), advance the sim only
 * on `wait` steps, and write a PNG plus a JSON log for each `shot` step. Returns the number of
 * failures.
 */
async function runScript(
  browser: Browser,
  baseUrl: string,
  serverMode: ServerMode,
  scriptPath: string,
  opts: Options,
): Promise<number> {
  const relScript = relative(REPO, scriptPath).replaceAll('\\', '/');
  let script: ShotScript;
  try {
    script = parseScript(JSON.parse(readFileSync(scriptPath, 'utf8')));
  } catch (err) {
    console.log(`FAIL ${relScript}: ${errorMessage(err)}`);
    return 1;
  }
  const outDir = join(opts.outDir, basename(scriptPath, extname(scriptPath)));
  mkdirSync(outDir, { recursive: true });

  const url = new URL(baseUrl);
  url.searchParams.set(URL_PARAM_SCENE, script.scene);
  url.searchParams.set(URL_PARAM_PAUSED, '1');
  const { context, page, entries } = await openPage(browser, opts);
  const git = gitInfo();
  const browserName = `chromium ${browser.version()}${opts.softwareGl ? ' (headless shell)' : ''}`;
  const inputs: ScriptInputLog[] = [];
  let failures = 0;
  let runError: string | null = null;
  let glRenderer: string | null;
  const simTime = () => callGame<number | null>(page, 'simTime()');

  console.log(`script ${relScript} (scene ${script.scene})`);
  try {
    await page.goto(url.toString(), { waitUntil: 'load' });
    await waitForReady(page, opts.timeoutMs);
    if ((await simTime()) === null) throw new Error(`scene "${script.scene}" has no sim; scripts need one`);
    glRenderer = (await page.evaluate(glRendererExpr)) as string | null;

    for (const [i, step] of script.steps.entries()) {
      const before = await simTime();
      if ('shot' in step) {
        const pngPath = join(outDir, `${step.shot}.png`);
        const log: ScriptShotLog = {
          ok: false,
          error: null,
          script: relScript,
          scene: script.scene,
          shot: step.shot,
          step: i,
          url: url.toString(),
          simTime: before,
          screenshot: null,
          git,
          timestamp: new Date().toISOString(),
          viewport: { width: opts.width, height: opts.height },
          browser: browserName,
          glRenderer,
          server: serverMode,
          inputs: [...inputs],
          console: consoleSummary(entries),
          sceneState: null,
        };
        try {
          log.sceneState = await callGame(page, 'debugState()');
          await page.screenshot({ path: pngPath });
          log.screenshot = relative(REPO, pngPath).replaceAll('\\', '/');
        } catch (err) {
          log.error = errorMessage(err);
        }
        log.console = consoleSummary(entries);
        log.ok = log.error === null && log.console.errors === 0;
        writeFileSync(join(outDir, `${step.shot}.json`), `${JSON.stringify(log, null, 2)}\n`);
        if (!log.ok) failures += 1;
        const time = log.simTime === null ? '' : `, sim ${log.simTime.toFixed(3)} s`;
        console.log(
          `${log.ok ? 'ok  ' : 'FAIL'} ${step.shot} -> ${log.screenshot ?? '(no png)'} ` +
            `(${log.console.errors} errors, ${log.console.warnings} warnings${time})`,
        );
        if (log.error) console.log(`     error: ${log.error}`);
        continue;
      }
      if ('keyDown' in step) await page.keyboard.down(step.keyDown);
      else if ('keyUp' in step) await page.keyboard.up(step.keyUp);
      else if ('press' in step) await page.keyboard.press(step.press);
      else if ('tap' in step) await page.mouse.click(step.tap[0], step.tap[1]);
      if ('wait' in step) {
        await callGame(page, `advanceBy(${waitSteps(step.wait) / SIM_HZ})`);
      } else {
        // Let the game handle the input event (and queue its sim command) without stepping.
        await callGame(page, 'settle()');
      }
      inputs.push({ step: i, action: describeStep(step), simTime: before });
    }
  } catch (err) {
    runError = errorMessage(err);
  }
  await context.close();

  const summary = consoleSummary(entries);
  const ok = runError === null && summary.errors === 0 && failures === 0;
  const run = { ok, error: runError, script: relScript, scene: script.scene, url: url.toString(), git, inputs, console: summary };
  writeFileSync(join(outDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
  if (runError) console.log(`FAIL ${relScript}: ${runError}`);
  for (const e of summary.entries) console.log(`     ${e.type}: ${e.text.split('\n')[0]}`);
  return ok ? 0 : Math.max(failures, 1);
}

/** Load the page without ?scene= and ask the game for its default and registered scenes. */
async function listScenes(
  browser: Browser,
  baseUrl: string,
  timeoutMs: number,
): Promise<{ defaultScene: string; all: string[] }> {
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'load' });
    await waitForReady(page, timeoutMs);
    return {
      defaultScene: await callGame<string>(page, 'sceneName'),
      all: await callGame<string[]>(page, 'sceneNames.slice()'),
    };
  } finally {
    await page.close();
  }
}

async function main(): Promise<number> {
  const opts = parseOptions();
  if (!opts) return 0;
  mkdirSync(opts.outDir, { recursive: true });

  const { baseUrl, mode, server } = await ensureServer(opts);
  let browser: Browser | undefined;
  let failures = 0;
  try {
    // Chromium's new headless mode renders WebGL on the GPU when there is one; the default
    // headless shell always uses SwiftShader, which logs GPU-stall warnings for WebGL canvases.
    browser = await chromium.launch({
      headless: !opts.headed,
      ...(opts.softwareGl ? {} : { channel: 'chromium' }),
    });
    if (opts.scripts.length > 0) {
      console.log(`shot: ${baseUrl} (${mode} server), ${browser.version()}`);
      for (const scriptPath of opts.scripts) failures += await runScript(browser, baseUrl, mode, scriptPath, opts);
      return failures === 0 ? 0 : 1;
    }
    let scenes = opts.scenes;
    if (opts.all || scenes.length === 0) {
      const listed = await listScenes(browser, baseUrl, opts.timeoutMs);
      scenes = opts.all ? listed.all : [listed.defaultScene];
    }
    console.log(`shot: ${baseUrl} (${mode} server), ${browser.version()}`);

    for (const scene of scenes) {
      for (const t of opts.times) {
        const log = await shoot(browser, baseUrl, mode, scene, t, opts);
        if (!log.ok) failures += 1;
        const label = t === undefined ? scene : `${scene} t=${t.toFixed(3)}`;
        const fps = log.fps ? `${log.fps.avgFps} fps` : 'no fps';
        const time = log.simTime === null ? '' : `, sim ${log.simTime.toFixed(3)} s`;
        const status = log.ok ? 'ok  ' : 'FAIL';
        console.log(
          `${status} ${label} -> ${log.screenshot ?? '(no png)'} ` +
            `(${log.console.errors} errors, ${log.console.warnings} warnings, ${fps}${time})`,
        );
        if (log.error) console.log(`     error: ${log.error}`);
        if (log.note) console.log(`     note: ${log.note}`);
        for (const e of log.console.entries) console.log(`     ${e.type}: ${e.text.split('\n')[0]}`);
      }
    }
  } finally {
    await browser?.close();
    await server?.close();
  }
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  },
);
