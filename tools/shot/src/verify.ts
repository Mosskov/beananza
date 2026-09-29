// pnpm verify: the whole verification pass in one command, with one dev server and one browser.
//   pnpm verify [--no-check] [--scripts a,b] [--baseline <dir>] [--jobs <n>] [--port <n>] [--reuse]
// Runs `pnpm check` (in the background while the scripts run), every script, the hub scripts in
// the check-looks looks, every scene live plus the baseline's timed shots, then check-carts,
// the looks comparison and compare-states against the newest docs/status/ folder. Prints the
// failures and a short summary; everything else goes to artifacts/verify/verify.log.
// `--scripts` runs only those scripts (between slices) and skips what they don't feed.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { CART_SCRIPTS, checkCarts } from './check-carts';
import { compareLooks, LOOKS, runLook, SHOTS } from './check-looks';
import { compareStates } from './compare-states';
import { scriptOutputName } from './script';
import { allScripts, DEFAULT_RUN, describeShot, errorMessage, listScenes, openSession, REPO, shootScene, type Session } from './session';

const OUT = join(REPO, 'artifacts/verify');

export interface Row {
  step: string;
  /** null: skipped. */
  ok: boolean | null;
  seconds: number | null;
  detail: string;
}

/** Folder names in natural order: m1-s9 before m1-s10. */
export function naturalSort(names: readonly string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** The newest evidence folder under docs/status/ (natural order), or null. */
export function newestStatusFolder(statusDir: string): string | null {
  if (!existsSync(statusDir)) return null;
  const dirs = readdirSync(statusDir).filter((n) => statSync(join(statusDir, n)).isDirectory());
  const last = naturalSort(dirs).at(-1);
  return last === undefined ? null : join(statusDir, last);
}

/** Timed scene shots (`drop_t1.000.json`) at the top of an evidence folder, as scene and time. */
export function timedShots(fileNames: readonly string[]): { scene: string; t: number }[] {
  return fileNames.flatMap((f) => {
    const m = /^([a-z0-9-]+)_t(\d+(?:\.\d+)?)\.json$/.exec(f);
    return m ? [{ scene: m[1] as string, t: Number(m[2]) }] : [];
  });
}

/** The script names `--scripts` asks for, checked against the ones that exist. */
export function pickScripts(wanted: string | undefined, available: readonly string[]): string[] {
  if (wanted === undefined) return [...available];
  const names = wanted
    .split(',')
    .map((s) => s.trim().replace(/\.json$/, ''))
    .filter(Boolean);
  const unknown = names.filter((n) => !available.includes(n));
  if (unknown.length) throw new Error(`unknown script(s): ${unknown.join(', ')} (have: ${available.join(', ')})`);
  return names;
}

export function formatRows(rows: readonly Row[]): string[] {
  const width = Math.max(...rows.map((r) => r.step.length));
  return rows.map((r) => {
    const result = r.ok === null ? 'skip' : r.ok ? 'ok  ' : 'FAIL';
    const time = r.seconds === null ? '     ' : `${r.seconds.toFixed(0).padStart(3)} s`;
    return `${r.step.padEnd(width)}  ${result}  ${time}  ${r.detail}`;
  });
}

/** Run `pnpm check` with its output in a file; resolves with the exit code and the test count. */
function runCheck(logFile: string): Promise<{ code: number; tests: string }> {
  return new Promise((done) => {
    const out = createWriteStream(logFile);
    // One command string: pnpm is a .cmd shim on Windows, so it needs the shell.
    const child = spawn('pnpm check', { cwd: REPO, shell: true });
    let text = '';
    const take = (chunk: Buffer) => {
      out.write(chunk);
      text += chunk.toString();
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code) => {
      out.end();
      const tests = /Tests\s+(\d+ passed[^\n]*)/.exec(stripVTControlCharacters(text))?.[1]?.trim() ?? 'no test count found';
      done({ code: code ?? 1, tests });
    });
  });
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'no-check': { type: 'boolean', default: false },
      scripts: { type: 'string' },
      baseline: { type: 'string' },
      jobs: { type: 'string', default: '4' },
      port: { type: 'string' },
      reuse: { type: 'boolean', default: false },
    },
  });
  const started = Date.now();
  mkdirSync(OUT, { recursive: true });
  const logPath = join(OUT, 'verify.log');
  const logLines: string[] = [];
  const log = (line: string) => logLines.push(line);
  const rows: Row[] = [];
  const secondsSince = (t: number) => (Date.now() - t) / 1000;
  const jobs = Math.max(1, Number(values.jobs));

  const available = allScripts().map((p) => scriptOutputName(basename(p)));
  const partial = values.scripts !== undefined;
  const names = pickScripts(values.scripts, available);
  const scripts = names.map((n) => ({ path: join(REPO, 'tools/shot/scripts', `${n}.json`), outName: n }));
  const hub = scripts.filter((s) => s.outName.startsWith('hub'));
  const baseline = values.baseline ? resolve(REPO, values.baseline) : newestStatusFolder(join(REPO, 'docs/status'));

  // 1. pnpm check, in the background while the scripts run (they need no fps).
  const checkStart = Date.now();
  const check = values['no-check'] ? null : runCheck(join(OUT, 'check.log'));

  // A crash (for example the browser closing under load) becomes a FAIL row for the step it hit,
  // and the summary still prints; the log checks are then skipped, as their inputs are partial.
  let phase = 'server';
  let crashed = false;
  const awaitCheck = async () => {
    if (rows.some((r) => r.step === 'check')) return;
    if (check) {
      const { code, tests } = await check;
      rows.unshift({ step: 'check', ok: code === 0, seconds: secondsSince(checkStart), detail: `${tests}; output in ${relative(REPO, join(OUT, 'check.log')).replaceAll('\\', '/')}` });
    } else {
      rows.unshift({ step: 'check', ok: null, seconds: null, detail: '--no-check' });
    }
  };
  let session: Session | undefined;
  try {
    session = await openSession({ port: values.port === undefined ? undefined : Number(values.port), reuse: values.reuse });
    log(`server ${session.baseUrl} (${session.mode}), ${session.browserName}`);

    // 2. Every chosen script, in the default look.
    phase = 'scripts';
    let t = Date.now();
    const scriptFailures = await runLook(session, null, scripts, jobs, log);
    const shotCount = logLines.filter((l) => /^(ok {2}|FAIL) /.test(l)).length;
    rows.push({ step: 'scripts', ok: scriptFailures === 0, seconds: secondsSince(t), detail: `${scripts.length} script(s), ${shotCount} shots` });

    // 3. The hub scripts in the other looks (D25).
    phase = 'looks';
    t = Date.now();
    if (hub.length) {
      let lookFailures = 0;
      for (const look of LOOKS) lookFailures += await runLook(session, look, hub, jobs, log);
      rows.push({ step: 'looks', ok: lookFailures === 0, seconds: secondsSince(t), detail: `${LOOKS.length} looks × ${hub.length} hub script(s)` });
    } else {
      rows.push({ step: 'looks', ok: null, seconds: null, detail: 'no hub script chosen' });
    }

    // 4. pnpm check must finish before the scenes, so their fps samples run on a quiet machine.
    await awaitCheck();

    // 5. Every scene live, plus the baseline's timed shots (e.g. drop at t = 1.0 and 1.5 s).
    phase = 'scenes';
    if (partial) {
      rows.push({ step: 'scenes', ok: null, seconds: null, detail: 'skipped with --scripts' });
    } else {
      t = Date.now();
      const scenes = (await listScenes(session, DEFAULT_RUN.timeoutMs)).all;
      const timed = baseline ? timedShots(readdirSync(baseline)) : [];
      const run = { ...DEFAULT_RUN, outDir: SHOTS };
      let failures = 0;
      const fps: string[] = [];
      for (const [scene, time] of [...scenes.map((s) => [s, undefined] as const), ...timed.map((s) => [s.scene, s.t] as const)]) {
        const shot = await shootScene(session, scene, time, run);
        if (!shot.ok) failures += 1;
        if (time === undefined && shot.fps) fps.push(`${scene} ${Math.round(shot.fps.avgFps)}`);
        for (const line of describeShot(shot)) log(line);
      }
      rows.push({ step: 'scenes', ok: failures === 0, seconds: secondsSince(t), detail: `${scenes.length} live + ${timed.length} timed; fps ${fps.join(', ')}` });
    }
  } catch (err) {
    crashed = true;
    rows.push({ step: phase, ok: false, seconds: null, detail: `crashed: ${errorMessage(err)}. Rerun it; if it happens again, it is not a one-off.` });
  } finally {
    await session?.close().catch(() => undefined);
  }
  await awaitCheck();

  // 6. The checks on the logs.
  if (crashed) {
    rows.push({ step: 'log checks', ok: null, seconds: null, detail: 'skipped: a step crashed, so the logs are partial' });
  } else {
    logChecks();
  }

  function logChecks(): void {
    const cartsRan = CART_SCRIPTS.every((s) => names.includes(s));
    if (cartsRan) {
      const carts = checkCarts(SHOTS);
      carts.lines.forEach(log);
      const checks = carts.lines.filter((l) => /^(ok {2}|FAIL) /.test(l)).length;
      rows.push({ step: 'check-carts', ok: carts.failures === 0, seconds: null, detail: `${checks} checks, ${carts.failures} failed` });
    } else {
      rows.push({ step: 'check-carts', ok: null, seconds: null, detail: `needs ${CART_SCRIPTS.join(', ')}` });
    }
    if (hub.length) {
      const looks = compareLooks(hub.map((s) => s.outName));
      looks.lines.forEach(log);
      rows.push({ step: 'looks-compare', ok: looks.failures === 0, seconds: null, detail: `${looks.compared} sim states against the default look, ${looks.failures} differ` });
    } else {
      rows.push({ step: 'looks-compare', ok: null, seconds: null, detail: 'no hub script chosen' });
    }
    if (baseline) {
      const cmp = compareStates(baseline, SHOTS, partial ? names : undefined);
      cmp.lines.forEach(log);
      const rel = relative(REPO, baseline).replaceAll('\\', '/');
      rows.push({ step: 'compare-states', ok: cmp.failures === 0, seconds: null, detail: `${cmp.compared} sim states against ${rel}, ${cmp.failures} differ or missing` });
    } else {
      rows.push({ step: 'compare-states', ok: null, seconds: null, detail: 'no docs/status/ folder' });
    }
  }

  const failed = rows.some((r) => r.ok === false);
  const table = formatRows(rows);
  const head = `verify: ${failed ? 'FAILED' : 'all passed'} in ${secondsSince(started).toFixed(0)} s${partial ? ` (only ${names.join(', ')})` : ''}`;
  writeFileSync(logPath, [...logLines, '', head, ...table, ''].join('\n'));

  // Print only what failed, then the summary.
  const failures = logLines.filter((l) => /^(FAIL|DIFF|MISSING)|^ {5}(error|pageerror|requestfailed)/.test(l));
  for (const line of failures.slice(0, 40)) console.log(line);
  if (failures.length > 40) console.log(`… and ${failures.length - 40} more in ${relative(REPO, logPath)}`);
  if (rows.some((r) => r.step === 'check' && r.ok === false)) console.log(`pnpm check failed; see ${relative(REPO, join(OUT, 'check.log')).replaceAll('\\', '/')}`);
  console.log(head);
  for (const line of table) console.log(line);
  console.log(`full log: ${relative(REPO, logPath).replaceAll('\\', '/')}; shots in artifacts/shots/`);
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 2;
    },
  );
}
