# Tools prep session (before the asset, interaction and animation lanes)

How to use: open Claude Code in this repo and paste everything below the line. It is a tools
session: it builds the workflow that the next many sessions run on, and no game feature, art
piece or clip. The order was settled in the planning chat of 2026-09-30 and is deliberate:
CI and golden snapshots first, then the art toolkit and the clip sheet, then the skills, the
reviewer agent, the PR template and the hooks. After it, work runs as two lanes at a time
(one art, one behaviour), each a branch with a pull request, never more, because review
capacity is the limit, not build capacity.

---

# Goal
Make the pull request the unit of work, and make the repeated procedures into skills and
tools, so that a build session's prompt is scope plus the skills to use. Four slices, in this
order. Each is its own commit series and ends with `pnpm check` green:
1. CI and golden snapshots;
2. the art toolkit and the clip sheet;
3. skills, the reviewer agent, the PR template, hooks, and the docs de-duplicated;
4. the cloud session setup and the two-lane rule.

If the session runs long, finish and review what is done, write up where the next slice got
to, and stop. Don't leave two slices half done.

Read first:
- `CLAUDE.md`
- `docs/STATUS.md`: the "M1, session 3" section, above all "Open issues" (no CI, the flaky
  browser run) and the review gate, which slice 3 replaces
- `docs/ASSUMPTIONS.md`: "Workflow tools" and the M1 session 3 section ("per-session STATUS
  files" is recorded there as not done)
- `docs/TOPICS.md`: "A smoother session workflow"
- `docs/ART_PIPELINE.md`, sections 2, 5 and 7
- `README.md`: "Verify everything", "Look at many frames", "Review an art change", "tools/shot",
  "Adding a hub interaction", "Adding a scene"
- `tools/shot/src/verify.ts`, `compare-states.ts`, `art-sheet.ts`, `sheet.ts`, `session.ts`
- `packages/client/src/rig/`: `bean-contract.ts`, `looks.ts`, `colours.ts`, `clips.ts`,
  `player.ts`, and `packages/client/src/art/raster.ts` (how the game rasterizes and recolours)
- `prompts/M1-fourth-session.md`: the procedures it repeats (worktree, baseline, how to work,
  review gate, finish) are what slice 3 turns into skills
- `packages/client/test/looks.test.ts`, `bean-art.test.ts`, `prop-art.test.ts`

Nothing in docs/ is approved unless DECISIONS.md says so. Nothing here locks an Open decision.

# Step 0: set up and check the baseline (before changing anything)
- **Worktree:** work on your own branch in your own worktree, never by switching branches in
  the shared tree: `git worktree add -b tools/prep E:/bz-prep main`, then `pnpm install`
  there. Other sessions may be working on main.
- **Baseline:** run `pnpm verify`. It must pass: `pnpm check`, zero console errors in every
  scene and script, `check-carts`, the looks, and 0 differences against the newest
  `docs/status/` folder. Look at `artifacts/shots/hub.png` and `artifacts/shots/looks.png`.
- If anything fails, report it as a failure and fix it first, in its own commit.

# Slice 1: CI and golden snapshots
The point: a machine does the mechanical half of the review gate (fresh clone, install, check,
verify, zero console errors, sim-state parity) on every push, and the parity baseline lives
in the repo as reviewable files instead of a status folder someone copies by hand.

1. **Golden sim states in the repo.** Move the parity baseline from "the newest
   `docs/status/` folder" to `tools/shot/golden/`: one JSON per script and per timed scene
   shot, holding only what `compare-states` compares (`sceneState.state`) plus the script
   name, layout and look. No PNGs in git.
   - `pnpm verify` compares against `golden/` by default. `--baseline <dir>` stays for
     comparing against an old evidence folder.
   - `pnpm verify --update-golden` rewrites the files, and nothing else does. A sim-state
     change then shows up as a diff in the pull request, which is where it gets reviewed.
   - The timed scene shots that `verify` runs come from `golden/`, as they came from the
     baseline folder before.
   - `RENAMES` in `compare-states.ts` stays, so old evidence folders still compare.
   - Tests: the golden files are valid, complete (one per script and timed shot, no extras),
     and `verify` fails on a changed state and on a missing file.
   - Seed `golden/` from `docs/status/m1-s3` and check that it gives 0 differences against
     main's scripts before you change anything else.
2. **GitHub Actions** (`.github/workflows/verify.yml`) on every push and pull request:
   `pnpm install`, `pnpm shot:install`, `pnpm check`, then `pnpm verify`. Software GL is
   fine; the fps rows are informational and must not fail the run. Upload
   `artifacts/verify/`, `artifacts/shots/` and `artifacts/sheets/` as a workflow artifact so a
   reviewer can look at the frames without a clone. Cache the pnpm store and the Playwright
   browser.
   - The one known flake (the browser closing mid-run, `docs/ASSUMPTIONS.md`) is not fixed by
     a retry loop. If it shows up in CI, record it in the open issues with the log.
3. **`docs/status/` stops being the baseline.** It keeps the images and write-ups as history.
   Say so in `README.md` ("Verify everything") and `docs/ASSUMPTIONS.md`.

# Slice 2: the art toolkit and the clip sheet
The point: the drawing loop and the animation loop run in seconds, without the game.
`pnpm art:sheet` stays as the final before-and-after review.

1. **`pnpm art:part <file> [--look …] [--views all|front,side,…] [--zoom n]`:** renders one
   art file with the contract applied, the way the game would draw it: key-colour swaps
   (`rig/colours.ts`), patterns clipped to the body, headwear at the anchors, the `-left`
   drawings where they exist, all requested views in one labelled strip, into
   `artifacts/art/parts/`. It also prints the anchors and pivots it found, and the contract
   findings (below). Target: under three seconds for a bean piece in all views.
   - Reuse the game's own colour and contract code from `packages/client/src/rig/`; do not
     write a second version of the swap or clip rules. If that means moving pure functions out
     of the client package into a small pure module the client also imports, do that.
   - Prefer no new native dependency. Headless Chromium (already used by `sheet.ts`) or a WASM
     SVG rasterizer are both acceptable; record the choice and its timing in ASSUMPTIONS.
2. **`pnpm art:check [files]`:** the contract checks as a CLI, on the given files or all of
   `art/`, with one line per finding and a non-zero exit. Add the checks listed in
   `docs/ART_PIPELINE.md` section 7 item 2: near and far parts on the correct side per view,
   and anchors and body-hugging parts inside the body outline. The existing tests keep passing
   and should call the same checks, so the CLI and the tests cannot disagree.
3. **`pnpm clip:sheet <clip> [--views …] [--phases n] [--look …] [--reduced-motion]`:** one
   clip across its cycle, at n phases, in the requested views, in one labelled strip, drawn by
   the real rig player (`rig/player.ts`), into `artifacts/clips/`. This is what an animation
   session looks at before it claims a clip reads right. `--reduced-motion` shows the `motion`
   and `still` handling.
4. Document all three in `README.md` and `docs/ART_PIPELINE.md` (section 5 gets the part
   renderer and the check; a short new section gets the clip sheet).

# Slice 3: skills, the reviewer agent, the PR template, hooks
The point: one copy of each procedure, in the place a session actually reads it.

1. **Skills** in `.claude/skills/<name>/SKILL.md`. Each is a checklist a session follows, with
   the commands to run and what to look at, not prose about why. Use the skill-creator skill
   if it is available to you; otherwise write them by hand in its format.
   - `draw-piece`: the art contract as steps. Part ids; 100 units = 1 m and the ground origin;
     key colours; the symmetric flag and `-left` drawings; anchors and pivots (D22); register
     by id; `pnpm art:check`; `pnpm art:part` in all views; the contract tests;
     `pnpm art:sheet`; look at the sheet; check every magenta area was meant to change; show
     it. Include the two session 3 slips (the side belly, the back ¾ sides) as explicit checks.
   - `hub-interaction`: the README recipe, with what it leaves implicit: sim first with tests,
     own test yard, own scripts, the plaza untouched, `pnpm verify --no-check --scripts …`
     between steps and the full pass at the end, the presentation row per act kind, the
     boundary test.
   - `add-clip`: the clip data format; the `motion` and `still` flags for reduced motion; a
     `player.test.ts` case; a bean gallery row; `pnpm clip:sheet` in all views and under
     reduced motion; a shot script if the clip is reachable in a scene; nothing claimed
     without a frame looked at.
   - `design-pass`: read `docs/DECISIONS.md` and `docs/TOPICS.md`; for each Open item the
     session names, give the options, one recommendation with numbers where there are
     numbers, and what the choice changes; ask in one message; record a status only after the
     user confirms; write the confirmed slices into the target build prompt.
   - `pr-ready`: the finish checklist that replaces the status section: `pnpm verify` green
     with the golden diff reviewed, every new frame and sheet looked at, ASSUMPTIONS entry,
     README and `art/README.md` updated, the PR description filled from the template,
     temporary clones deleted and confirmed gone, no merge into main without asking.
2. **The reviewer agent** in `.claude/agents/reviewer.md`, with read and shell tools and no
   file-writing tools. It works from CI's artifacts and a fresh clone at a short path, looks at
   every PNG (`pnpm shot:sheet`), reads the diff adversarially, recomputes any physics numbers
   the PR claims from the logs, and reports blockers, should-fix and nits, as the session 3
   reviewer did. It does not re-run what CI already proved unless CI is red.
3. **The PR template** in `.github/pull_request_template.md`: what changed and why; the
   decisions it touches (IDs); the sheets and frames looked at (paths); the golden diff, if
   any, and why; assumptions logged; open issues; what the next slice is. Short sections, no
   instructions inside them.
4. **Hooks and permissions** in `.claude/settings.json` (the update-config skill, if
   available):
   - a PreToolUse guard that blocks `pnpm share:deploy`, `pnpm share:password`, any
     `git push --force` and `--force-with-lease`, and any `git merge` or `git rebase` while on
     `main`, with a message that says to ask the user;
   - an allowlist for the read-only commands a session runs constantly (git status, log,
     diff; pnpm test, typecheck, lint, verify, shot, art:*, clip:sheet), so long sessions don't
     stall on approvals. No render-on-save hook: the skills call `art:part` at the right
     moment instead.
5. **De-duplicate the docs.** Once a procedure is a skill, the recipe prose in `README.md`
   ("Adding a hub interaction", "Adding a scene"), `CLAUDE.md` and `docs/ART_PIPELINE.md`
   becomes one or two lines pointing at the skill. `docs/STATUS.md` gets a short "Current
   state" section at the top that a PR updates in place; the per-session sections below it
   stay as history, and no new ones are added. Check `pnpm share:dry-run` still builds (the
   share site shows the first `## ` section of STATUS.md).
6. **Update `prompts/M1-fourth-session.md`** to the new flow: its worktree, baseline, how to
   work, review gate and finish sections become the skill names; its scope stays exactly as
   it is. Older prompts are history and stay untouched.

# Slice 4: cloud sessions and the two-lane rule
1. **SessionStart hook** for Claude Code on the web (the session-start-hook skill): `pnpm
   install`, and `pnpm shot:install` only when Playwright's browser is not already present
   (cloud containers set `PLAYWRIGHT_BROWSERS_PATH`). A cloud session must be able to run
   `pnpm verify` from a fresh container.
2. **The two-lane rule** in `CLAUDE.md`, replacing the concurrent-sessions paragraph: at most
   two lanes at a time, one art and one behaviour, each on its own branch with its own PR
   (worktree locally, or a cloud session), CI green before review, the user merges. Also the
   file map of what each lane owns and the five shared files (the act union, the interactions
   index, the presentation spread, the layouts table, the scene registry) that only get
   one-line additions.

# How to work
- Small steps. Each ends with `pnpm check` green and a commit with a clear message.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under a
  "Tools prep session" heading.
- Anything that would lock an Open decision: stop and ask.
- Never claim a tool works without running it on a real case in this session: render an
  existing piece with `art:part`, a real clip with `clip:sheet`, a deliberate sim change
  against `golden/`, and the CI workflow on a pushed branch. Report failures as failures.
- Windows: keep clone and worktree paths short. pnpm fails beyond about 260 characters.
- In the Bash tool, heredocs and inline Python can collapse `\\` into `\`. Use the Write and
  Edit tools for code with backslashes.
- Commit your own files by path, on your branch. Ask me before merging into main.
- **Never run `pnpm share:deploy` or `pnpm share:password`.**

# Review gate
This session is the first to use its own flow. When the slices are done: push the branch,
confirm CI ran and is green on it, open the pull request with the new template (ask me first
if the branch cannot be pushed), and run the new reviewer agent on it. It checks:
- CI is green from a fresh clone, and its uploaded artifacts hold the frames and sheets;
- `golden/` gives 0 differences against main's scripts, and a deliberate one-number sim change
  (reverted afterwards) makes `verify` fail with the file and field named;
- `art:part` renders an existing bean piece in all views, recoloured, in under three seconds,
  and its output matches the game's drawing of the same piece (compare against a
  `looks` gallery crop with `shot:sheet`);
- `art:check` reports the two session 3 slips when they are re-introduced on a scratch copy,
  and nothing on the current art;
- `clip:sheet` shows `walk` and `sit` in all views, and the reduced-motion strip holds the
  feet at their `still` value;
- each skill is followable start to end by a fresh session on a toy case (the reviewer reads
  them for missing steps, not for style);
- the guard hook blocks the listed commands, and the allowlist lets the listed ones through;
- no procedure exists in two places; `pnpm share:dry-run` builds;
- `prompts/M1-fourth-session.md` still says everything it said about scope.

Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Update the "Current state" section of `docs/STATUS.md` (the one this session creates) and
fill in the PR description. Do not add a per-session section. Then stop, leaving the branch
and the PR for me to merge.
