# M1 fourth-session prompt

How to use: run `prompts/D9-design-pass.md` in a separate chat first. It settles D9 with you,
records the decisions in `docs/DECISIONS.md`, and fills in "Optional slices" below. Then open
Claude Code in this repo and paste everything below the line. The session builds from the
recorded decisions and does not wait on you.

---

# Goal
Continue Milestone 1 toward its "done when" (`docs/ROADMAP.md`): a student can walk the plaza,
push the carts, sit on the bench, **enter the expedition, make a prediction and see it
logged**. Walking, carts and the bench are done. This session:
1. confirm that the baseline still passes;
2. build the first expedition prototype as small vertical slices, as D9 records it;
3. if time allows, the optional slices listed below.

If the session runs long, finish and review what is done, write up where the next slice got to,
and stop. Don't leave two slices half done.

Read first:
- `CLAUDE.md`
- `docs/DECISIONS.md`: D9 and everything the D9 design pass confirmed; D4 (the exact-integrator
  rule), D2 and D17
- `docs/STATUS.md`: the "M1, session 3" section (results, open issues, next plan), then session 2
- `docs/ASSUMPTIONS.md`: the M1 session 3 section above all
- `docs/ROADMAP.md`
- `docs/DESIGN.md`: sections 1, 2, 4, 7 and 8 (predict, test, compare; first expedition; field
  notebook)
- `docs/IMPLEMENTATION.md`: sections 3, 6 (the catapult numbers) and 7
- `docs/ART_PIPELINE.md` (how art is drawn and reviewed)
- `docs/TOPICS.md`: "To return to"
- `reference/showcase.html`: the catapult, for behaviour only
- `README.md`, above all "Verify everything", `art:sheet` and the `tools/share` section

Nothing in docs/ is approved unless DECISIONS.md says so.

# Step 0: set up and check the baseline (before changing anything)
- **Check D9:** if D9 is still Open in `docs/DECISIONS.md` (the design pass has not run), stop
  and say so. Don't guess the answers.
- **Worktree:** work on your own branch in your own worktree, never by switching branches in the
  shared tree:
  `git worktree add -b m1-s4 E:/bz-s4 main`, then `pnpm install` there. Other sessions may be
  working on main.
- **Baseline:** run `pnpm verify`. It must pass: `pnpm check`, zero console errors in every
  scene and script, `check-carts`, the looks, and 0 differences against `docs/status/m1-s3`.
- Look at `artifacts/shots/hub.png`, `artifacts/shots/looks.png` and
  `artifacts/shots/hub-bench/greeted.png`.
- If anything fails, report it as a failure and fix it first, in its own commit.

# Scope for this session
Build what D9 records. Anything D9 leaves Open that a slice needs: stop and ask.
1. **The expedition sim**, in `packages/sim`, tests first.
   - The launch and flight as confirmed, with an exact integrator, in SI units at 60 Hz, and
     deterministic.
   - Inputs arrive as commands: set up, predict, launch, reset.
   - Tests pin the confirmed textbook numbers, the landing solved inside the step (like the
     drop), and 10,000-step determinism.
   - The prediction and the result live in sim state, so the M2 server can later run the same
     code.
2. **The expedition scene**, registered as its own `?scene=` name.
   - A side view (DESIGN.md §4), drawn from sim state.
   - The prediction interface, the launch, and the compare moment as confirmed.
   - Measurement readouts only; no instructional text (D17).
   - Reduced motion is respected.
   - Draw any new art once as SVG in `art/` and load it by part id (props that never turn,
     D12), with anchors per D22. Show me every new or changed drawing with `pnpm art:sheet`.
3. **Getting there from the hub**, as confirmed. The hub's existing scripts must still give the
   same sim states (`pnpm verify` compares against `docs/status/m1-s3`), apart from documented
   additions to the layout.
4. **The notebook log**, as confirmed.
   - A notebook entry is written when the result is known. Storage is client-side and never
     affects the sim.
   - It works in a fresh browser with no stored data, and with storage blocked (wrap every
     access; the game still runs).
   - A script shows a prediction and its entry.
5. **Optional slices**, in this order (filled in by the D9 design pass; none if empty):
   - (none yet)

Housekeeping:
- Anything in the STATUS "Open issues" lists is optional. Note it if you skip it.
- `pnpm share` builds the coworker site from `docs/` and the game. After the session, check that
  it still builds (`pnpm share`, or `pnpm share:dry-run`). **Never run `pnpm share:deploy` or
  `pnpm share:password` unless I ask.**

Out of scope:
- the catapult as a hub prop (unless it is the confirmed launcher, in the expedition scene only)
- the pond, the U-Track, enemies and bosses
- Colyseus, a database, and teacher tools
- the Discovery Wall, and sending any data anywhere
- the in-game wardrobe

# How to work (same rules as before)
- Small steps. Each ends with the app loadable, `pnpm check` green, and a commit with a clear
  message.
- **Checks:**
  - Between steps: `pnpm verify --no-check --scripts <the scripts the change touches>`.
  - At the end of each slice: the full `pnpm verify`.
  - New scripts go in `tools/shot/scripts/`, and `verify` picks them up.
  - `pnpm shot:sheet` puts many frames in one image for review.
- Build sim behaviour in `packages/sim` with tests first. The client only renders sim state and
  turns input into commands. The boundary test must keep passing.
- Port behaviour and numbers from the prototypes (`reference/`, `docs/IMPLEMENTATION.md` §6),
  never their code. Prototype numbers are screen pixels at 100 px = 1 m with stylized gravity;
  re-derive them in SI and say how.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under an
  "M1 session 4" heading.
- Anything that would lock an Open decision beyond what DECISIONS.md records: stop and ask.
- Never claim something works or looks right without a screenshot or test you have actually
  checked in this session. Report failures as failures.
- Windows: keep clone and worktree paths short. pnpm fails beyond about 260 characters.
- In the Bash tool, heredocs and inline Python can collapse `\\` into `\` (session 3 lost regex
  escapes and newlines this way). Use the Write and Edit tools for code with backslashes.
- Commit your own files by path, on your branch. Ask me before merging into main.

# Review gate
When the slices look done, run a separate reviewer subagent that writes no code. It works in a
fresh clone at a short path and runs `pnpm install`, `pnpm shot:install` and `pnpm verify`
there (tools/shot starts its own server on a free port). It checks:
- `pnpm verify` passes from a clean clone:
  - install, build, typecheck, lint and tests;
  - zero console errors in every scene and script;
  - `check-carts` and the looks;
  - no hub differences against `docs/status/m1-s3`, apart from the documented layout additions.

  The reviewer looks at every PNG, using `pnpm shot:sheet` to see them together.
- the expedition physics:
  - the numbers match the textbook within the tolerance the tests state, recomputed by the
    reviewer from the logs (range, flight time, apex)
  - the landing is solved inside the step
  - it is deterministic
- predict, test, compare:
  - a prediction is made without free text
  - the launch runs
  - the compare shows the predicted and actual results
  - a miss reads as friendly
  - the images match the logs
- the notebook:
  - an entry holds what was confirmed
  - nothing leaves the browser
  - the game runs with storage empty or blocked
  - no personal data is stored
- getting to the expedition from the hub and back works, and the look carries over
- new art: `pnpm art:sheet --base main` shows only the intended changes, and the art contract
  tests cover the new files
- the optional slices, if built: touch buttons work with a tap and don't cover the play area;
  the full-screen picture is sharp at a 1920×1080 viewport and fps is logged
- the drop scene still passes (both balls level at t = 1.0 s, both landed at t = 1.5 s)
- the sim boundary test passes, and the sim never uses the look. Units, timestep and coordinates
  match DECISIONS.md and `docs/ASSUMPTIONS.md`.
- the README explains the new scene, scripts, checks and art files; `art/README.md` explains any
  new art and anchors
- `pnpm share` still builds

Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Add an "M1, session 4" section at the top of `docs/STATUS.md`. It should cover:
- what was built
- test and screenshot results, with file paths. Copy the evidence (`artifacts/shots/`, and the
  `art:sheet` images for new art) into `docs/status/m1-s4/`, so the next `pnpm verify` compares
  against it.
- fps as measured (informational), including the expedition scene in both GPU and software GL
- decisions confirmed
- open issues
- the proposed plan for the next session: whether M1's "done when" is met, what remains
  (touch, CI, sharpness, if not done), and what M2 (the multiplayer hub) needs settled first
  (D5, D8, the Colyseus part of D6, and the determinism and occupancy notes from STATUS)

Delete the reviewer's clones and any other temporary clones before you finish, and confirm
they are gone. Leave your worktree and branch for me to merge.

Then stop.
