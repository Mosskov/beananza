// The PreToolUse guard (.claude/hooks/guard.mjs), run as Claude Code runs it: a hook payload on
// stdin, a deny decision (or nothing) on stdout.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO } from '../src/session';

const GUARD = join(REPO, '.claude/hooks/guard.mjs');

function run(command: string, cwd: string, tool = 'Bash'): string | null {
  const out = execFileSync(process.execPath, [GUARD], { input: JSON.stringify({ tool_name: tool, tool_input: { command }, cwd }), encoding: 'utf8' });
  if (!out.trim()) return null;
  const decision = JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } };
  expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
  return decision.hookSpecificOutput.permissionDecisionReason;
}

describe('the guard hook', () => {
  let onMain = '';
  let onBranch = '';
  beforeAll(() => {
    const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' });
    onMain = mkdtempSync(join(tmpdir(), 'guard-main-'));
    git(onMain, 'init', '-q', '-b', 'main');
    git(onMain, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
    onBranch = mkdtempSync(join(tmpdir(), 'guard-branch-'));
    git(onBranch, 'init', '-q', '-b', 'tools/prep');
    git(onBranch, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
  });
  afterAll(() => {
    for (const d of [onMain, onBranch]) if (d) rmSync(d, { recursive: true, force: true });
  });

  it('blocks deploying and re-keying the share site', () => {
    expect(run('pnpm share:deploy', onBranch)).toMatch(/share site.*Ask the user/);
    expect(run('pnpm run share:password', onBranch, 'PowerShell')).toMatch(/share site/);
    expect(run('pnpm check && pnpm --filter @beananza/share cf-deploy', onBranch)).toMatch(/share site/);
  });

  it('blocks every kind of force-push', () => {
    for (const c of ['git push --force', 'git push -f origin x', 'git push --force-with-lease', 'git push -uf origin x', 'git push origin +main']) {
      expect(run(c, onBranch), c).toMatch(/force-pushes/);
    }
  });

  it('blocks merging and rebasing on main, and switching to main to merge', () => {
    expect(run('git merge tools/prep', onMain)).toMatch(/on main/);
    expect(run('git rebase origin/main', onMain, 'PowerShell')).toMatch(/on main/);
    expect(run('git -C . merge x', onMain)).toMatch(/on main/);
    expect(run('git checkout main && git merge tools/prep', onBranch)).toMatch(/on main/);
  });

  it('lets the everyday commands through', () => {
    for (const c of [
      'git status',
      'git log --oneline -5',
      'git diff main -- tools/shot/golden',
      'git push -u origin tools/prep',
      'git merge main',
      'git rebase main',
      'pnpm verify --no-check --scripts hub-walk',
      'pnpm art:part art/bean/side.svg',
      'pnpm share:dry-run',
      'git commit -m "tools: the guard hook"',
    ]) {
      expect(run(c, onBranch), c).toBeNull();
    }
    expect(run('git status', onMain)).toBeNull();
  });
});
