/**
 * pnpm share: builds the team preview site into artifacts/share/.
 *
 *   index.html, site.css, site.js, fonts/   the page, rendered from docs/
 *   play/                                   a production build of the game (relative paths)
 *   shots/                                  screenshots taken from that same build
 *
 * The folder is static: any file server can host it. Screenshots need Playwright's Chromium
 * (pnpm shot:install).
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { headingText, latestStatus, parseDecisions, parseRoadmap, section } from './docs';
import { renderPage } from './page';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = resolve(HERE, '..');
const REPO = resolve(TOOL, '../..');
const CLIENT = join(REPO, 'packages/client');
const OUT = join(REPO, 'artifacts/share');
const WORK = join(REPO, 'artifacts/share-work');

/** DESIGN.md sections shown to teachers, by the start of their heading. */
const TEACHER_SECTIONS = ['1. ', '2. ', '8. ', '10. ', '11. ', '12. '];

/** Private claude.ai links must never reach a public page. */
const FORBIDDEN = /claude\.ai\/(artifact|code|chat)/;

const doc = (name: string) => readFileSync(join(REPO, 'docs', name), 'utf8');

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
}

function step(text: string): void {
  console.log(`share: ${text}`);
}

async function buildGame(): Promise<void> {
  await build({
    root: CLIENT,
    configFile: join(CLIENT, 'vite.config.ts'),
    // Relative asset paths, so the game works from play/ on any host.
    base: './',
    build: { outDir: join(OUT, 'play'), emptyOutDir: true },
    logLevel: 'warn',
  });
}

/** Screenshot the build that ships, not the dev server. */
async function takeShots(): Promise<void> {
  const server = await preview({
    root: CLIENT,
    configFile: join(CLIENT, 'vite.config.ts'),
    base: './',
    build: { outDir: join(OUT, 'play') },
    preview: { port: 0, strictPort: false },
    logLevel: 'warn',
  });
  try {
    const url = server.resolvedUrls?.local[0];
    if (!url) throw new Error('vite preview reported no local URL');
    // Async, so this process keeps serving the preview while the shots run. One command string
    // through the shell, because pnpm is a .cmd shim on Windows; every part is a fixed string,
    // a localhost URL or a repo path without spaces.
    const shot = (args: string) =>
      new Promise<void>((done, fail) => {
        const cmd = `pnpm shot --url ${url} --out "${WORK.replace(/\\/g, '/')}" ${args}`;
        spawn(cmd, { cwd: REPO, stdio: 'inherit', shell: true }).on('exit', (code) =>
          code === 0 ? done() : fail(new Error(`${cmd} failed (exit ${code})`)),
        );
      });
    await shot('--scene hub --scene bean');
    await shot('--script tools/shot/scripts/hub-carts-push.json');
  } finally {
    await new Promise<void>((done) => server.httpServer.close(() => done()));
  }
  mkdirSync(join(OUT, 'shots'), { recursive: true });
  copyFileSync(join(WORK, 'hub.png'), join(OUT, 'shots/hub.png'));
  copyFileSync(join(WORK, 'bean.png'), join(OUT, 'shots/bean.png'));
  copyFileSync(join(WORK, 'hub-carts-push/pushing-b.png'), join(OUT, 'shots/carts.png'));
}

function copyStatic(): void {
  for (const f of ['site.css', 'site.js']) copyFileSync(join(TOOL, 'site', f), join(OUT, f));
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  const fonts: [string, string][] = [
    ['fredoka', 'fredoka-latin-500-normal.woff2'],
    ['fredoka', 'fredoka-latin-600-normal.woff2'],
    ['nunito', 'nunito-latin-400-normal.woff2'],
    ['nunito', 'nunito-latin-700-normal.woff2'],
    ['caveat', 'caveat-latin-500-normal.woff2'],
  ];
  for (const [pkg, file] of fonts) copyFileSync(join(TOOL, 'node_modules/@fontsource', pkg, 'files', file), join(OUT, 'fonts', file));
}

function writePage(): void {
  const design = doc('DESIGN.md');
  const implementation = doc('IMPLEMENTATION.md');
  const status = doc('STATUS.md');
  const html = renderPage({
    teacherSections: TEACHER_SECTIONS.map((h) => {
      const heading = headingText(design, 2, h);
      return { heading, body: section(design, 2, heading) };
    }),
    milestones: parseRoadmap(doc('ROADMAP.md'), status),
    decisions: parseDecisions(doc('DECISIONS.md')),
    status: latestStatus(status),
    architecture: (() => {
      const heading = headingText(implementation, 2, '3. Architecture rules');
      return { heading, body: section(implementation, 2, heading) };
    })(),
    shots: [
      { src: 'shots/hub.png', alt: 'The hub plaza: a bean, a tree and two carts on a rail, each with a speed readout.', caption: 'The hub plaza' },
      { src: 'shots/carts.png', alt: 'The bean leaning into a cart it is pushing, with the cart speed shown in metres per second.', caption: 'Pushing a cart' },
      { src: 'shots/bean.png', alt: 'The bean drawn in all eight directions and in walk, run and jump poses.', caption: 'One bean, eight directions' },
    ],
    build: { commit: git(['rev-parse', '--short', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0, date: new Date().toISOString().slice(0, 10) },
  });
  const leak = FORBIDDEN.exec(html);
  if (leak) throw new Error(`the page contains a private link (${leak[0]}); remove it from the docs section it comes from`);
  writeFileSync(join(OUT, 'index.html'), html);
}

function folderSize(dir: string): number {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + statSync(join(e.parentPath, e.name)).size, 0);
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  step('building the game into play/');
  await buildGame();
  step('taking screenshots of that build');
  await takeShots();
  step('rendering the page from docs/');
  copyStatic();
  writePage();
  step(`done: ${relative(REPO, OUT)} (${(folderSize(OUT) / 1e6).toFixed(1)} MB). Serve it with pnpm share:preview (http://localhost:4190)`);
}

main().catch((err: unknown) => {
  console.error(`share: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
