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
- **Skill `session-start`,** as the behaviour lane: branch `behaviour/m1-s4`, worktree `C:/bz-s4`. After
  the baseline, also look at `artifacts/shots/hub-bench/greeted.png`.

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
   same sim states (`pnpm verify` compares against `tools/shot/golden/`), apart from documented
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

# How to work
- **Skills:** `hub-interaction` for getting there from the hub; `draw-piece` for new art;
  `add-clip` for new animation. The expedition sim and scene follow `hub-interaction`'s order
  (sim first with tests, its own scripts, the plaza untouched) though they are a new scene
  (README, "Adding a scene").
- Small steps. Each ends with the app loadable, `pnpm check` green, and a commit with a clear
  message.
- Port behaviour and numbers from the prototypes (`reference/`, `docs/IMPLEMENTATION.md` §6),
  never their code. Prototype numbers are screen pixels at 100 px = 1 m with stylized gravity;
  re-derive them in SI and say how.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under an
  "M1 session 4" heading.
- Anything that would lock an Open decision beyond what DECISIONS.md records: stop and ask.

# Review gate
Part of `pr-ready`: push, CI green, open the PR, then run the `reviewer` agent on it with this
checklist (CI proves the verify pass; the reviewer looks at every PNG):
- `pnpm verify` passes (CI): zero console errors in every scene and script, `check-carts`, the
  looks, and no hub differences against `tools/shot/golden/`, apart from the documented layout
  additions.
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
Skill `pr-ready`. The PR description (from the template) and the "Current state" section of
`docs/STATUS.md` also cover:
- test and screenshot results, with file paths; the new scripts' golden files and why they are
  what they are
- fps as measured (informational), including the expedition scene in both GPU and software GL
- decisions confirmed
- the proposed plan for the next session: whether M1's "done when" is met, what remains
  (touch, sharpness, if not done), and what M2 (the multiplayer hub) needs settled first
  (D5, D8, the Colyseus part of D6, and the determinism and occupancy notes from STATUS)

Then stop, leaving the branch and the PR for me to merge.
