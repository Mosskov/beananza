# M1 second-session prompt

How to use: open Claude Code in this repo and paste everything below the line. The session
starts by checking the baseline and asking you the open questions, then builds once you have
answered.

---

# Goal
Continue Milestone 1. This session: confirm that M1 session 1 still passes, settle the
decisions this work depends on, then build the next two slices proposed in `docs/STATUS.md`:
1. bean rig v0 (replaces the placeholder bean in `hub`)
2. carts on a rail

The rig comes first. If the session runs long, finish and review the rig, write up where the
carts got to, and stop. Don't leave both half done.

Read first:
- `CLAUDE.md`
- `docs/STATUS.md`: the "M1, session 1" section (results, open issues, next plan), then M0
- `docs/ASSUMPTIONS.md`: the M1 session 1 section above all
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/IMPLEMENTATION.md`: sections 3, 4, 6 and 7
- `docs/DESIGN.md`: sections 4, 6 and 7
- `art/README.md` and `art/bean/*.svg`
- `README.md`

Nothing in docs/ is approved unless DECISIONS.md says so.

# Step 0: baseline (before changing anything)
- Run `pnpm install`, `pnpm check` and `pnpm shot --all`. All must pass with zero console errors.
- Run every script in `tools/shot/scripts/` (`pnpm shot --script <file>`). All must pass.
- Look at `artifacts/shots/hub-walk/walked-1s.png` and `artifacts/shots/hub-depth/behind-prop.png`.
- A dev server may already be running on port 5180. tools/shot reuses it; leave it running.
- If anything fails, report it as a failure and fix it first, in its own commit.

# Step 1: ask me, then wait
In your first message, after the baseline, ask these in one message. For each, give the
options, your recommendation and what it changes. Do not build anything that depends on an
answer until I have answered. After I answer, update `docs/DECISIONS.md` for the decisions I
confirmed, and only those.

1. **D3, bean rendering:** parts-based rig (the leaning) or pre-rendered sprite sheets.
2. **D12, rotation, the character part only:** 5 drawn views mirrored to 8 directions, using
   the mapping table in DESIGN.md §6. The prop part of D12 (paper-3D props) stays open. The
   carts run on a straight rail and never turn.
3. **Where rig parts come from for v0:** load the reference SVGs in `art/bean/` as they are
   (by part `id`), or transcribe them into code-drawn shapes. D13 (the art pipeline) stays
   Open either way. Say what each option means for swapping in final art later.
4. **Bean size in the world:** the art is about 114 units tall and 100 wide. Propose a height
   in metres, and say how it relates to the footprint radius (0.25 m, a placeholder), the jump
   apex (0.768 m) and the depth scale. The prototype drew about 1 art unit per pixel at scale 1.
5. **Carts and physics (D4):** an exact 1D sim per rail, with the carts as Planck bodies the
   bean collides with (the D4 leaning: exact integrators for what students measure). Or carts
   fully in Planck. Give the prototype's cart numbers in SI units for me to confirm:
   - push force (4200 and 6300 px·kg/s²)
   - speed caps (190 and 280 px/s)
   - rolling friction (26 px/s²)
   - restitution (0.45 at the bumpers, 0.5 between carts)
   - masses (5 kg and 20 kg)
   - the bean's 3 kg when riding
   Say whether 3 kg is right for the bean size from question 4.
6. **Default scene:** should plain `localhost:5180` open `hub` instead of `empty`?

Note as upcoming, and don't ask yet:
- D7 (body forms): the rig v0 builds the Bean form only
- D2 (hub layout)
- D9 (first expedition)
- the stale "Nothing is approved" line in `CLAUDE.md`: I'll handle it

# Scope for this session (after my answers)
1. **Bean rig v0**, in the client.
   - Build the parts from the source decided in step 1, pivoting at the feet: origin (0, 0) is
     the ground point between the feet.
   - Five views mirrored to 8 directions. The mapping from facing to view is a pure function.
     Its unit tests cover every row of DESIGN.md §6, including the boundaries. They start from
     the sim's `facingX`/`facingY` (north is +y), not from screen angles.
   - Clips as data, keyframes per part, played by a small rig player. Timings come from
     DESIGN.md §6:
     - idle: breathe and blink
     - walk: 0.56 s cycle
     - run: 0.34 s cycle, with lean
     - jump: crouch, launch, air, fall
     - land: squash, 0.12–0.14 s
   - The clip is chosen from sim state: ground speed, `grounded`, `lastJump`. The sim does not
     change for the rig.
   - Animation time comes from sim time, not wall-clock time, so paused and scripted shots are
     deterministic. Idle keeps the last facing.
   - Reduced motion: under `prefers-reduced-motion`, no bob, squash or breathing; the pose still
     changes. Add a `--reduced-motion` option to tools/shot so this can be verified.
   - A rig gallery scene (for example `bean`) showing all 8 directions and each clip at fixed
     times, for review by screenshot. Register it like every scene.
   - Replace the placeholder bean in `hub`. Keep the collider unchanged: cosmetics never
     affect physics.
2. **Carts on a rail**, sim first.
   - An exact 1D sim with the numbers confirmed in step 1:
     - push force (running pushes harder)
     - speed caps
     - rolling friction
     - bumper and cart-to-cart restitution, with momentum conserved
     - riding: v' = v·m/(m+3) getting in, reversed getting out
   - The bean pushes only from the side of the cart. Approaching from above or below is
     blocked (DESIGN.md §7).
   - Controls: E gets in or out of a cart; Space also gets out.
   - Tests lock:
     - acceleration F/m up to the cap
     - friction deceleration
     - both restitutions
     - momentum conservation in cart collisions
     - riding momentum both ways
     - determinism over 10,000 steps with scripted input
   - In `hub`: a straight east-west rail, a 5 kg and a 20 kg cart, and each cart's speed in m/s
     (a measurement readout, allowed by D17). Placeholder art, marked in code.
   - Scripts in `tools/shot/scripts/` that push a cart into the other and check momentum from
     the logs.

Housekeeping:
- Anything in the STATUS "Open issues" lists is optional. Note it if you skip it.

Out of scope:
- the bench, customization, other body forms, expeditions, the catapult
- hop over low objects, and on-screen touch buttons (unless trivial; note it)
- Colyseus, a database, and an art pipeline beyond what the rig v0 needs to load parts

# How to work (same rules as before)
- Small steps. Each ends with the app loadable, `pnpm check` green, and a commit with a clear message.
- Build sim behavior in `packages/sim` with tests first. The client only renders sim state and
  turns input into commands. The boundary test must keep passing.
- Port behavior and numbers from the prototypes (`reference/`, `docs/IMPLEMENTATION.md` §6),
  never their code.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under an
  "M1 session 2" heading.
- Anything that would lock an Open decision beyond what I confirmed in step 1: stop and ask.
- Never claim something works or looks right without a screenshot or test you have actually
  checked in this session. Report failures as failures.
- Windows: keep clone paths short. pnpm fails beyond about 260 characters (STATUS M1 s1).

# Review gate
When the slices look done, run a separate reviewer subagent that writes no code. It works in a
fresh clone at a short path and uses its own port (for example `--port 5190`). It checks:
- install, build, typecheck, lint and tests pass from a clean clone
- `pnpm shot --all` gives zero console errors for every scene; the reviewer looks at every PNG
- every script in `tools/shot/scripts/` passes, and the M1 session 1 hub checks still hold:
  2.4 m in 1.0 s, running is faster, a jump leaves the ground and lands, and behind or in front
  of the tree matches both the log and the image
- the rig:
  - each of the 8 directions shows the right view, mirrored where DESIGN.md §6 says
  - each clip is recognisable at the gallery's fixed times
  - `--reduced-motion` removes bob, squash and breathing
  - the bean still sorts correctly against the tree
- the carts:
  - a scripted push accelerates at F/m up to the cap
  - a collision conserves momentum within float tolerance, from the logged masses and velocities
  - restitution matches
  - riding changes speed by m/(m+3)
  - the readout shows m/s and agrees with the log
- the drop scene still passes (both balls level at t = 1.0 s, both landed at t = 1.5 s)
- the sim boundary test passes. Units, timestep and coordinates match DECISIONS.md and
  `docs/ASSUMPTIONS.md`.
- the README explains the new scenes, scripts and `--reduced-motion`

Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Add an "M1, session 2" section at the top of `docs/STATUS.md`. It should cover:
- what was built
- test and screenshot results, with file paths. Copy the evidence into `docs/status/m1-s2/`.
- fps as measured (informational), including `hub` with the rig and the carts
- decisions confirmed
- open issues
- the proposed plan for the next session: the bench and sit, then customization basics

Then stop.
