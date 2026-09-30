// Cosmetics never touch the sim (D25): run every hub script in the default look and in other
// looks, and require the sim state of every shot to be identical.
//   pnpm shot:check-looks [--port <n>] [--reuse] [--jobs <n>]
// Each look runs through the real game (`?look=`), so this also catches the client turning a
// look into different commands (for example a tap hitting a bigger drawing). One server and one
// browser serve every look.
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareStates } from './compare-states';
import { scriptOutputName } from './script';
import { allScripts, DEFAULT_RUN, lookFolder, openSession, parseJobs, REPO, runScripts, type Session } from './session';

export const SHOTS = join(REPO, 'artifacts/shots');
/** Every headwear, the pattern and the face, in three colours (one of them light). */
export const LOOKS = ['blue,spots,bow,glasses', 'cream,sprout', 'violet,spots,bear-ears,glasses'];

/** The hub scripts, as paths and output names. */
export const hubScripts = () => allScripts('hub').map((path) => ({ path, outName: scriptOutputName(basename(path)) }));

/** Run `scripts` in one look (null for the default) into artifacts/shots[/look-<ids>]. Returns the failures. */
export async function runLook(
  session: Session,
  look: string | null,
  scripts: readonly { path: string; outName: string }[],
  jobs: number,
  print: (line: string) => void = console.log,
): Promise<number> {
  const outDir = look ? join(SHOTS, `look-${lookFolder(look)}`) : SHOTS;
  const results = await runScripts(session, scripts, { ...DEFAULT_RUN, outDir, look }, jobs, print);
  return results.reduce((n, r) => n + r.failures, 0);
}

/** Compare every look's sim states with the default look's. */
export function compareLooks(scriptNames: readonly string[]): { compared: number; failures: number; lines: string[] } {
  const out = { compared: 0, failures: 0, lines: [] as string[] };
  for (const look of LOOKS) {
    const { compared, failures, lines } = compareStates(SHOTS, join(SHOTS, `look-${lookFolder(look)}`), scriptNames);
    for (const line of lines) if (!line.startsWith('same')) out.lines.push(line);
    out.lines.push(`${failures === 0 ? 'ok  ' : 'FAIL'} ${look}: ${compared} sim states compared with the default look, ${failures} differ`);
    out.compared += compared;
    out.failures += failures;
  }
  return out;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { port: { type: 'string' }, reuse: { type: 'boolean', default: false }, jobs: { type: 'string', default: '4' } },
  });
  const jobs = parseJobs(values.jobs);
  const scripts = hubScripts();
  const session = await openSession({ port: values.port === undefined ? undefined : Number(values.port), reuse: values.reuse });
  let runFailures = 0;
  try {
    for (const look of [null, ...LOOKS]) runFailures += await runLook(session, look, scripts, jobs);
  } finally {
    await session.close();
  }
  const { failures, lines } = compareLooks(scripts.map((s) => s.outName));
  for (const line of lines) console.log(line);
  console.log(failures === 0 ? 'all looks give identical sim states' : `${failures} difference(s): a cosmetic reached the sim`);
  if (runFailures) console.log(`${runFailures} shot(s) failed while running the looks`);
  return failures + runFailures === 0 ? 0 : 1;
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
