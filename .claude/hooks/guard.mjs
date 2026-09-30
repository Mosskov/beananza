// PreToolUse guard for Bash and PowerShell (.claude/settings.json). Blocks the commands a
// session must ask the user about first: changing the share site (deploy, secrets, remote
// migrations), force-pushing, and anything that lands on main (merging, rebasing or pulling on
// main, pushing to main, merging a PR). Reads the hook payload on stdin; prints a deny
// decision, or nothing to let the command through. Plain Node, no dependencies, so it runs the
// same on Windows, in CI and in cloud sessions.
import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

/** The current branch in `dir`, or null outside a repository. */
function branchIn(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const unquote = (s) => s.replace(/^["']|["']$/g, '');
const at = (base, p) => {
  const path = unquote(p).replace(/^\/([a-zA-Z])\//, '$1:/'); // Git Bash /c/… paths
  return isAbsolute(path) ? path : resolve(base, path);
};

const ASK = 'Ask the user before running it (CLAUDE.md: the user merges into main; never run pnpm share:deploy or pnpm share:password unless asked).';

/** Why `command`, run in `cwd`, needs the user first, or null. */
function verdict(command, cwd, branchOf = branchIn) {
  // One segment per command in a chain (;, &&, ||, |, newlines), so flags are read per command.
  const segments = command.split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
  let dir = cwd;
  let switchedToMain = false;
  for (const s of segments) {
    // Track `cd` / `Set-Location` so a later git command is judged in the right tree.
    const cd = /^(?:cd|Set-Location|pushd)\s+(?:-Path\s+)?("[^"]+"|'[^']+'|\S+)\s*$/i.exec(s);
    if (cd) {
      dir = at(dir, cd[1]);
      continue;
    }

    // The share site: its deploy, secrets and remote database, through pnpm or wrangler.
    if (/\bpnpm\b.*\b(share:deploy|share:password|share:migrate|cf-deploy|cf-password|cf-migrate)\b/.test(s)) {
      return `Blocked: "${s}" changes the team share site. ${ASK}`;
    }
    if (/\bwrangler\b/.test(s) && !/--dry-run\b/.test(s) && (/\b(deploy|publish|rollback|secret)\b/.test(s) || (/\bd1\b/.test(s) && /--remote\b/.test(s)))) {
      return `Blocked: "${s}" changes the team share site's Cloudflare worker. ${ASK}`;
    }

    // Merging a pull request lands it on main.
    if (/\bgh\b.*\bpr\s+merge\b/.test(s) || /\bgh\b.*\bapi\b.*\/merges?\b/.test(s)) {
      return `Blocked: "${s}" merges a pull request. The user merges. ${ASK}`;
    }

    const git = /\bgit\b((?:\s+-[Cc]\s+(?:"[^"]+"|'[^']+'|\S+)|\s+--?[\w-]+(?:=\S+)?)*)\s+([\w-]+)(.*)$/.exec(s);
    if (!git) continue;
    const [, opts, sub, rest] = git;
    const c = /-C\s+("[^"]+"|'[^']+'|\S+)/.exec(opts);
    const where = c ? at(dir, c[1]) : dir;
    const onMain = switchedToMain || branchOf(where) === 'main';
    const args = rest.trim().split(/\s+/).filter(Boolean).map(unquote);
    const toMain = (a) => /^\+?[^:]*:(refs\/heads\/)?main$/.test(a);

    if (sub === 'checkout' || sub === 'switch') {
      if (args.filter((a) => !a.startsWith('-')).at(-1) === 'main' || args[0] === 'main') switchedToMain = true;
      continue;
    }
    if (sub === 'push') {
      if (args.some((a) => /^--force(-with-lease|-if-includes)?(=.*)?$/.test(a) || /^-[A-Za-z]*f[A-Za-z]*$/.test(a) || /^\+/.test(a))) {
        return `Blocked: "${s}" force-pushes, which can discard others' commits. ${ASK}`;
      }
      const refs = args.filter((a) => !a.startsWith('-')).slice(1); // after the remote
      const deleting = args.includes('--delete') || args.includes('-d');
      if (refs.some((r) => toMain(r) || r === 'main' || r === 'refs/heads/main') || (deleting && refs.includes('main')) || (refs.length === 0 && onMain)) {
        return `Blocked: "${s}" pushes to main. Changes reach main through a pull request the user merges. ${ASK}`;
      }
      continue;
    }
    if (sub === 'fetch' && args.some(toMain)) {
      return `Blocked: "${s}" writes the local main branch. ${ASK}`;
    }
    if (['merge', 'rebase', 'pull', 'cherry-pick', 'am'].includes(sub) && onMain) {
      return `Blocked: "${s}" changes main (${sub} while on main). The user merges into main. ${ASK}`;
    }
    if (sub === 'branch' && args.some((a) => a === '-f' || a === '--force' || a === '-D' || a === '-M') && args.includes('main')) {
      return `Blocked: "${s}" moves or deletes the main branch. ${ASK}`;
    }
  }
  return null;
}

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return; // not a hook payload: let it through
  }
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return;
  const reason = verdict(command, payload.cwd ?? process.cwd());
  if (reason) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  }
}

await main();
