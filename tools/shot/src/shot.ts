// tools/shot: open a registered scene in headless Chromium, optionally step its sim to an exact
// time, and write a PNG plus a JSON log (console errors and warnings, fps, sim time, git commit).
// Usage: see printHelp() or README.md. The work itself is in session.ts.
import { mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { scriptOutputNames } from './script';
import { DEFAULT_RUN, describeShot, listScenes, lookFolder, openSession, REPO, runScripts, shootScene, type RunOptions, type SessionOptions } from './session';

function printHelp(): void {
  console.log(`Usage: pnpm shot [options]

  --scene <name>   Scene to shoot (repeatable). Default: the game's default scene.
  --all            Shoot every registered scene.
  --script <file>  Run a scripted playthrough (repeatable; JSON, see README.md). The scene
                   starts paused; keys and taps go through Playwright's keyboard and mouse,
                   and only "wait" steps advance the sim, in whole fixed steps.
                   Cannot be combined with --scene, --all or --t.
  --jobs <n>       Run up to n scripts at once, each in its own page (default: 1). The
                   results are the same; only the order of the printed lines changes.
  --t <seconds>    Pause the sim at t = 0, step it to this time, then shoot (repeatable).
                   Without --t the scene runs live and is shot after the fps sample.
                   Scenes without a sim ignore --t (noted in the log).
  --out <dir>      Output directory (default: artifacts/shots).
  --port <n>       Start our own dev server on exactly this port. Default: a free port.
  --reuse          Reuse the app's dev server on --port (default 5180) if it runs there,
                   else start our own on a free port.
  --url <url>      Use this server instead (e.g. a preview build); nothing is started.
  --fps-ms <ms>    How long to sample frame times (default: 2000).
  --width <px>     Viewport width (default: 1280).
  --height <px>    Viewport height (default: 720).
  --scale <n>      Device pixels per CSS pixel (default: 1).
  --timeout <ms>   How long to wait for window.__ready (default: 30000).
  --headed         Show the browser window.
  --software-gl    Use the headless shell with SwiftShader (no GPU) instead of Chromium's
                   new headless mode, which uses the GPU when there is one.
  --reduced-motion Emulate prefers-reduced-motion: reduce. Output goes to
                   <out>/reduced-motion/ so it never overwrites the normal shots.
  --look <ids>     The bean's look, e.g. blue,spots,bow,glasses (?look=, D25). Output goes
                   to <out>/look-<ids>/ so it never overwrites the normal shots.

Writes <out>/<scene>[_t<time>].png and .json; a script writes
<out>/<script name>/<shot name>.png and .json, plus run.json. Exits non-zero if any shot has a console
error, a page error, a failed request, or does not become ready.`);
}

interface Options {
  scenes: string[];
  all: boolean;
  scripts: string[];
  jobs: number;
  times: (number | undefined)[];
  session: SessionOptions;
  run: RunOptions;
}

function parseOptions(): Options | null {
  const { values } = parseArgs({
    options: {
      scene: { type: 'string', multiple: true },
      all: { type: 'boolean', default: false },
      script: { type: 'string', multiple: true },
      jobs: { type: 'string', default: '1' },
      t: { type: 'string', multiple: true },
      out: { type: 'string', default: 'artifacts/shots' },
      port: { type: 'string' },
      reuse: { type: 'boolean', default: false },
      url: { type: 'string' },
      'fps-ms': { type: 'string', default: String(DEFAULT_RUN.fpsMs) },
      width: { type: 'string', default: String(DEFAULT_RUN.width) },
      height: { type: 'string', default: String(DEFAULT_RUN.height) },
      scale: { type: 'string', default: '1' },
      timeout: { type: 'string', default: String(DEFAULT_RUN.timeoutMs) },
      headed: { type: 'boolean', default: false },
      'software-gl': { type: 'boolean', default: false },
      'reduced-motion': { type: 'boolean', default: false },
      look: { type: 'string' },
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
    // Like --out, relative script paths resolve against the repo root (pnpm runs this tool
    // from tools/shot, so the working directory says nothing useful).
    scripts: scripts.map((f) => resolve(REPO, f)),
    jobs: Math.max(1, Math.floor(num('jobs', values.jobs))),
    times: times && times.length > 0 ? times : [undefined],
    session: {
      port: values.port === undefined ? undefined : num('port', values.port),
      reuse: values.reuse,
      baseUrl: values.url,
      headed: values.headed,
      softwareGl: values['software-gl'],
    },
    run: {
      outDir: resolve(REPO, values.out, ...(values.look ? [`look-${lookFolder(values.look)}`] : []), ...(values['reduced-motion'] ? ['reduced-motion'] : [])),
      look: values.look ?? null,
      fpsMs: num('fps-ms', values['fps-ms']),
      width: num('width', values.width),
      height: num('height', values.height),
      deviceScaleFactor: num('scale', values.scale) || 1,
      reducedMotion: values['reduced-motion'],
      timeoutMs: num('timeout', values.timeout),
    },
  };
}

async function main(): Promise<number> {
  const opts = parseOptions();
  if (!opts) return 0;
  mkdirSync(opts.run.outDir, { recursive: true });

  const session = await openSession(opts.session);
  let failures = 0;
  try {
    console.log(`shot: ${session.baseUrl} (${session.mode} server), ${session.browser.version()}`);
    if (opts.scripts.length > 0) {
      const outNames = scriptOutputNames(opts.scripts.map((p) => basename(p)));
      const results = await runScripts(
        session,
        opts.scripts.map((path, i) => ({ path, outName: outNames[i] as string })),
        opts.run,
        opts.jobs,
      );
      failures = results.reduce((n, r) => n + r.failures, 0);
      return failures === 0 ? 0 : 1;
    }
    let scenes = opts.scenes;
    if (opts.all || scenes.length === 0) {
      const listed = await listScenes(session, opts.run.timeoutMs);
      scenes = opts.all ? listed.all : [listed.defaultScene];
    }
    for (const scene of scenes) {
      for (const t of opts.times) {
        const log = await shootScene(session, scene, t, opts.run);
        if (!log.ok) failures += 1;
        for (const line of describeShot(log)) console.log(line);
      }
    }
  } finally {
    await session.close();
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
