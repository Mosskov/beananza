// pnpm art:check [files or folders...]: the art contract checks as a command, on the given files
// or all of art/. One line per finding, and a non-zero exit if there is any. The checks are the
// game's own (packages/client/src/art/checks.ts), which the contract tests assert on too.
// Every check reads the whole art set (a view is checked against the others), then the
// findings are filtered to the files asked for.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artFileKind, checkArt } from '@beananza/client/art/checks';
import { expandArtArgs, readArt } from './art-files';

export function main(args: readonly string[]): number {
  const art = readArt();
  const asked = args.length ? [...new Set(expandArtArgs(args, art))] : Object.keys(art);
  const loaded = asked.filter((f) => artFileKind(f).kind !== 'reference');
  for (const f of asked) if (artFileKind(f).kind === 'reference') console.log(`skip    ${f} (reference art: the game does not load it, so the contract does not apply)`);
  const findings = checkArt(art).filter((f) => asked.includes(f.file) || (args.length === 0 && !loaded.includes(f.file)));
  for (const f of findings) console.log(`${f.file}: ${f.message}`);
  console.log(`art:check: ${loaded.length} file(s) checked, ${findings.length} finding(s)`);
  return findings.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  }
}
