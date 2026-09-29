import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decisionStatus, latestStatus, parseDecisions, parseRoadmap, section } from '../src/docs';

const DOCS = join(import.meta.dirname, '../../../docs');
const doc = (name: string) => readFileSync(join(DOCS, name), 'utf8');

describe('decisions', () => {
  it('reads the status category from the start of the status cell', () => {
    expect(decisionStatus('**Confirmed** 2026-09-29: web')).toBe('confirmed');
    expect(decisionStatus('**Partly confirmed** 2026-09-29 (M1 session 2)')).toBe('partly');
    expect(decisionStatus('Open. 2026-09-29: Bean only for now')).toBe('open');
    expect(decisionStatus('Parked')).toBe('parked');
    expect(() => decisionStatus('Maybe')).toThrow(/unknown status/);
  });

  it('parses a table row into its five cells', () => {
    const md = '| ID | Topic | Options | Current leaning | Status |\n|---|---|---|---|---|\n| D2 | Hub layout | Town square, floating islands | Prototype a plaza | Open |';
    expect(parseDecisions(md)).toEqual([
      { id: 'D2', topic: 'Hub layout', options: 'Town square, floating islands', leaning: 'Prototype a plaza', statusText: 'Open', status: 'open' },
    ]);
  });

  it('rejects a row with the wrong number of cells', () => {
    expect(() => parseDecisions('| D1 | Hub camera | Open |')).toThrow(/expected 5 cells/);
  });

  it('reads every decision in docs/DECISIONS.md, in order', () => {
    const ds = parseDecisions(doc('DECISIONS.md'));
    expect(ds[0]?.id).toBe('D1');
    ds.forEach((d, i) => expect(d.id).toBe(`D${i + 1}`));
  });
});

describe('sections', () => {
  const md = '# Top\n## 1. One\nfirst\n### Sub\nnested\n## 2. Two\nsecond\n';

  it('includes subheadings and stops at the next heading of the same level', () => {
    expect(section(md, 2, '1. One')).toBe('first\n### Sub\nnested');
    expect(section(md, 2, '2. Two')).toBe('second');
  });

  it('throws when the heading is missing', () => {
    expect(() => section(md, 2, '3. Three')).toThrow(/no "## 3. Three" heading/);
  });
});

describe('roadmap', () => {
  const roadmap = '## Milestone 0: scaffold\n- a\n- **Done when:** it runs\n\n## Milestone 1: slice\n- b\n\n## Milestone 2: multiplayer\n- c\n';

  it('takes progress from the status reports', () => {
    const status = '## M1, session 2: carts\n...\n## Milestone 0: scaffold and verification loop\n...';
    expect(parseRoadmap(roadmap, status).map((m) => [m.number, m.progress])).toEqual([
      [0, 'done'],
      [1, 'in-progress'],
      [2, 'planned'],
    ]);
  });

  it('splits off the "Done when" line', () => {
    const [m0, m1] = parseRoadmap(roadmap, '');
    expect(m0?.body).toBe('- a');
    expect(m0?.doneWhen).toBe('it runs');
    expect(m1?.doneWhen).toBeNull();
  });

  it('keeps a wrapped "Done when" line together', () => {
    const [m] = parseRoadmap('## Milestone 1: slice\n1. a\n2. b\n- **Done when:** a student can walk the\n  plaza and push the carts.\n', '');
    expect(m?.body).toBe('1. a\n2. b');
    expect(m?.doneWhen).toBe('a student can walk the plaza and push the carts.');
  });

  it('reads docs/ROADMAP.md and docs/STATUS.md', () => {
    const ms = parseRoadmap(doc('ROADMAP.md'), doc('STATUS.md'));
    expect(ms[0]).toMatchObject({ number: 0, progress: 'done' });
    expect(ms.length).toBeGreaterThan(1);
  });
});

describe('status', () => {
  it('returns the first report', () => {
    expect(latestStatus('# Status\n\n## M1, session 2: carts\nbody\n## Milestone 0: x\nold')).toEqual({ title: 'M1, session 2: carts', body: 'body' });
  });
});
