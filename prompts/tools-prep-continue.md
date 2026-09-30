# Tools prep: merge and hand over (continues the tools prep session)

How to use: open Claude Code in this repo and paste everything below the line. It finishes the
tools prep session (`prompts/tools-prep-session.md`): the work is done, reviewed twice and green
in CI, and waiting only for the merge. It builds nothing new.

---

# Goal
Merge PR #5 (`tools/prep`, https://github.com/Mosskov/beananza/pull/5) into main, bring the
local trees up to date, clean up, and point at the next session. **I approve merging PR #5 in
this session**, once the checks below pass. Merge nothing else.

Read first: `CLAUDE.md` (the "How work runs" and "Lanes" sections), `docs/STATUS.md` ("Current
state"), and the PR's description.

This machine: no global pnpm (use the corepack shims in `%LOCALAPPDATA%\corepack-bin` from
PowerShell; in Git Bash that shim is broken), and no `gh` CLI (the GitHub REST API works with
curl; `git credential fill` supplies the token). The shared tree is on main, so the guard hook
in `.claude/settings.json` blocks merging and pulling there once it is loaded: tell me if it
does, and don't route around it.

# Steps
1. **Check before merging.** The PR is open, its head is still `259a630` (or say what changed),
   GitHub reports it mergeable, and CI is green on the head commit (runs 36695679697 push and
   36695685437 pull_request were green). If anything differs, stop and tell me.
2. **Merge** PR #5 with a merge commit. If the tools here won't let you, stop and give me the
   one command or the web link to do it myself.
3. **Update the shared tree** (`C:/Users/nima/OneDrive - EUC Nord/Projects/beananza`, on main):
   fetch, then fast-forward main to `origin/main`. Only fast-forward; if it can't, stop and ask.
   Then run `pnpm install` there.
4. **Confirm main works:** `pnpm verify` in the shared tree must end with `verify: all passed`,
   with 0 differences against `tools/shot/golden/`. Look at `artifacts/shots/hub.png`.
5. **Clean up:** remove the `C:/bz-prep` worktree (`git worktree remove C:/bz-prep`, checking it
   is clean first) and delete the local `tools/prep` branch once it is merged. Leave the remote
   branch unless I say otherwise. Confirm with `git worktree list` and `git branch`.
6. **Report:** the merge commit, the verify summary, what was removed, and the next step. The
   next sessions are the D9 design pass (`prompts/D9-design-pass.md`, in a separate chat), then
   M1 session 4 (`prompts/M1-fourth-session.md`, behaviour lane) and the reactions build
   (`prompts/reactions-first-session.md`, art lane). At most two at a time (CLAUDE.md, "Lanes").

**Never run `pnpm share:deploy` or `pnpm share:password`.** Report failures as failures.
