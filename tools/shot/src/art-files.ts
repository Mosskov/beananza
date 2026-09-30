// The art as the art tools read it: every SVG under art/, from disk, keyed by repo path.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { ArtFiles } from '@beananza/client/art/checks';
import { REPO } from './session';

/** Every `.svg` under `<repo>/art/`, keyed by repo path with forward slashes. */
export function readArt(repo = REPO): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.svg')) files[relative(repo, path).replaceAll('\\', '/')] = readFileSync(path, 'utf8');
    }
  };
  walk(join(repo, 'art'));
  return files;
}

/**
 * A file argument as a repo path (`art/bean/side.svg`). Relative arguments are taken from where
 * the command was typed (pnpm runs the tool in its package folder and keeps that in INIT_CWD).
 */
export function repoPath(arg: string, repo = REPO): string {
  const abs = resolve(process.env.INIT_CWD ?? repo, arg);
  const rel = relative(repo, abs).replaceAll('\\', '/');
  if (rel.startsWith('..') || !existsSync(abs)) throw new Error(`no such file in the repo: ${arg}`);
  return rel;
}

/** A folder argument expands to the art files under it. */
export function expandArtArgs(args: readonly string[], art: ArtFiles, repo = REPO): string[] {
  return args.flatMap((arg) => {
    const rel = repoPath(arg, repo);
    if (statSync(join(repo, rel)).isDirectory()) {
      const prefix = rel === '' ? '' : `${rel}/`;
      return Object.keys(art).filter((p) => p.startsWith(prefix));
    }
    return [rel];
  });
}
