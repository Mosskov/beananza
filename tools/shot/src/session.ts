// tools/shot as a library: one dev server and one browser (a session), and the two things done
// in it: shoot a scene, or run a scripted playthrough. The CLIs (shot, check-looks, verify,
// art-sheet) share it, so a whole verification pass starts Vite and Chromium once.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import {
  BOOT_ERROR_KEY,
  READY_FLAG,
  TEST_API_KEY,
  URL_PARAM_LAYOUT,
  URL_PARAM_LOOK,
  URL_PARAM_PAUSED,
  URL_PARAM_REGION,
  URL_PARAM_SCENE,
} from '@beananza/shared';
import { SIM_HZ } from '@beananza/sim';
import { describeStep, parseScript, waitSteps, type ShotScript } from './script';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SCRIPTS_DIR = join(REPO, 'tools/shot/scripts');
const CLIENT = join(REPO, 'packages/client');
const APP_MARKER = '<meta name="application-name" content="beananza"';
/** The port `pnpm dev` uses; `--reuse` looks for the app there by default. */
export const DEV_PORT = 5180;

/** A look's output folder name: its ids joined by hyphens (`blue-spots-bow-glasses`). */
export const lookFolder = (look: string) =>
  look
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
    .join('-');

export interface SessionOptions {
  /** Start our own server on exactly this port; undefined picks a free port. */
  port?: number;
  /** Reuse the app's dev server on `port` (default 5180) if it runs there. */
  reuse?: boolean;
  /** Use this server instead; nothing is started. */
  baseUrl?: string;
  headed?: boolean;
  /** The headless shell with SwiftShader (no GPU). */
  softwareGl?: boolean;
  /** Extra Vite plugins for our own server (art-sheet serves older art this way). */
  vitePlugins?: Plugin[];
}

/** How each page is opened, and where its output goes. */
export interface RunOptions {
  outDir: string;
  width: number;
  height: number;
  /** Device pixels per CSS pixel (screenshots get this much larger). */
  deviceScaleFactor: number;
  reducedMotion: boolean;
  /** The bean's look (`?look=`), or null for the default. */
  look: string | null;
  /** Hub layout for scene shots (`?layout=`), or null for the default. Scripts name their own. */
  layout: string | null;
  /** Region for the region scene (`?region=`), or null for its default. */
  region: string | null;
  /** How long to sample frame times on a scene shot. */
  fpsMs: number;
  /** How long to wait for window.__ready. */
  timeoutMs: number;
}

export const DEFAULT_RUN: Omit<RunOptions, 'outDir'> = {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  reducedMotion: false,
  look: null,
  layout: null,
  region: null,
  fpsMs: 2000,
  timeoutMs: 30000,
};

export type ServerMode = 'started' | 'reused' | 'external';

export interface Session {
  baseUrl: string;
  mode: ServerMode;
  browser: Browser;
  browserName: string;
  git: { commit: string | null; dirty: boolean | null };
  /** Close the browser, and the server if this session started it. */
  close(): Promise<void>;
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

export interface ShotLog {
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
  /** The page ran with prefers-reduced-motion: reduce (--reduced-motion). */
  reducedMotion: boolean;
  /** The bean's look (--look), or null for the default. */
  look: string | null;
  server: ServerMode;
  console: { errors: number; warnings: number; entries: ConsoleEntry[] };
  fps: FpsSample | null;
  sceneState: unknown;
}

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
  reducedMotion: boolean;
  look: string | null;
  server: ServerMode;
  /** Every non-shot step run so far, in order. */
  inputs: ScriptInputLog[];
  /** Console output since the page loaded (cumulative). */
  console: { errors: number; warnings: number; entries: ConsoleEntry[] };
  sceneState: unknown;
}

export function gitInfo(): { commit: string | null; dirty: boolean | null } {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' });
    return { commit, dirty: status.trim().length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

async function isOurApp(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return (await res.text()).includes(APP_MARKER);
  } catch {
    return null; // nothing listening
  }
}

/**
 * Our own Vite server by default, on a free port: a long-running `pnpm dev` can go stale (in
 * M1 session 3 it stopped seeing new source files and answered 500), and nothing here ever
 * depends on it. `--reuse` opts back into using it.
 */
async function ensureServer(opts: SessionOptions): Promise<{ baseUrl: string; mode: ServerMode; server?: ViteDevServer }> {
  if (opts.baseUrl) return { baseUrl: opts.baseUrl, mode: 'external' };
  let port = opts.port;
  if (opts.reuse) {
    const probe = `http://localhost:${port ?? DEV_PORT}/`;
    const ours = await isOurApp(probe);
    if (ours) return { baseUrl: probe, mode: 'reused' };
    console.log(`shot: --reuse found ${ours === null ? 'nothing' : 'another app'} on port ${port ?? DEV_PORT}; starting a server on a free port.`);
    port = undefined;
  }
  const server = await createServer({
    root: CLIENT,
    configFile: join(CLIENT, 'vite.config.ts'),
    server: port === undefined ? { port: 0, strictPort: false } : { port, strictPort: true },
    plugins: opts.vitePlugins ?? [],
    logLevel: 'warn',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error('Vite started but reported no local URL.');
  return { baseUrl, mode: 'started', server };
}

export async function openSession(opts: SessionOptions = {}): Promise<Session> {
  const { baseUrl, mode, server } = await ensureServer(opts);
  let browser: Browser;
  try {
    // Chromium's new headless mode renders WebGL on the GPU when there is one; the default
    // headless shell always uses SwiftShader, which logs GPU-stall warnings for WebGL canvases.
    browser = await chromium.launch({
      headless: !opts.headed,
      ...(opts.softwareGl ? {} : { channel: 'chromium' }),
    });
  } catch (err) {
    await server?.close();
    throw err;
  }
  return {
    baseUrl,
    mode,
    browser,
    browserName: `chromium ${browser.version()}${opts.softwareGl ? ' (headless shell)' : ''}`,
    git: gitInfo(),
    async close() {
      await browser.close();
      await server?.close();
    },
  };
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
async function openPage(session: Session, run: RunOptions) {
  const entries: ConsoleEntry[] = [];
  const context = await session.browser.newContext({
    viewport: { width: run.width, height: run.height },
    deviceScaleFactor: run.deviceScaleFactor,
    reducedMotion: run.reducedMotion ? 'reduce' : 'no-preference',
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

export function errorMessage(err: unknown): string {
  return err instanceof Error ? (err.message.split('\n')[0] ?? String(err)) : String(err);
}

function sceneUrl(session: Session, scene: string, paused: boolean, look: string | null, layout: string | null, region: string | null = null): URL {
  const url = new URL(session.baseUrl);
  url.searchParams.set(URL_PARAM_SCENE, scene);
  if (paused) url.searchParams.set(URL_PARAM_PAUSED, '1');
  if (layout) url.searchParams.set(URL_PARAM_LAYOUT, layout);
  if (region) url.searchParams.set(URL_PARAM_REGION, region);
  if (look) url.searchParams.set(URL_PARAM_LOOK, look);
  return url;
}

/**
 * Open a scene, optionally step its sim to time t (paused), sample fps, and write
 * `<outDir>/<scene>[_t<time>].png` and `.json`.
 */
export async function shootScene(session: Session, scene: string, t: number | undefined, run: RunOptions): Promise<ShotLog> {
  const base = t === undefined ? scene : `${scene}_t${t.toFixed(3)}`;
  const pngPath = join(run.outDir, `${base}.png`);
  const url = sceneUrl(session, scene, t !== undefined, run.look, run.layout, run.region);
  const { context, page, entries } = await openPage(session, run);

  const log: ShotLog = {
    ok: false,
    error: null,
    note: null,
    scene,
    url: url.toString(),
    requestedSimTime: t ?? null,
    simTime: null,
    screenshot: null,
    git: session.git,
    timestamp: new Date().toISOString(),
    viewport: { width: run.width, height: run.height },
    browser: session.browserName,
    glRenderer: null,
    reducedMotion: run.reducedMotion,
    look: run.look,
    server: session.mode,
    console: { errors: 0, warnings: 0, entries },
    fps: null,
    sceneState: null,
  };

  try {
    await page.goto(url.toString(), { waitUntil: 'load' });
    await waitForReady(page, run.timeoutMs);
    if (t !== undefined) {
      if ((await callGame<number | null>(page, 'simTime()')) === null) {
        log.note = 'scene has no sim; --t ignored and the scene was shot live';
      } else {
        await callGame(page, `advanceTo(${t})`);
      }
    }
    log.fps = await measureFps(page, run.fpsMs);
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
  writeFileSync(join(run.outDir, `${base}.json`), `${JSON.stringify(log, null, 2)}\n`);
  return log;
}

/** One line for a scene shot, plus its error, note and console entries. */
export function describeShot(log: ShotLog): string[] {
  const t = log.requestedSimTime;
  const label = t === null ? log.scene : `${log.scene} t=${t.toFixed(3)}`;
  const fps = log.fps ? `${log.fps.avgFps} fps` : 'no fps';
  const time = log.simTime === null ? '' : `, sim ${log.simTime.toFixed(3)} s`;
  const lines = [
    `${log.ok ? 'ok  ' : 'FAIL'} ${label} -> ${log.screenshot ?? '(no png)'} ` +
      `(${log.console.errors} errors, ${log.console.warnings} warnings, ${fps}${time})`,
  ];
  if (log.error) lines.push(`     error: ${log.error}`);
  if (log.note) lines.push(`     note: ${log.note}`);
  for (const e of log.console.entries) lines.push(`     ${e.type}: ${e.text.split('\n')[0]}`);
  return lines;
}

export interface ScriptResult {
  script: string;
  failures: number;
  /** What the run printed, one entry per line (kept together when scripts run in parallel). */
  lines: string[];
}

/**
 * Run one script: open its scene paused, send each input through Playwright's keyboard and
 * mouse (so the client's own input handling turns it into sim commands), advance the sim only
 * on `wait` steps, and write a PNG plus a JSON log for each `shot` step into
 * `<outDir>/<outName>/`, plus run.json.
 */
export async function runScript(session: Session, scriptPath: string, outName: string, run: RunOptions): Promise<ScriptResult> {
  const relScript = relative(REPO, scriptPath).replaceAll('\\', '/');
  const lines: string[] = [];
  const result = (failures: number): ScriptResult => ({ script: relScript, failures, lines });
  let script: ShotScript;
  try {
    script = parseScript(JSON.parse(readFileSync(scriptPath, 'utf8')));
  } catch (err) {
    lines.push(`FAIL ${relScript}: ${errorMessage(err)}`);
    return result(1);
  }
  // outName is validated (scriptOutputName), so this is always a direct child of the output.
  const outDir = join(run.outDir, outName);
  if (dirname(outDir) !== run.outDir) throw new Error(`refusing output folder ${outDir}`);
  // Start clean so a run that fails early leaves no older shots beside its run.json. Only this
  // tool's own files (top-level .png and .json) are removed; nothing else, and no subfolders.
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir, { withFileTypes: true })) {
      if (f.isFile() && /\.(png|json)$/.test(f.name)) rmSync(join(outDir, f.name));
    }
  }
  mkdirSync(outDir, { recursive: true });

  const url = sceneUrl(session, script.scene, true, run.look, script.layout ?? null);
  const { context, page, entries } = await openPage(session, run);
  const inputs: ScriptInputLog[] = [];
  let failures = 0;
  let runError: string | null = null;
  let glRenderer: string | null;
  const simTime = () => callGame<number | null>(page, 'simTime()');

  lines.push(`script ${relScript} (scene ${script.scene}${script.layout ? `, layout ${script.layout}` : ''}${run.look ? `, look ${run.look}` : ''})`);
  try {
    await page.goto(url.toString(), { waitUntil: 'load' });
    await waitForReady(page, run.timeoutMs);
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
          git: session.git,
          timestamp: new Date().toISOString(),
          viewport: { width: run.width, height: run.height },
          browser: session.browserName,
          glRenderer,
          reducedMotion: run.reducedMotion,
          look: run.look,
          server: session.mode,
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
        lines.push(
          `${log.ok ? 'ok  ' : 'FAIL'} ${step.shot} -> ${log.screenshot ?? '(no png)'} ` +
            `(${log.console.errors} errors, ${log.console.warnings} warnings${time})`,
        );
        if (log.error) lines.push(`     error: ${log.error}`);
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
  const runLog = { ok, error: runError, script: relScript, scene: script.scene, url: url.toString(), git: session.git, inputs, console: summary };
  writeFileSync(join(outDir, 'run.json'), `${JSON.stringify(runLog, null, 2)}\n`);
  if (runError) lines.push(`FAIL ${relScript}: ${runError}`);
  for (const e of summary.entries) lines.push(`     ${e.type}: ${e.text.split('\n')[0]}`);
  return result(ok ? 0 : Math.max(failures, 1));
}

/**
 * Run several scripts, up to `jobs` at a time, each in its own browser context. Scripts step a
 * paused sim explicitly, so running them side by side gives the same states. Each script's
 * lines are printed together when it finishes.
 */
export async function runScripts(
  session: Session,
  scripts: readonly { path: string; outName: string }[],
  run: RunOptions,
  jobs = 1,
  print: (line: string) => void = console.log,
): Promise<ScriptResult[]> {
  const results: ScriptResult[] = new Array<ScriptResult>(scripts.length);
  let next = 0;
  const worker = async () => {
    while (next < scripts.length) {
      const i = next++;
      const s = scripts[i] as { path: string; outName: string };
      const r = await runScript(session, s.path, s.outName, run);
      for (const line of r.lines) print(line);
      results[i] = r;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, scripts.length)) }, worker));
  return results;
}

/** Load the page without ?scene= and ask the game for its default and registered scenes. */
export async function listScenes(session: Session, timeoutMs: number): Promise<{ defaultScene: string; all: string[] }> {
  const page = await session.browser.newPage();
  try {
    await page.goto(session.baseUrl, { waitUntil: 'load' });
    await waitForReady(page, timeoutMs);
    return {
      defaultScene: await callGame<string>(page, 'sceneName'),
      all: await callGame<string[]>(page, 'sceneNames.slice()'),
    };
  } finally {
    await page.close();
  }
}

/** Every script file in tools/shot/scripts/ (optionally only names starting with `prefix`). */
export function allScripts(prefix = ''): string[] {
  return readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
    .sort()
    .map((f) => join(SCRIPTS_DIR, f));
}
