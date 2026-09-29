# M1 first-session prompt

How to use: open Claude Code in this repo and paste everything below the line. The session
starts by checking the M0 baseline and asking you the open questions, then builds once you have
answered.

---

# Goal
Start Milestone 1 (single-player vertical slice). This session: confirm that M0 still passes,
settle the decisions this work depends on, then build the first three M1 slices proposed in
`docs/STATUS.md`:
1. scripted input for tools/shot
2. a hub plaza scene
3. bean movement in the sim

Read first:
- `CLAUDE.md`
- `docs/STATUS.md`: M0 results, open issues and the M1 plan
- `docs/ASSUMPTIONS.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/IMPLEMENTATION.md`: sections 3, 6 and 7
- `docs/DESIGN.md`: sections 4, 6 and 7
- `README.md`

Nothing in docs/ is approved unless DECISIONS.md says so.

# Step 0: baseline (before changing anything)
- Run `pnpm install`, `pnpm check` and `pnpm shot --all`. All must pass with zero console errors.
- Look at `artifacts/shots/drop.png`.
- A dev server may already be running on port 5180. tools/shot reuses it; leave it running.
- If anything fails, report it as a failure and fix it first, in its own commit.

# Step 1: ask me, then wait
In your first message, after the baseline, ask these in one message. For each, give the
options, your recommendation and what it changes. Do not build anything that depends on an
answer until I have answered. After I answer, update `docs/DECISIONS.md` for the decisions
I confirmed, and only those.

1. **D6 / D14, stack and engine:** keep TypeScript + Phaser + Vite? M0 used Phaser as scaffolding only.
2. **D1, hub camera:** ¾ top-down (the leaning) or isometric.
3. **Hub sim coordinates:** propose how the hub sim represents position while staying SI and
   consistent with "+Y up" from `docs/IMPLEMENTATION.md`. For example, a ground plane in x/y
   metres plus a height for jumps, with the ¾ projection done only in the client.
4. **D4, physics for the hub:** hand-written sim (walls and walkable bounds only) or Planck.js now.
5. **Hub jump:** realistic gravity (9.81 m/s²) or stylized like the prototype (1500 px/s², apex
   about 0.77 m, air time about 0.64 s). Give the SI numbers for both.
6. **Text in scenes:** may measurement readouts (the drop scene's timer, landing times, ruler
   labels) be an exception to "no text inside game scenes"? STATUS open issue 2.

D3 (rig), D12 (rotation) and D9 (first expedition) are not needed this session. Just note
them as upcoming.

# Scope for this session (after my answers)
1. **Scripted input for tools/shot.**
   - `--script <file.json>` with timed steps: key down and up, tap at a screen point, wait N
     seconds of sim time, and take a shot. Each shot has its own PNG and JSON log.
   - Runs against a paused sim, stepping in fixed steps, so a run is deterministic.
   - Sends input through Playwright's keyboard and mouse, so the real client input path is
     exercised.
   - Document it in the README.
2. **Hub plaza scene `hub`**, registered like every scene.
   - Walkable-area bounds and one placeholder prop to walk behind and in front of.
   - Depth scale `0.62 + 0.30·clamp((y − y_top)/depth_range, 0, 1)` from DESIGN.md §4, and
     automatic depth sort by ground position.
   - A placeholder bean shape: no rig yet. Mark every placeholder in code.
3. **Movement in the sim.**
   - Walk 2.4 m/s and run 4.2 m/s, re-derived from the prototype's 240 and 420 px/s at
     100 px ≈ 1 m. Jump as decided in step 1, with air control.
   - Keyboard (arrows or WASD, Shift to run, Space to jump) and tap-to-move become sim commands.
     Clamp tap targets to the walkable area, and cancel a target when the bean is stuck for
     about 0.35 s.
   - Tests lock the numbers: walk and run speeds, diagonal movement no faster than straight,
     jump apex and air time, bounds respected, tap-target cancel, and determinism over 10,000
     steps with scripted inputs.

Housekeeping:
- Bump typescript-eslint to 8.71.x if pnpm's minimum release age now allows it.
- Anything else in STATUS "Open issues" is optional. Note it if you skip it.

Out of scope:
- the bean rig and animations
- carts, the bench, customization and expeditions
- Colyseus, a database and an art pipeline
- Planck.js, unless I confirmed it in step 1

# How to work (same rules as M0)
- Small steps. Each ends with the app loadable, `pnpm check` green, and a commit with a clear message.
- Build sim behavior in `packages/sim` with tests first. The client only renders sim state and
  turns input into commands. The boundary test must keep passing.
- Port behavior and numbers from the prototypes (`reference/`, `docs/IMPLEMENTATION.md` §6), never their code.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under an M1 heading.
- Anything that would lock an Open decision beyond what I confirmed in step 1: stop and ask.
- Never claim something works or looks right without a screenshot or test you have actually
  checked in this session. Report failures as failures.

# Review gate
When the slices look done, run a separate reviewer subagent that writes no code. It checks:
- install, build, typecheck, lint and tests pass from a clean clone
- `pnpm shot --all` gives zero console errors for every scene
- a scripted playthrough in `hub`:
  - holding right for 1.0 s moves the bean 2.4 m, within one step. The log's sim state and the
    screenshot must both agree.
  - running is faster.
  - a jump leaves the ground and lands.
  - the bean is drawn behind the prop when north of it, and in front when south of it.
- the drop scene still passes (both balls level at t = 1.0 s, both landed at t = 1.5 s)
- the sim boundary test passes. Units, timestep and coordinates match what was decided and
  what is in `docs/ASSUMPTIONS.md`.
- the README explains the new scene and `--script`

Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Add an "M1, session 1" section at the top of `docs/STATUS.md`. It should cover:
- what was built
- test and screenshot results, with file paths. Copy the evidence into `docs/status/m1-s1/`.
- fps as measured (informational)
- decisions confirmed
- open issues
- the proposed plan for the next session: bean rig v0, then carts

Then stop.
