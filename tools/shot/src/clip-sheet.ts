// pnpm clip:sheet <clip> [--views all|S,E,…|side,…] [--phases n] [--look ids] [--reduced-motion]
// One animation clip across its cycle: n phases (columns) in each chosen direction (rows), in
// one labelled image, drawn by the game's own rig and rig player (the `clip` tool scene) in
// headless Chromium. Writes artifacts/clips/<clip>[--<look>][-reduced-motion].png and .json;
// the JSON log holds every cell's pose, so a claim about a track can be read off it.
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CLIP_NAMES } from '@beananza/client/rig/clips';
import { pickDirections } from '@beananza/client/rig/views';
import { DEFAULT_RUN, describeShot, lookFolder, openSession, REPO, shootScene } from './session';

const OUT = join(REPO, 'artifacts/clips');
/** The clip scene's own query parameters (ClipSheetScene's CLIP_SHEET_PARAMS). */
const PARAMS = { clip: 'clip', views: 'views', phases: 'phases' } as const;

/** Output name: the clip, the look, and the motion setting. */
export const clipSheetName = (clip: string, look: string | null, reducedMotion: boolean) => `${clip}${look ? `--${lookFolder(look)}` : ''}${reducedMotion ? '-reduced-motion' : ''}`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: {
      views: { type: 'string', default: 'all' },
      phases: { type: 'string', default: '8' },
      look: { type: 'string' },
      'reduced-motion': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });
  const clip = positionals[0];
  if (values.help || !clip) {
    console.log(`Usage: pnpm clip:sheet <clip> [--views all|S,SE,…|front,side,…] [--phases n] [--look ids] [--reduced-motion]

  <clip>             one of ${CLIP_NAMES.join(', ')}
  --views            directions (S SE E NE N NW W SW) or view names; default all 8
  --phases           columns across the cycle (1 to 16, default 8); one-shot clips go start to end
  --look             the bean's look, as ?look=
  --reduced-motion   prefers-reduced-motion: the motion tracks drop, the still values hold`);
    return values.help ? 0 : 1;
  }
  if (!(CLIP_NAMES as readonly string[]).includes(clip)) throw new Error(`unknown clip "${clip}" (clips: ${CLIP_NAMES.join(', ')})`);
  pickDirections(values.views); // fail early on a typo
  const phases = Number(values.phases);
  if (!Number.isInteger(phases) || phases < 1 || phases > 16) throw new Error(`--phases must be a whole number from 1 to 16, got "${values.phases}"`);

  const reducedMotion = values['reduced-motion'];
  const look = values.look ?? null;
  const session = await openSession();
  let ok: boolean;
  const name = clipSheetName(clip, look, reducedMotion);
  try {
    const log = await shootScene(session, 'clip', undefined, {
      ...DEFAULT_RUN,
      outDir: OUT,
      deviceScaleFactor: 2,
      fpsMs: 100,
      reducedMotion,
      look,
      params: { [PARAMS.clip]: clip, [PARAMS.views]: values.views, [PARAMS.phases]: String(phases) },
    });
    ok = log.ok;
    for (const line of describeShot(log)) if (!/^(ok|FAIL) /.test(line)) console.log(line);
    renameSync(join(OUT, 'clip.png'), join(OUT, `${name}.png`));
    // The log names its screenshot; keep it pointing at the renamed file.
    log.screenshot = relative(REPO, join(OUT, `${name}.png`)).replaceAll('\\', '/');
    writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(log, null, 2)}\n`);
    rmSync(join(OUT, 'clip.json'));
  } finally {
    await session.close();
  }
  const rel = (f: string) => relative(REPO, join(OUT, f)).replaceAll('\\', '/');
  console.log(`clip:sheet ${ok ? 'ok' : 'FAIL'}: ${rel(`${name}.png`)} (poses in ${rel(`${name}.json`)})`);
  return ok ? 0 : 1;
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
