import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Anything that would make the sim impure. The Vitest boundary test
// (packages/sim/test/boundary.test.ts) is the real gate; these rules give editor feedback.
const IMPURE_GLOBALS = [
  'window', 'document', 'navigator', 'self', 'globalThis', 'localStorage', 'sessionStorage',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'requestAnimationFrame', 'performance',
  'setTimeout', 'setInterval', 'Date', 'process', 'crypto',
];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'artifacts/**', 'reference/**', 'art/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/client/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.ts', 'packages/*/test/**/*.ts', '.claude/**/*.mjs', '*.config.{js,ts}', 'packages/*/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tools/share/site/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['packages/sim/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['phaser', 'phaser/*'], message: 'The sim is pure: no Phaser.' },
          { group: ['@beananza/client', '**/client/**'], message: 'The sim must not import client code.' },
        ],
      }],
      'no-restricted-globals': ['error', ...IMPURE_GLOBALS],
      'no-restricted-properties': ['error', {
        object: 'Math', property: 'random', message: 'Use the seeded RNG (packages/sim/src/rng.ts).',
      }],
    },
  },
);
