/**
 * Reads the repo's markdown docs into the pieces the share site shows. Pure: text in, data out.
 * Every lookup throws when the doc no longer has the expected shape, so a restructured doc
 * breaks `pnpm share` loudly instead of silently dropping a section.
 */

export type DecisionStatus = 'confirmed' | 'partly' | 'open' | 'parked';

export interface Decision {
  id: string;
  topic: string;
  options: string;
  leaning: string;
  /** The status cell as written (markdown). */
  statusText: string;
  status: DecisionStatus;
}

export interface Milestone {
  number: number;
  title: string;
  /** Markdown body without the "Done when" line. */
  body: string;
  /** Markdown of the "Done when" line, without its label. */
  doneWhen: string | null;
  progress: 'done' | 'in-progress' | 'planned';
}

/** Split a markdown table row into trimmed cells. A pipe inside a cell is escaped (`\|`, GFM). */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replaceAll('\\|', '|'));
}

export function decisionStatus(statusText: string): DecisionStatus {
  const plain = statusText.replace(/\*\*/g, '').trim();
  if (/^Confirmed\b/.test(plain)) return 'confirmed';
  if (/^Partly confirmed\b/.test(plain)) return 'partly';
  if (/^Open\b/.test(plain)) return 'open';
  if (/^Parked\b/.test(plain)) return 'parked';
  throw new Error(`DECISIONS.md: unknown status "${plain.slice(0, 40)}"`);
}

/** The decision table in docs/DECISIONS.md. */
export function parseDecisions(md: string): Decision[] {
  const rows = md.split('\n').filter((l) => /^\|\s*D\d+\s*\|/.test(l));
  if (rows.length === 0) throw new Error('DECISIONS.md: no decision rows found');
  return rows.map((row) => {
    const c = cells(row);
    if (c.length !== 5) throw new Error(`DECISIONS.md: expected 5 cells in "${row.slice(0, 40)}…", got ${c.length}`);
    const [id, topic, options, leaning, statusText] = c as [string, string, string, string, string];
    return { id, topic, options, leaning, statusText, status: decisionStatus(statusText) };
  });
}

/**
 * The markdown under a heading, up to the next heading of the same or a higher level.
 * `heading` matches the start of the heading text, e.g. "2. Core loop" or "Milestone 0".
 */
export function section(md: string, level: number, heading: string): string {
  const lines = md.split('\n');
  const marker = '#'.repeat(level) + ' ';
  const start = lines.findIndex((l) => l.startsWith(marker) && l.slice(marker.length).startsWith(heading));
  if (start < 0) throw new Error(`no "${marker}${heading}" heading`);
  const end = lines.findIndex((l, i) => i > start && /^#{1,6} /.test(l) && l.indexOf(' ') <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

/** The text of a heading that starts with `heading` (for titles that carry a status tag). */
export function headingText(md: string, level: number, heading: string): string {
  const marker = '#'.repeat(level) + ' ';
  const line = md.split('\n').find((l) => l.startsWith(marker) && l.slice(marker.length).startsWith(heading));
  if (!line) throw new Error(`no "${marker}${heading}" heading`);
  return line.slice(marker.length).trim();
}

/**
 * Milestones from docs/ROADMAP.md. Progress comes from docs/STATUS.md: a milestone is done when
 * STATUS has a "## Milestone N" report, in progress when it has "## MN, session …" reports only.
 */
export function parseRoadmap(roadmap: string, status: string): Milestone[] {
  const statusHeadings = status.split('\n').filter((l) => l.startsWith('## '));
  const found = [...roadmap.matchAll(/^## Milestone (\d+): (.+)$/gm)];
  if (found.length === 0) throw new Error('ROADMAP.md: no "## Milestone N: title" headings');
  return found.map((m) => {
    const number = Number(m[1]);
    const lines = section(roadmap, 2, `Milestone ${number}:`).split('\n');
    // The "Done when" bullet plus its indented continuation lines.
    const start = lines.findIndex((l) => /\*\*Done when:\*\*/.test(l));
    let end = start + 1;
    while (start >= 0 && end < lines.length && /^\s+\S/.test(lines[end]!)) end++;
    const body = (start >= 0 ? [...lines.slice(0, start), ...lines.slice(end)] : lines).join('\n').trim();
    const doneWhen =
      start >= 0
        ? lines.slice(start, end).map((l) => l.trim()).join(' ').replace(/^-\s*\*\*Done when:\*\*\s*/, '')
        : null;
    const done = statusHeadings.some((h) => h.startsWith(`## Milestone ${number}:`));
    const started = statusHeadings.some((h) => h.startsWith(`## M${number},`));
    return { number, title: m[2]!.trim(), body, doneWhen, progress: done ? 'done' : started ? 'in-progress' : 'planned' };
  });
}

/** The newest report in docs/STATUS.md (the first "## " section), with its title. */
export function latestStatus(status: string): { title: string; body: string } {
  const line = status.split('\n').find((l) => l.startsWith('## '));
  if (!line) throw new Error('STATUS.md: no "## " report');
  const title = line.slice(3).trim();
  return { title, body: section(status, 2, title) };
}
