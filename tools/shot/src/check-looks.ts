// Cosmetics never touch the sim (D25): run every hub script in the default look and in other
// looks, and require the sim state of every shot to be identical.
//   pnpm shot:check-looks [--port <n>]   (default: a free port for each run)
// Each look runs through the real game (`?look=`), so this also catches the client turning a
// look into different commands (for example a tap hitting a bigger drawing).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareStates } from './compare-states';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SHOTS = join(REPO, 'artifacts/shots');
/** Every headwear, the pattern and the face, in three colours (one of them light). */
const LOOKS = ['blue,spots,bow,glasses', 'cream,sprout', 'violet,spots,bear-ears,glasses'];

const portIndex = process.argv.indexOf('--port');
const port = portIndex > 0 ? (process.argv[portIndex + 1] ?? '0') : '0';
const scripts = readdirSync(join(REPO, 'tools/shot/scripts'))
  .filter((f) => f.startsWith('hub') && f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

function shoot(look: string | null): void {
  const args = ['shot', '--port', port, ...scripts.flatMap((s) => ['--script', `tools/shot/scripts/${s}.json`]), ...(look ? ['--look', look] : [])];
  // One command string: pnpm is a .cmd shim on Windows, so it needs the shell.
  const run = spawnSync(`pnpm ${args.join(' ')}`, { cwd: REPO, stdio: 'inherit', shell: true });
  if (run.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed`);
}

shoot(null);
let failures = 0;
for (const look of LOOKS) {
  shoot(look);
  const folder = `look-${look.split(',').join('-')}`;
  const { compared, failures: f, lines } = compareStates(SHOTS, join(SHOTS, folder), scripts);
  for (const line of lines) if (!line.startsWith('same')) console.log(line);
  console.log(`${f === 0 ? 'ok  ' : 'FAIL'} ${look}: ${compared} sim states compared with the default look, ${f} differ`);
  failures += f;
}
console.log(failures === 0 ? 'all looks give identical sim states' : `${failures} difference(s): a cosmetic reached the sim`);
process.exitCode = failures === 0 ? 0 : 1;
