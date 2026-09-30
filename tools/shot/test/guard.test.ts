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

describe('the guard hook', { timeout: 30_000 }, () => {
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

  it('blocks the other ways onto main and onto the share site (review round 1)', () => {
    const cases: [string, string, RegExp][] = [
      ['gh pr merge 3 --squash', onBranch, /merges a pull request/],
      ['git push origin tools/prep:main', onBranch, /pushes to main/],
      ['git push origin HEAD:refs/heads/main', onBranch, /pushes to main/],
      ['git push origin main', onBranch, /pushes to main/],
      ['git push --delete origin main', onBranch, /pushes to main/],
      ['git push', onMain, /pushes to main/],
      ['git fetch . tools/prep:main', onBranch, /local main/],
      [`git -C "${onMain}" merge x`, onBranch, /while on main/],
      [`cd "${onMain}" && git merge tools/prep`, onBranch, /while on main/],
      ['git pull', onMain, /pull while on main/],
      ['git branch -f main HEAD', onBranch, /main branch/],
      ['npx wrangler deploy', onBranch, /Cloudflare/],
      ['wrangler secret put SITE_PASSWORD', onBranch, /Cloudflare/],
      ['wrangler d1 migrations apply beananza-comments --remote', onBranch, /Cloudflare/],
      ['pnpm share:migrate', onBranch, /share site/],
    ];
    for (const [c, cwd, why] of cases) expect(run(c, cwd), c).toMatch(why);
  });

  it('blocks the round 2 bypasses: HEAD on main, moving main, mirror and --all, other runners, nested shells', () => {
    const cases: [string, string, RegExp][] = [
      ['git push -u origin HEAD', onMain, /pushes to main/],
      ['git push origin @', onMain, /pushes to main/],
      ['git push origin HEAD:main', onBranch, /pushes to main/],
      ['git checkout -B main tools/prep && git push origin', onBranch, /moves the main branch/],
      ['git switch -C main tools/prep', onBranch, /moves the main branch/],
      ['git update-ref refs/heads/main HEAD', onBranch, /moves the main branch/],
      ['git branch -d main', onBranch, /main branch/],
      ['git push --mirror origin', onBranch, /force-pushes \(or mirrors\)/],
      ['git push --all origin', onBranch, /pushes to main/],
      ['npm --prefix tools/share run cf-deploy', onBranch, /share site/],
      ['cd tools/share && npm run cf-deploy', onBranch, /share site/],
      ['yarn share:password', onBranch, /share site/],
      [`(cd "${onMain}" && git merge x)`, onBranch, /while on main/],
      [`bash -c 'cd "${onMain}" && git merge x'`, onBranch, /while on main/],
      ['git rebase tools/prep main', onBranch, /rewrites main/],
      ['git reset --hard HEAD~1', onMain, /reset while on main/],
    ];
    for (const [c, cwd, why] of cases) expect(run(c, cwd), c).toMatch(why);
  });

  it('does not block a command that only mentions a blocked one (round 2)', () => {
    for (const c of [
      'git commit -m "docs: never git push origin main"',
      'echo "git push origin main" > notes.txt',
      'git log --grep="gh pr merge"',
      'git checkout -b x main && git merge tools/prep',
      'git push -u origin HEAD',
      'git log main..HEAD',
      'git diff main...tools/prep',
      'git worktree add -b x C:/bz-x main',
      'git pull origin main',
    ]) {
      expect(run(c, onBranch), c).toBeNull();
    }
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
      'git push',
      'git push --no-verify -u origin tools/prep',
      'git fetch origin main',
      'git -c user.name=t commit -m "fix: git merge on main is blocked"',
      'wrangler deploy --dry-run',
      `git -C "${onMain}" status`,
      `cd "${onMain}" && git log -1`,
      'gh pr view 3',
    ]) {
      expect(run(c, onBranch), c).toBeNull();
    }
    expect(run('git status', onMain)).toBeNull();
  });
});
