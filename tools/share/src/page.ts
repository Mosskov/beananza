/**
 * Renders the share site's index.html from the parsed docs. Pure: data in, HTML out.
 * Section text comes from the docs; only the pitch, the section intros and the labels are
 * written here.
 */
import { Marked } from 'marked';
import type { Decision, DecisionStatus, Milestone } from './docs';

export interface PageInput {
  teacherSections: { heading: string; body: string }[];
  milestones: Milestone[];
  decisions: Decision[];
  status: { title: string; body: string };
  architecture: { heading: string; body: string };
  shots: { src: string; alt: string; caption: string }[];
  build: { commit: string; dirty: boolean; date: string };
}

/** Scenes a visitor can open in the embedded game, by `?scene=` name. */
export const PLAY_SCENES: readonly { scene: string; label: string }[] = [
  { scene: 'hub', label: 'Hub plaza' },
  { scene: 'bean', label: 'Bean in every direction' },
  { scene: 'drop', label: 'Drop test' },
];

const marked = new Marked({ gfm: true, async: false });

/** Block markdown; wide tables scroll inside their own box on narrow screens. */
const md = (text: string) =>
  (marked.parse(text) as string).replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');
const mdInline = (text: string) => marked.parseInline(text) as string;

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "1. Vision and audience (Explored)" → title "Vision and audience", tag "Explored". */
export function splitHeading(heading: string): { title: string; tag: string | null } {
  const m = /^(?:\d+\.\s*)?(.*?)\s*\((explored|proposed|open|parked)\)\s*$/i.exec(heading);
  if (!m) return { title: heading.replace(/^\d+\.\s*/, ''), tag: null };
  const tag = m[2]!.toLowerCase();
  return { title: m[1]!, tag: tag[0]!.toUpperCase() + tag.slice(1) };
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
  confirmed: 'Confirmed',
  partly: 'Partly confirmed',
  open: 'Open',
  parked: 'Parked',
};

/** Shape icons so status never depends on colour alone. */
const STATUS_ICON: Record<DecisionStatus, string> = {
  confirmed: '<circle cx="8" cy="8" r="6"/>',
  partly: '<circle cx="8" cy="8" r="5.25" fill="none" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z"/>',
  open: '<circle cx="8" cy="8" r="5.25" fill="none" stroke-width="1.5"/>',
  parked: '<rect x="3" y="7" width="10" height="2" rx="1"/>',
};

const PROGRESS_LABEL: Record<Milestone['progress'], string> = { done: 'Done', 'in-progress': 'In progress', planned: 'Planned' };
const PROGRESS_STATUS: Record<Milestone['progress'], DecisionStatus> = { done: 'confirmed', 'in-progress': 'partly', planned: 'open' };

function badge(kind: DecisionStatus, label: string): string {
  return `<span class="badge badge-${kind}"><svg viewBox="0 0 16 16" aria-hidden="true">${STATUS_ICON[kind]}</svg>${esc(label)}</span>`;
}

function tagChip(tag: string | null): string {
  return tag ? ` <span class="tag" title="${esc(TAG_HELP[tag] ?? '')}">${esc(tag)}</span>` : '';
}

const TAG_HELP: Record<string, string> = {
  Explored: 'Prototyped or mocked up. The direction is liked, but not final.',
  Proposed: 'Recommended, still needs confirming.',
  Open: 'Undecided.',
  Parked: 'Deliberately set aside for now.',
};

function hero(): string {
  const sceneButtons = PLAY_SCENES.map(
    (s, i) => `<button type="button" class="scene" data-scene="${esc(s.scene)}" aria-pressed="${i === 0}">${esc(s.label)}</button>`,
  ).join('');
  return `
<header class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <h1>Beananza</h1>
      <p class="pitch">A browser game for high school physics. Students explore a shared world where physics is the rulebook: they predict what will happen, test it, and compare.</p>
      <p class="caveat-note"><strong>Early exploration.</strong> Nothing here is final: every choice is a proposal we are testing with small prototypes.</p>
    </div>
    <svg class="arc" viewBox="0 0 400 160" aria-hidden="true">
      <path class="arc-path" d="M10 150 Q 190 -40 390 150"/>
      <circle class="arc-start" cx="10" cy="150" r="5"/>
    </svg>
  </div>
  <div class="wrap">
    <figure class="game">
      <div class="game-frame">
        <iframe id="game" title="Beananza game" allow="fullscreen" loading="lazy"></iframe>
        <button type="button" class="play" id="play">
          <img src="shots/hub.png" alt="" />
          <span class="play-label">Play in your browser</span>
        </button>
      </div>
      <figcaption>
        <div class="scenes" role="group" aria-label="Scene">${sceneButtons}</div>
        <p class="controls">
          <span><kbd>Arrows</kbd> or <kbd>WASD</kbd> or tap to move</span>
          <span><kbd>Shift</kbd> run</span>
          <span><kbd>Space</kbd> jump</span>
          <span><kbd>E</kbd> use what is nearby</span>
          <a href="play/?scene=hub" id="open-full" target="_blank" rel="noopener">Open on its own page</a>
        </p>
        <p class="hand">Try pushing a cart, then watch its speed in m/s.</p>
      </figcaption>
    </figure>
  </div>
</header>`;
}

function nav(): string {
  return `
<nav class="nav" aria-label="Sections">
  <div class="wrap">
    <a href="#teachers">Teachers</a>
    <a href="#roadmap">Roadmap</a>
    <a href="#decisions">Decisions</a>
    <a href="#developers">Developers</a>
  </div>
</nav>`;
}

function teachers(input: PageInput): string {
  const shots = input.shots
    .map((s) => `<figure class="shot"><img src="${esc(s.src)}" alt="${esc(s.alt)}" loading="lazy" width="1280" height="720" /><figcaption>${esc(s.caption)}</figcaption></figure>`)
    .join('');
  const parts = input.teacherSections
    .map((s) => {
      const { title, tag } = splitHeading(s.heading);
      return `<article class="topic"><h3>${esc(title)}${tagChip(tag)}</h3>${md(s.body)}</article>`;
    })
    .join('');
  return `
<section id="teachers" class="band">
  <div class="wrap">
    <h2>For teachers</h2>
    <p class="lede">What students do, what they learn, and how it fits a class period. Tags show how settled each part is: <span class="tag">Explored</span> means prototyped and liked but not final, <span class="tag">Proposed</span> means recommended but not yet confirmed.</p>
    <div class="shots">${shots}</div>
    <div class="topics">${parts}</div>
  </div>
</section>`;
}

function roadmap(input: PageInput): string {
  const items = input.milestones
    .map(
      (m) => `
<li class="milestone milestone-${m.progress}">
  <div class="milestone-head">
    <span class="milestone-number" aria-hidden="true">${m.number}</span>
    <h3>Milestone ${m.number}: ${mdInline(m.title)}</h3>
    ${badge(PROGRESS_STATUS[m.progress], PROGRESS_LABEL[m.progress])}
  </div>
  <div class="milestone-body">${md(m.body)}${m.doneWhen ? `<p class="done-when"><strong>Done when:</strong> ${mdInline(m.doneWhen)}</p>` : ''}</div>
</li>`,
    )
    .join('');
  return `
<section id="roadmap" class="band band-plain">
  <div class="wrap">
    <h2>Roadmap</h2>
    <p class="lede">Each milestone lands as several small, playable steps. The plan itself is a proposal.</p>
    <ol class="milestones">${items}</ol>
  </div>
</section>`;
}

function decisions(input: PageInput): string {
  const counts = (s: DecisionStatus) => input.decisions.filter((d) => d.status === s).length;
  const filters = [
    `<button type="button" class="filter" data-filter="all" aria-pressed="true">All <span>${input.decisions.length}</span></button>`,
    ...(['open', 'partly', 'confirmed', 'parked'] as const).map(
      (s) => `<button type="button" class="filter" data-filter="${s}" aria-pressed="false">${STATUS_LABEL[s]} <span>${counts(s)}</span></button>`,
    ),
  ].join('');
  const rows = input.decisions
    .map(
      (d) => `
<li class="decision" id="${esc(d.id)}" data-status="${d.status}">
  <details>
    <summary>
      <span class="decision-id">${esc(d.id)}</span>
      <span class="decision-topic">${mdInline(d.topic)}</span>
      ${badge(d.status, STATUS_LABEL[d.status])}
    </summary>
    <dl>
      <dt>Options</dt><dd>${mdInline(d.options)}</dd>
      <dt>Current leaning</dt><dd>${mdInline(d.leaning)}</dd>
      <dt>Status</dt><dd>${mdInline(d.statusText)}</dd>
    </dl>
  </details>
</li>`,
    )
    .join('');
  return `
<section id="decisions" class="band">
  <div class="wrap">
    <h2>Decisions</h2>
    <p class="lede">Every design and technical choice, and how settled it is. Open decisions are where your views help most. Select a decision to see the options and notes.</p>
    <div class="filters" role="group" aria-label="Show decisions">${filters}</div>
    <ul class="decisions">${rows}</ul>
  </div>
</section>`;
}

function developers(input: PageInput): string {
  const { title, tag } = splitHeading(input.architecture.heading);
  return `
<section id="developers" class="band band-plain">
  <div class="wrap">
    <h2>For developers</h2>
    <p class="lede">TypeScript with Phaser and Vite, Planck.js for collisions, Vitest for tests. The physics sim is a pure package that the server can run later for group expeditions.</p>
    <article class="topic wide"><h3>${esc(title)}${tagChip(tag)}</h3>${md(input.architecture.body)}</article>
    <details class="report">
      <summary><h3>Latest status report: ${mdInline(input.status.title)}</h3></summary>
      <div class="report-body">${md(input.status.body)}</div>
    </details>
    <article class="topic wide">
      <h3>Run it locally</h3>
      <pre><code>pnpm install
pnpm dev          # the game at http://localhost:5180
pnpm check        # typecheck, lint, tests and build</code></pre>
    </article>
  </div>
</section>`;
}

export function renderPage(input: PageInput): string {
  const built = `Built from commit ${esc(input.build.commit)}${input.build.dirty ? ' with uncommitted changes' : ''} on ${esc(input.build.date)}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Beananza project preview</title>
<meta name="description" content="Beananza, a browser game for high school physics: play the prototype, see the roadmap and the open decisions." />
<link rel="icon" href="data:," />
<link rel="stylesheet" href="site.css" />
</head>
<body>
${hero()}
${nav()}
<main>
${teachers(input)}
${roadmap(input)}
${decisions(input)}
${developers(input)}
</main>
<footer class="footer"><div class="wrap"><p>${built}</p></div></footer>
<script src="site.js" defer></script>
</body>
</html>
`;
}
