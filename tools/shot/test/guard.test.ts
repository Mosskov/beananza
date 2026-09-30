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

  it('blocks rewriting main: rebasing or resetting on it, and switching to main to rebase', () => {
    expect(run('git rebase origin/main', onMain, 'PowerShell')).toMatch(/rebase while on main/);
    expect(run('git -C . reset --hard x', onMain)).toMatch(/reset while on main/);
    expect(run('git checkout main && git rebase tools/prep', onBranch)).toMatch(/rebase while on main/);
    expect(run(`git -C "${onMain}" rebase x`, onBranch)).toMatch(/while on main/);
    expect(run(`cd "${onMain}" && git reset HEAD~1`, onBranch)).toMatch(/while on main/);
  });

  it('blocks deleting main on the remote, and the other ways onto the share site (review round 1)', () => {
    const cases: [string, string, RegExp][] = [
      ['gh pr merge 3 --squash', onBranch, /merges a pull request/],
      ['git push --delete origin main', onBranch, /deletes main/],
      ['git push origin -d main', onMain, /deletes main/],
      ['git push origin :main', onBranch, /deletes main/],
      ['git push origin :refs/heads/main', onBranch, /deletes main/],
      ['git fetch . tools/prep:main', onBranch, /local main/],
      ['git branch -f main HEAD', onBranch, /main branch/],
      ['npx wrangler deploy', onBranch, /Cloudflare/],
      ['wrangler secret put SITE_PASSWORD', onBranch, /Cloudflare/],
      ['wrangler d1 migrations apply beananza-comments --remote', onBranch, /Cloudflare/],
      ['pnpm share:migrate', onBranch, /share site/],
    ];
    for (const [c, cwd, why] of cases) expect(run(c, cwd), c).toMatch(why);
  });

  it('blocks the round 2 bypasses: moving main, mirror, other runners, nested shells', () => {
    const cases: [string, string, RegExp][] = [
      ['git checkout -B main tools/prep && git push origin', onBranch, /moves the main branch/],
      ['git switch -C main tools/prep', onBranch, /moves the main branch/],
      ['git update-ref refs/heads/main HEAD', onBranch, /moves the main branch/],
      ['git branch -d main', onBranch, /main branch/],
      ['git push --mirror origin', onBranch, /force-pushes \(or mirrors\)/],
      ['git push -f origin main', onMain, /force-pushes/],
      ['npm --prefix tools/share run cf-deploy', onBranch, /share site/],
      ['cd tools/share && npm run cf-deploy', onBranch, /share site/],
      ['yarn share:password', onBranch, /share site/],
      [`(cd "${onMain}" && git rebase x)`, onBranch, /while on main/],
      [`bash -c 'cd "${onMain}" && git reset --hard x'`, onBranch, /while on main/],
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

  it('lets a session work on main: commit, pull, merge, revert and a plain push of main', () => {
    for (const c of [
      'git commit -m "art: the stars"',
      'git pull',
      'git pull --ff-only origin main',
      'git merge origin/main',
      'git revert HEAD',
      'git cherry-pick abc123',
      'git push',
      'git push origin main',
      'git push -u origin HEAD',
      'git push origin @',
      'git push --all origin',
      `cd "${onMain}" && git merge x`,
    ]) {
      expect(run(c, onMain), c).toBeNull();
    }
    for (const c of ['git push origin tools/prep:main', 'git push origin HEAD:refs/heads/main', 'git checkout main && git merge tools/prep']) {
      expect(run(c, onBranch), c).toBeNull();
    }
  });
});
