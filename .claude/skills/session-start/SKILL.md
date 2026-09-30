---
name: session-start
description: Start a Beananza build, art, animation or tools session: own branch in its own git worktree (locally) or a cloud session, install, and a passing baseline before any change. Use this at the start of every session that will change code, art or docs in this repo, and whenever a prompt says "set up and check the baseline", even if the change looks small.
---

# Start a session

Up to two lanes run at once (CLAUDE.md, "Lanes"), so never work in the shared tree or on main:
another session may be using it. A failing baseline is fixed first, in its own commit, so it is
never mistaken for your change.

## 1. Your own branch
- [ ] **Locally:** `git worktree add -b <lane>/<topic> C:/bz-<topic> main`, then work only in
      `C:/bz-<topic>`. Keep the path short: pnpm fails beyond about 260 characters on Windows.
      (Older prompts say `E:/`; this machine has no E: drive.)
- [ ] **In a cloud session:** the session is already on its own branch in a fresh container;
      the SessionStart hook installs dependencies and the browser.
- [ ] `pnpm install` in the worktree. If `pnpm` is missing on Windows, run it through corepack
      (`corepack pnpm install`, or `corepack enable --install-directory <a folder on PATH>`).
- [ ] Once per machine: `pnpm shot:install` (Playwright's Chromium).
- [ ] `pnpm shot` and `verify` start their own server, so each tree tests itself; never pass
      `--reuse` (the server on 5180 may be another worktree's).

## 2. Baseline (before changing anything)
- [ ] `pnpm verify`. It must end with `verify: all passed`: `pnpm check`, zero console errors
      in every scene and script, `check-carts`, the looks, the golden files complete, and 0
      differences against `tools/shot/golden/`.
- [ ] Open `artifacts/shots/hub.png` and `artifacts/shots/looks.png` (and any frame the prompt
      names) and look at them.
- [ ] If anything fails: report it as a failure, fix it first in its own commit (message says it
      fixes the baseline), and rerun.
- [ ] Log anything odd about the setup in `docs/ASSUMPTIONS.md` under the session's heading.

## 3. Then
- [ ] Follow the skill for the work: `hub-interaction`, `draw-piece`, `add-clip`, or
      `design-pass` for Open decisions.
- [ ] Between steps: `pnpm verify --no-check --scripts <the scripts the change touches>`.
- [ ] In the Bash tool, heredocs and inline scripts can collapse `\\` into `\`: write code with
      backslashes using the Write and Edit tools.
- [ ] Finish with `pr-ready`.
