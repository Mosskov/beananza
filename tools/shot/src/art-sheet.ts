// pnpm art:sheet: the review sheet for an art change. Shoots the bean and looks galleries and
// the hub (the props) twice, with the art as it is now and with the art of a git ref (default
// HEAD), both drawn by the current code, and puts before, after and the difference side by side.
//   pnpm art:sheet [--base <ref>] [--scale <n>] [--out <dir>]
// The "before" server answers every `?raw` import under art/ with `git show <ref>:art/…`, so
// no second checkout is needed (the game loads all its SVGs that way). Writes <out>/sheet.png
// (every scene), <out>/zoom.png (only what changed, cropped), and before/, after/, diff/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Plugin } from 'vite';
import { chromium } from 'playwright';
import { DEFAULT_RUN, openSession, REPO, shootScene, type SessionOptions } from './session';
import { composeSheet, diffPngs, pngSize, type Diff, type SheetItem } from './sheet';
import type { Rect } from './sheet-layout';

/** What the sheet shows: the two galleries, and the hub paused at t = 0 for the props. */
const SCENES: { scene: string; t?: number }[] = [{ scene: 'bean' }, { scene: 'looks' }, { scene: 'hub', t: 0 }];

/** The repo-relative art path an import id points at (`art/bean/front.svg`), or null. */
export function artPathOf(id: string, repo: string): string | null {
  const [path, query] = id.split('?');
  if (query !== 'raw' || !path) return null;
  const norm = path.replaceAll('\\', '/');
  const art = `${repo.replaceAll('\\', '/')}/art/`;
  if (!norm.toLowerCase().startsWith(art.toLowerCase())) return null;
  return `art/${norm.slice(art.length)}`;
}

/** A Vite plugin that serves the art of `ref` instead of the working tree's. */
function artAtRef(ref: string, notes: string[]): Plugin {
  return {
    name: 'beananza-art-at-ref',
    enforce: 'pre',
    load(id) {
      const rel = artPathOf(id, REPO);
      if (!rel) return null;
      let text: string;
      try {
        text = execFileSync('git', ['show', `${ref}:${rel}`], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        notes.push(`${rel} is new since ${ref}; "before" uses the current file`);
        text = readFileSync(join(REPO, rel), 'utf8');
      }
      return `export default ${JSON.stringify(text)};`;
    },
  };
}

/** The changed box grown by a margin, at least `min` wide and high, inside the image. */
export function zoomBox(box: Rect, size: { w: number; h: number }, margin: number, min: number): Rect {
  const w = Math.min(size.w, Math.max(min, box.w + 2 * margin));
  const h = Math.min(size.h, Math.max(min, box.h + 2 * margin));
  const x = Math.max(0, Math.min(size.w - w, Math.round(box.x + box.w / 2 - w / 2)));
  const y = Math.max(0, Math.min(size.h - h, Math.round(box.y + box.h / 2 - h / 2)));
  return { x, y, w, h };
}

const sceneName = (s: { scene: string; t?: number }) => (s.t === undefined ? s.scene : `${s.scene}_t${s.t.toFixed(3)}`);

async function shootAll(session: SessionOptions, outDir: string, scale: number): Promise<{ errors: string[] }> {
  const s = await openSession(session);
  const errors: string[] = [];
  try {
    for (const { scene, t } of SCENES) {
      const log = await shootScene(s, scene, t, { ...DEFAULT_RUN, outDir, deviceScaleFactor: scale, fpsMs: 100 });
      if (!log.ok) errors.push(`${scene}: ${log.error ?? `${log.console.errors} console error(s): ${log.console.entries[0]?.text.split('\n')[0] ?? ''}`}`);
    }
  } finally {
    await s.close();
  }
  return { errors };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'HEAD' },
      scale: { type: 'string', default: '2' },
      out: { type: 'string', default: 'artifacts/art' },
    },
  });
  const ref = values.base;
  const scale = Number(values.scale);
  const out = resolve(REPO, values.out);
  const refName = `${ref} (${execFileSync('git', ['rev-parse', '--short', ref], { cwd: REPO, encoding: 'utf8' }).trim()})`;
  const changedFiles = execFileSync('git', ['diff', '--name-only', ref, '--', 'art'], { cwd: REPO, encoding: 'utf8' }).trim();
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'art'], { cwd: REPO, encoding: 'utf8' }).trim();
  const files = [changedFiles, untracked].filter(Boolean).join('\n');
  for (const d of ['before', 'after', 'diff']) rmSync(join(out, d), { recursive: true, force: true });

  const notes: string[] = [];
  const after = await shootAll({}, join(out, 'after'), scale);
  const before = await shootAll({ vitePlugins: [artAtRef(ref, notes)] }, join(out, 'before'), scale);
  if (after.errors.length) {
    for (const e of after.errors) console.log(`FAIL after: ${e}`);
    return 1;
  }

  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const rows: { name: string; before: Buffer | null; after: Buffer; diff: Diff | null }[] = [];
    for (const s of SCENES) {
      const name = sceneName(s);
      const a = readFileSync(join(out, 'after', `${name}.png`));
      const b = before.errors.length ? null : readFileSync(join(out, 'before', `${name}.png`));
      const diff = b ? await diffPngs(browser, b, a) : null;
      if (diff?.png) {
        mkdirSync(join(out, 'diff'), { recursive: true });
        writeFileSync(join(out, 'diff', `${name}.png`), diff.png);
      }
      rows.push({ name, before: b, after: a, diff });
    }

    const changed = rows.filter((r) => r.diff && r.diff.changed !== 0);
    const items: SheetItem[] = changed.length
      ? rows.flatMap((r) => [
          ...(r.before ? [{ label: `${r.name}: before, ${refName}`, png: r.before }] : []),
          { label: `${r.name}: after, working tree`, png: r.after },
          ...(r.diff?.png ? [{ label: `${r.name}: ${r.diff.changed} px changed`, png: r.diff.png }] : []),
        ])
      : rows.map((r) => ({ label: `${r.name}: no change against ${refName}`, png: r.after }));
    const cols = changed.length ? 3 : rows.length;
    const title = changed.length ? `Art: ${refName} → working tree` : `Art: no change against ${refName}`;
    writeFileSync(join(out, 'sheet.png'), await composeSheet(browser, items, { crop: null, cols, scale: 0.3, title }));

    const zoomItems: SheetItem[] = changed.flatMap((r) => {
      const d = r.diff as Diff;
      if (!d.box || !d.png || !r.before) return [];
      const crop = zoomBox(d.box, pngSize(r.after), 40 * scale, 200 * scale);
      return [
        { label: `${r.name}: before`, png: r.before, crop },
        { label: `${r.name}: after`, png: r.after, crop },
        { label: `${r.name}: changed`, png: d.png, crop },
      ];
    });
    rmSync(join(out, 'zoom.png'), { force: true });
    if (zoomItems.length) writeFileSync(join(out, 'zoom.png'), await composeSheet(browser, zoomItems, { crop: null, cols: 3, scale: 1 / scale, title: `What changed (${refName} → working tree)` }));

    const rel = (p: string) => relative(REPO, p).replaceAll('\\', '/');
    console.log(`art:sheet against ${refName}`);
    console.log(files ? `art files changed:\n${files.replace(/^/gm, '  ')}` : 'art files changed: none');
    for (const n of notes) console.log(`note: ${n}`);
    for (const e of before.errors) console.log(`note: "before" did not render (${e}); the sheet shows only the after images`);
    for (const r of rows) {
      const d = r.diff;
      const what = !d ? 'no before' : !d.sameSize ? 'sizes differ' : d.changed === 0 ? 'no change' : `${d.changed} px changed in x ${d.box?.x}–${(d.box?.x ?? 0) + (d.box?.w ?? 0)}, y ${d.box?.y}–${(d.box?.y ?? 0) + (d.box?.h ?? 0)} (${scale}× pixels)`;
      console.log(`  ${r.name.padEnd(10)} ${what}`);
    }
    console.log(`sheet: ${rel(join(out, 'sheet.png'))}${zoomItems.length ? `; zoom: ${rel(join(out, 'zoom.png'))}` : ''}`);
  } finally {
    await browser.close();
  }
  return 0;
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
