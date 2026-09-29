# M1 fourth-session prompt

How to use: open Claude Code in this repo and paste everything below the line. The session
starts by checking the baseline, then runs the D9 design pass with you. It builds only once you
have answered.

---

# Goal
Continue Milestone 1 toward its "done when" (`docs/ROADMAP.md`): a student can walk the plaza,
push the carts, sit on the bench, **enter the expedition, make a prediction and see it
logged**. Walking, carts and the bench are done. This session:
1. confirm that M1 session 3 still passes;
2. run the D9 design pass with me (the first expedition), and settle what it depends on;
3. build the first expedition prototype as small vertical slices;
4. if time allows, the optional slices I pick in step 1.

If the session runs long, finish and review what is done, write up where the next slice got to,
and stop. Don't leave two slices half done.

Read first:
- `CLAUDE.md`
- `docs/STATUS.md`: the "M1, session 3" section (results, open issues, next plan), then session 2
- `docs/ASSUMPTIONS.md`: the M1 session 3 section above all
- `docs/DECISIONS.md`: above all D4 (the exact-integrator rule is still Open), D9, D2, D17
- `docs/ROADMAP.md`
- `docs/DESIGN.md`: sections 1, 2, 4, 7 and 8 (predict, test, compare; first expedition; field notebook)
- `docs/IMPLEMENTATION.md`: sections 3, 6 (the catapult numbers) and 7
- `docs/TOPICS.md`: "To return to" (blurry full screen; the bean's shape under D13; a smoother
  session workflow)
- `reference/showcase.html`: the catapult, for behaviour only
- `README.md`, including the `tools/share` section

Nothing in docs/ is approved unless DECISIONS.md says so.

# Step 0: baseline (before changing anything)
- `main` now includes `tools/share` (a password-protected coworker preview site). Run
  `pnpm install` first: it adds dependencies and `pnpm-workspace.yaml` changed.
- Run `pnpm check` and `pnpm shot --all`. All must pass with zero console errors.
- Run every script in `tools/shot/scripts/`, then `pnpm shot:check-carts` and
  `pnpm shot:check-looks`. All must pass.
- Run `pnpm shot:compare-states docs/status/m1-s3`. Session 3's evidence is the new baseline,
  so expect **0 differences**. Report any as failures.
- Look at `artifacts/shots/hub.png`, `artifacts/shots/looks.png` and
  `artifacts/shots/hub-bench/greeted.png`.
- A dev server may already be running on port 5180, and tools/shot reuses it. In session 3 it
  stopped seeing newly added source files and answered 500. If that happens, say so and use
  `--port 5181` (a fresh server per run); don't stop the one on 5180.
- If anything fails, report it as a failure and fix it first, in its own commit.

# Step 1: the D9 design pass (ask me, then wait)
In your first message, after the baseline, ask these in one message. For each, give the
options, your recommendation (with numbers where there are numbers) and what it changes. Ground
the options in DESIGN.md §8, the prototype catapult (IMPLEMENTATION.md §6) and the core habit
of predict, test, compare. Do not build anything that depends on an answer until I have
answered. After I answer, update `docs/DECISIONS.md` for the decisions I confirmed, and only
those. D9 may be partly confirmed.

1. **The launcher:**
   - Options: a catapult with crank notches (the prototype), a launcher with angle and speed,
     or something else.
   - What the student sets, the ranges and steps, and whether the bean is the projectile.
   - Say what each choice teaches (range against launch speed, angle, independence of the
     horizontal and vertical motion).
2. **The prediction:**
   - How a student predicts without free text (no free text for minors, D17 and CLAUDE.md
     privacy), for example dragging a landing marker, choosing among markers, or picking a
     distance on a ruler.
   - Whether a prediction is required before every launch.
3. **Measuring and comparing:**
   - What the world measures and shows as readouts (D17 allows them): landing distance,
     flight time, apex height.
   - How the compare moment looks: the predicted and actual landing side by side, and a
     dashed arc (the field-notebook look, DESIGN.md §5).
   - What counts as success: a tolerance in metres or a percentage. A miss must feel funny,
     not punishing (DESIGN.md §1).
4. **Physics and units (touches D4 and D16):**
   - An exact integrator for the flight (the D4 leaning), with real gravity 9.81 m/s².
   - Launch height and scale in metres, and the typical range.
   - Whether air drag is off (recommend off: textbook numbers).
   - Tests that pin textbook values: R = v²·sin 2θ / g from ground level, and T and apex
     height from a launch height.
5. **Getting there and back (touches D2, which stays Open):**
   - How the bean enters from the hub: a gate or signpost placed in the placeholder plaza,
     used with E or a tap.
   - The side-view scene, how the student returns to the hub, and what carries over (the look).
6. **The notebook:**
   - What one entry holds: the inputs, the prediction, the result, the error, the time and a
     concept id (DESIGN.md §11).
   - Where it lives now: local storage only, no personal data, nothing sent anywhere.
   - How a student sees it without instructional text: an overlay of readouts and drawn marks.
7. **Optional slices after the expedition.** Which of these, if any, to include this session:
   - **On-screen touch buttons** (Action, Jump, Run), so phones can do everything. Needs icons
     rather than words (D17 allows the controls hint only).
   - **A sharp picture at full screen** (TOPICS.md "To return to": size the canvas to device
     pixels, `ART_RESOLUTION` 3, cap for Chromebooks).
   - **CI:** running `pnpm check` and `pnpm shot --all`, if there is a remote to run it on.
   - **Workflow tools** (TOPICS.md "A smoother session workflow"): `pnpm verify`, `pnpm shot:sheet`,
     and tools/shot always starting its own server. If I pick these, build them first, before
     the expedition slices, so the rest of the session uses them.

Note as upcoming, and don't ask yet:
- the D13 bean-shape approach (TOPICS.md)
- D7 (other body forms), and the D12 prop part (paper 3D)
- the in-game wardrobe design
- the M2 needs from STATUS: `Math.hypot` and cross-engine determinism, and seat occupancy in
  the state

# Scope for this session (after my answers)
1. **The expedition sim**, in `packages/sim`, tests first.
   - The launch and flight as confirmed, with an exact integrator, in SI units at 60 Hz, and
     deterministic.
   - Inputs arrive as commands: set up, predict, launch, reset.
   - Tests pin the textbook numbers from step 1, the landing solved inside the step (like the
     drop), and 10,000-step determinism.
   - The prediction and the result live in sim state, so the M2 server can later run the same
     code.
2. **The expedition scene**, registered as its own `?scene=` name.
   - A side view (DESIGN.md §4), drawn from sim state.
   - The prediction interface, the launch, and the compare moment as confirmed.
   - Measurement readouts only; no instructional text (D17).
   - Reduced motion is respected.
   - Draw any new art once as SVG in `art/` and load it by part id (props that never turn,
     D12), with anchors per D22.
3. **Getting there from the hub**, as confirmed. The hub's existing scripts must still give the
   same sim states (`pnpm shot:compare-states docs/status/m1-s3`), apart from documented
   additions to the layout.
4. **The notebook log**, as confirmed.
   - A notebook entry is written when the result is known. Storage is client-side and never
     affects the sim.
   - It works in a fresh browser with no stored data, and with storage blocked (wrap every
     access; the game still runs).
   - A script shows a prediction and its entry.
5. **The optional slices** I picked in step 1, in the order I gave.

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
- Build sim behaviour in `packages/sim` with tests first. The client only renders sim state and
  turns input into commands. The boundary test must keep passing.
- Port behaviour and numbers from the prototypes (`reference/`, `docs/IMPLEMENTATION.md` §6),
  never their code. Prototype numbers are screen pixels at 100 px = 1 m with stylized gravity;
  re-derive them in SI and say how.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under an
  "M1 session 4" heading.
- Anything that would lock an Open decision beyond what I confirmed in step 1: stop and ask.
- Never claim something works or looks right without a screenshot or test you have actually
  checked in this session. Report failures as failures.
- Windows: keep clone paths short. pnpm fails beyond about 260 characters.
- In the Bash tool, heredocs and inline Python can collapse `\\` into `\` (session 3 lost regex
  escapes and newlines this way). Use the Write and Edit tools for code with backslashes.
- Another Claude session may be working in this repo. Check `git status` before committing,
  and commit your own files by path.

# Review gate
When the slices look done, run a separate reviewer subagent that writes no code. It works in a
fresh clone at a short path and uses its own port (for example `--port 5190`). It checks:
- install, build, typecheck, lint and tests pass from a clean clone
- `pnpm shot --all` gives zero console errors for every scene; the reviewer looks at every PNG
- every script in `tools/shot/scripts/` passes; `pnpm shot:check-carts` and
  `pnpm shot:check-looks` pass
- `pnpm shot:compare-states docs/status/m1-s3` shows no differences in the hub, apart from the
  documented layout additions
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
- test and screenshot results, with file paths. Copy the evidence into `docs/status/m1-s4/`.
- fps as measured (informational), including the expedition scene in both GPU and software GL
- decisions confirmed
- open issues
- the proposed plan for the next session: whether M1's "done when" is met, what remains
  (touch, CI, sharpness, if not done), and what M2 (the multiplayer hub) needs settled first
  (D5, D8, the Colyseus part of D6, and the determinism and occupancy notes from STATUS)

Delete the reviewer's clones and any other temporary clones before you finish, and confirm
they are gone.

Then stop.
