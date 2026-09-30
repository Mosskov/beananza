// PreToolUse guard for Bash and PowerShell (.claude/settings.json). Blocks the commands a
// session must ask the user about first: deploying or re-keying the share site, force-pushing,
// and merging or rebasing on main. Reads the hook payload on stdin; prints a deny decision, or
// nothing to let the command through. Plain Node, no dependencies, so it runs the same on
// Windows, in CI and in cloud sessions.
import { execFileSync } from 'node:child_process';

/** The current branch in `cwd`, or null outside a repository. */
function branchIn(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Why `command` needs the user first, or null. `branch` is the current branch. */
function verdict(command, branch) {
  // One segment per command in a chain (;, &&, ||, |, newlines), so flags are read per command.
  const segments = command.split(/&&|\|\||[;|\n]/).map((s) => s.trim());
  const ask = 'Ask the user before running it (CLAUDE.md, prompts: "Never run pnpm share:deploy or pnpm share:password"; "Ask me before merging into main").';
  for (const s of segments) {
    if (/\bpnpm\b.*\b(share:deploy|share:password|cf-deploy|cf-password)\b/.test(s)) {
      return `Blocked: "${s}" deploys or re-keys the team share site. ${ask}`;
    }
    if (/\bgit\b.*\bpush\b/.test(s) && /(\s--force(-with-lease|-if-includes)?\b|\s-[A-Za-z]*f[A-Za-z]*\b|\s\+[^\s]+)/.test(s)) {
      return `Blocked: "${s}" force-pushes, which can discard others' commits. ${ask}`;
    }
  }
  // Merging or rebasing on main: on main now, or after switching to it in the same command.
  let onMain = branch === 'main';
  for (const s of segments) {
    if (/\bgit\b.*\b(checkout|switch)\s+(-\S+\s+)*main\b/.test(s)) onMain = true;
    if (onMain && /\bgit\b(\s+-\S+(\s+\S+)?)*\s+(merge|rebase)\b/.test(s)) {
      return `Blocked: "${s}" merges or rebases on main. The user merges into main. ${ask}`;
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
  const reason = verdict(command, branchIn(payload.cwd ?? process.cwd()));
  if (reason) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  }
}

await main();
