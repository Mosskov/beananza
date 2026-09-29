import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkFiles, compileDiagnostics, findViolations, listTsFiles, type BoundaryRules, type Violation } from './boundary';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const simSrc = join(repo, 'packages/sim/src');
const sharedSrc = join(repo, 'packages/shared/src');
const simTsconfig = join(repo, 'packages/sim/tsconfig.json');
const rules: BoundaryRules = {
  allowedRoots: [simSrc, sharedSrc],
  allowedPackages: ['@beananza/shared'],
};
const format = (vs: Violation[]) => vs.map((v) => `${v.file}:${v.line} ${v.message}`);

describe('sim boundary', () => {
  it('packages/sim and packages/shared import no Phaser, client, DOM or network code', () => {
    const files = [...listTsFiles(simSrc), ...listTsFiles(sharedSrc)];
    expect(files.length).toBeGreaterThan(0);
    expect(format(checkFiles(files, rules))).toEqual([]);
  });

  it('packages/sim type-checks against the ES library only (no DOM, no Node types)', () => {
    const { options, messages } = compileDiagnostics(simTsconfig);
    expect(messages).toEqual([]);
    expect((options.lib ?? []).some((l) => /dom|webworker/i.test(l))).toBe(false);
    expect(options.types).toEqual([]);
  });

  // The checks above are only worth something if they can fail. Feed them known-bad code.
  describe('catches violations', () => {
    const fake = join(simSrc, '__fixture__.ts');
    const bad: Record<string, string> = {
      'phaser import': "import Phaser from 'phaser';",
      'phaser type import': "import type { Scene } from 'phaser';",
      'phaser re-export': "export * from 'phaser';",
      'dynamic phaser import': "const p = import('phaser');",
      'require call': "const p = require('phaser');",
      'import type query': "type G = typeof import('phaser');",
      'client code by path': "import { x } from '../../client/src/main';",
      'client package': "import { x } from '@beananza/client';",
      'node builtin': "import { readFileSync } from 'node:fs';",
      'document global': 'const b = document.body;',
      'window global': "window.addEventListener('x', () => {});",
      'globalThis': 'const w = globalThis;',
      'requestAnimationFrame': 'requestAnimationFrame(() => {});',
      'wall clock': 'const t = Date.now();',
      'performance clock': 'const t = performance.now();',
      'unseeded randomness': 'const r = Math.random();',
      'network': "fetch('/api');",
    };
    for (const [name, code] of Object.entries(bad)) {
      it(name, () => {
        expect(findViolations(fake, code, rules).length).toBeGreaterThan(0);
      });
    }

    it('allows clean sim code', () => {
      const code = [
        "import { PIXELS_PER_METER } from '@beananza/shared';",
        "import { createRng } from './rng';",
        'const o = { window: 1, document: 2 };',
        'export const x = Math.sqrt(PIXELS_PER_METER) + createRng(1).s + o.window;',
      ].join('\n');
      expect(format(findViolations(fake, code, rules))).toEqual([]);
    });

    it('the sim tsconfig rejects DOM and Node globals at type level', () => {
      const { messages } = compileDiagnostics(simTsconfig, {
        [fake]: 'export const t = document.title + String(setTimeout) + String(process);',
      });
      expect(messages.some((m) => m.includes("'document'"))).toBe(true);
      expect(messages.some((m) => m.includes("'setTimeout'"))).toBe(true);
      expect(messages.some((m) => m.includes("'process'"))).toBe(true);
    });
  });
});
