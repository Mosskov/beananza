---
name: pr-ready
description: Finish a Beananza slice or session and hand it over as a pull request: full pnpm verify green with the golden diff explained, every new frame and sheet looked at, ASSUMPTIONS and README updated, the PR description from the template, CI green, temporary clones gone, and no merge without the user. Use this at the end of every build, art, animation or tools session and before saying "done", "ready for review" or opening a PR, even for a small change.
---

# Ready for review

The pull request is the unit of work. CI proves the mechanical half (fresh clone, check,
verify); this list is the half only the session can do. Report failures as failures.

## 1. Verify
- [ ] `pnpm verify` (the full pass, not `--scripts`) ends with `verify: all passed`. If it fails,
      fix it, or write the failure up; never hide it.
- [ ] **The golden diff:** `git diff --stat main -- tools/shot/golden`. For every changed file,
      know why it changed (the new behaviour, named in a sentence). Unexpected changes are bugs.
      Golden files are only ever written by `pnpm verify --update-golden`, from a passing run.
- [ ] New scripts have their golden files (`verify` fails on a shot without one).

## 2. Look
- [ ] Every new or changed frame has been opened and looked at, and agrees with its log:
      `pnpm shot:sheet artifacts/shots/<script>` puts a script's frames on one image.
- [ ] Art changes: the `art:sheet` sheet and zoom, with every magenta area accounted for
      (`draw-piece`). Clip changes: the `clip:sheet` sheets, normal and reduced motion
      (`add-clip`).
- [ ] Nothing is claimed in the PR that wasn't looked at in this session.

## 3. Write it down
- [ ] `docs/ASSUMPTIONS.md`: the routine choices, under this session's heading, naming
      constants and files.
- [ ] `README.md` (commands, scenes, scripts, tests, checks) and `art/README.md` (new parts,
      anchors, colours) describe what was added.
- [ ] `docs/DECISIONS.md`: statuses changed only for what the user confirmed.
- [ ] `docs/STATUS.md`: update the "Current state" section in place (what works, open issues,
      next). No new per-session section.
- [ ] `pnpm share:dry-run` still builds if docs changed (the share site parses STATUS and
      DECISIONS).

## 4. The pull request
- [ ] Commit your own files by path, on your branch, with clear messages. `git status` clean.
- [ ] Push the branch (`git push -u origin <branch>`); if that fails, ask the user.
- [ ] Open the PR with the template (`.github/pull_request_template.md`): what changed and why,
      decisions touched (IDs), sheets and frames looked at (paths), the golden diff and why,
      assumptions logged, open issues, the next slice. Fill every section; "none" is an answer.
- [ ] Wait for CI (`verify`) to go green on the branch; download its `verify-artifacts` if a
      frame differs from your local run.
- [ ] Run the `reviewer` agent on the PR, fix what it finds (at most 3 rounds), and write up
      whatever still fails in the PR's open issues.

## 5. Clean up and stop
- [ ] Delete temporary clones and worktrees you or the reviewer made, and confirm they are gone
      (`git worktree list`, `ls` the paths). Leave your own worktree and branch.
- [ ] **Do not merge into main.** The user merges. Never run `pnpm share:deploy` or
      `pnpm share:password`.
- [ ] Tell the user: the PR link, CI status, what to look at first, and anything that failed.
