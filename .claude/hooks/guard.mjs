// PreToolUse guard for Bash and PowerShell (.claude/settings.json). Blocks the commands a
// session must ask the user about first: changing the share site (deploy, secrets, remote
// migrations), force-pushing, and anything that rewrites, moves or deletes main (rebasing or
// resetting on main, deleting main on origin, moving the main branch, merging a PR). Sessions
// work on main and push it (CLAUDE.md, "How we work"), so commits, pulls, merges and plain
// pushes of main pass. Reads the hook payload on stdin; prints a deny decision, or nothing to let the command through.
// Plain Node, no dependencies, so it runs the same on Windows, in CI and in cloud sessions.
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
/** Quoted text blanked out, so a commit message or an echo that mentions a command is not that command. */
const mask = (s) => s.replace(/"[^"]*"|'[^']*'/g, '""');

const ASK = 'Ask the user before running it (CLAUDE.md: never rewrite or delete main or merge a pull request, and never run pnpm share:deploy or pnpm share:password unless asked).';

/** Split a command line into simple commands (;, &&, ||, |, newlines), ignoring separators inside quotes. */
function segments(command) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') {
      if ((ch === '|' || ch === '&') && command[i + 1] === ch) i++;
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  // Subshell parentheses and braces only group; the commands inside are what run.
  return out.map((s) => s.trim().replace(/^[({]\s*/, '').replace(/\s*[)}]$/, '').trim()).filter(Boolean);
}

/** Why `command`, run in `cwd`, needs the user first, or null. */
function verdict(command, cwd, depth = 0) {
  let dir = cwd;
  let switchedToMain = false;
  for (const raw of segments(command)) {
    const s = mask(raw);

    // A nested shell: judge what it runs.
    const nested = /^(?:bash|sh|zsh|pwsh|powershell(?:\.exe)?)\b.*?\s-(?:c|Command)\s+("[^"]*"|'[^']*')/i.exec(raw);
    if (nested && depth < 3) {
      const inner = verdict(unquote(nested[1]), dir, depth + 1);
      if (inner) return inner;
      continue;
    }

    // Track `cd` / `Set-Location` so a later git command is judged in the right tree.
    const cd = /^(?:cd|Set-Location|pushd)\s+(?:-Path\s+)?("[^"]+"|'[^']+'|\S+)\s*$/i.exec(raw);
    if (cd) {
      dir = at(dir, cd[1]);
      continue;
    }

    // The share site: its deploy, secrets and remote database, through any runner or wrangler.
    if (/\b(pnpm|npm|yarn|npx|bun)\b.*\b(share:deploy|share:password|share:migrate|cf-deploy|cf-password|cf-migrate)\b/.test(s)) {
      return `Blocked: "${raw}" changes the team share site. ${ASK}`;
    }
    if (/\bwrangler\b/.test(s) && !/--dry-run\b/.test(s) && (/\b(deploy|publish|rollback|secret)\b/.test(s) || (/\bd1\b/.test(s) && /--remote\b/.test(s)))) {
      return `Blocked: "${raw}" changes the team share site's Cloudflare worker. ${ASK}`;
    }

    // Merging a pull request lands it on main.
    if (/^gh\b.*\bpr\s+merge\b/.test(s) || /^gh\b.*\bapi\b.*\/merges?\b/.test(s)) {
      return `Blocked: "${raw}" merges a pull request. The user merges. ${ASK}`;
    }

    const git = /^git((?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+)|\s+--?[\w-]+(?:=\S+)?)*)\s+([\w-]+)(.*)$/.exec(s);
    if (!git) continue;
    const [, , sub, rest] = git;
    const c = /^git(?:\s+-[^C]\S*)*\s+-C\s+("[^"]+"|'[^']+'|\S+)/.exec(raw);
    const where = c ? at(dir, c[1]) : dir;
    const onMain = switchedToMain || branchIn(where) === 'main';
    const args = rest.trim().split(/\s+/).filter(Boolean).map(unquote);
    const words = args.filter((a) => !a.startsWith('-'));
    const isMain = (r) => r === 'main' || r === 'refs/heads/main' || (onMain && (r === 'HEAD' || r === '@'));
    const toMain = (r) => {
      const ref = r.replace(/^\+/, '');
      const target = ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref;
      return isMain(target);
    };

    if (sub === 'checkout' || sub === 'switch') {
      const create = args.findIndex((a) => /^-[bBcC]$/.test(a));
      if (create >= 0) {
        // -B / -C main resets main to another commit; -b / -c x creates x and switches to it.
        if (/^-[BC]$/.test(args[create]) && args[create + 1] === 'main') return `Blocked: "${raw}" moves the main branch. ${ASK}`;
        continue;
      }
      if (words[0] === 'main') switchedToMain = true;
      else if (words.length) switchedToMain = false;
      continue;
    }
    if (sub === 'push') {
      if (args.some((a) => /^--(force(-with-lease|-if-includes)?|mirror)(=.*)?$/.test(a) || /^-[A-Za-z]*f[A-Za-z]*$/.test(a) || /^\+/.test(a))) {
        return `Blocked: "${raw}" force-pushes (or mirrors), which can discard others' commits. ${ASK}`;
      }
      // A plain push of main is how a session ends; deleting main on the remote is not.
      const refs = words.slice(1); // after the remote
      const deletes = args.includes('--delete') || args.includes('-d');
      if (refs.some((r) => (deletes && isMain(r)) || (r.startsWith(':') && isMain(r.slice(1))))) {
        return `Blocked: "${raw}" deletes main on the remote. ${ASK}`;
      }
      continue;
    }
    if (sub === 'fetch' && words.some((w) => w.includes(':') && toMain(w))) {
      return `Blocked: "${raw}" writes the local main branch. ${ASK}`;
    }
    if (sub === 'update-ref' && isMain(words[0] ?? '')) {
      return `Blocked: "${raw}" moves the main branch. ${ASK}`;
    }
    if (sub === 'branch' && words.includes('main') && args.some((a) => /^(-[fdDmM]|--force|--delete|--move)$/.test(a))) {
      return `Blocked: "${raw}" moves or deletes the main branch. ${ASK}`;
    }
    if (sub === 'rebase' && words.length >= 2 && words.at(-1) === 'main') {
      return `Blocked: "${raw}" checks out and rewrites main. ${ASK}`;
    }
    // Rewriting main's history can discard pushed commits; adding to it (merge, pull, revert) is fine.
    if (['rebase', 'reset'].includes(sub) && onMain) {
      return `Blocked: "${raw}" rewrites main (${sub} while on main). ${ASK}`;
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
