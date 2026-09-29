# Assumptions

Routine choices made while building, logged so they can be reviewed and reversed. None of them
changes a decision in `docs/DECISIONS.md`. Newest milestone first.

## M1 session 1 (tools/shot scripts, hub plaza, movement), 2026-09-29

### Decisions confirmed at the start of the session
D1 (¾ top-down), D14 (web, TypeScript + Phaser), D6 in part (TypeScript, Phaser, Vite, Vitest,
Planck.js), D4 in part (Planck.js for hub collisions), and the new D15 (hub coordinates), D16
(realistic hub jump) and D17 (measurement readouts allowed). See `docs/DECISIONS.md`. The M0
note "the stack is scaffolding, not a decision" no longer applies to those parts.

### tools/shot scripts
- **One JSON format, one action per step** (`keyDown`, `keyUp`, `press`, `tap`, `wait`,
  `shot`). No loops or assertions in scripts; checks read the JSON logs.
- **`wait` rounds to whole 60 Hz steps** and must be at least one step. Both the tool and
  `__game.advanceBy` use `Math.round(seconds · 60)`.
- **After every input step the tool waits two rendered frames** (`__game.settle()`) so the
  client has handled the event. The sim stays paused, so this does not change any sim state.
- **Script shots are not fps-sampled** (the sim is paused); the logs carry sim state and the
  cumulative console output instead.
- **Output goes to `artifacts/shots/<script name>/`**, and relative `--script` paths resolve
  against `INIT_CWD` (where `pnpm shot` was typed), since pnpm runs the tool from `tools/shot`.

### Hub sim (`packages/sim/src/scenarios/hub.ts`)
- **Planck.js 1.5.0** is the only new sim dependency. The boundary test now allows `planck`.
  I read its bundle: no DOM, network or timers; `Date.now` only feeds its time-of-impact
  profiling stats, and `Math.random` only backs its public `math.random` helper, which the
  engine never calls. Planck uses `Math.sin`/`cos`/`atan2` internally; the bean has fixed
  rotation, but cross-engine bit-identity is still unproven (STATUS open issue 5).
- **The sim state stays authoritative and plain JSON.** Each scenario instance owns one Planck
  world (one scenario per `Sim`). Every step copies the bean's position and velocity into
  Planck, steps it, and reads them back. Warm starting is off, so no solver impulses carry over
  between steps. Planck's contact list is still hidden state, which matters only if a snapshot
  is ever restored into a fresh world (not needed yet).
- **Only ground movement goes through Planck.** Height z is integrated exactly with the
  touchdown solved inside the step, like the drop. Jumping does not lift the bean over
  anything yet (the prototype's "hop over low objects above about 0.30 m" is not built).
- **Velocity is set directly** (no acceleration ramp), as the prototype did: walk 2.4 m/s, run
  4.2 m/s, full speed from the first step. Held input is normalised when longer than 1, so
  diagonals are no faster; shorter input (a future stick) moves proportionally slower.
- **Full air control:** ground velocity follows input in the air exactly as on the ground.
- **Bean footprint:** one circle, radius 0.25 m (PLACEHOLDER until the rig), friction 0 so it
  slides along walls and props.
- **Contact tolerance:** Planck keeps a 0.01 m skin on chains and boxes and allows 0.005 m
  overlap, so a bean resting against an edge sits between 0.005 m inside and 0.015 m short of
  it. Tests assert that band.
- **Walkable area is a rectangle** (a Planck chain loop): x −5.8..5.8 m, y −3..2 m, one prop
  footprint 0.5 × 0.4 m at (2.2, 0.2). Start (−2.5, −0.8). PLACEHOLDER layout pending D2.
- **Tap targets** are clamped to the walkable area shrunk by the bean's radius. Held keys win
  over a target and cancel it. The last step toward a target moves exactly the remaining
  distance, so the bean arrives exactly. Run applies to tap moves while Shift is held.
- **Stuck:** a step is blocked when it makes less than 25% of the intended progress toward the
  target; 21 blocked steps in a row (0.35 s) drop the target. Sliding along a prop is not stuck.
- **Facing** is the unit vector of the last ground movement, kept while idle; it starts facing
  the camera (south). The rig will map it to the 8 views.
- **Commands:** `move` (held direction plus Run), `moveTo` (tap target), `jump`. The held input
  is part of the sim state, so a replay needs only the commands.

## M0 (scaffold and verification loop), 2026-09-29

### Scope and decisions
- **The stack is scaffolding, not a decision.** The M0 prompt asked for TypeScript, pnpm, Vite,
  Phaser and Vitest, so M0 uses them. D6 (tech stack) and D14 (engine) stay **Open**. Phaser is
  confined to `packages/client`; `sim` and `shared` cannot import it (boundary test), so
  swapping the renderer would not touch the sim.
- **No Planck.js, Colyseus, database or art pipeline** (as instructed). The drop scenario uses
  a hand-written exact integrator, which is what D4's leaning proposes for teaching scenarios
  anyway.
- **Handover files** were copied from `physics-game-handover.zip` into the repo root unchanged
  (first commit). The zip and `inbox/` are git-ignored, not deleted.
- **Working name `beananza`** (from the folder name) for the package scope `@beananza/*` and the
  page title. Not a product-name decision; rename freely.

### Tooling
- **pnpm 12.6.0** pinned via `packageManager`. On this machine Corepack could not write to
  `C:\Program Files\nodejs`, so its shim was installed into `%APPDATA%\npm`.
- **TypeScript 6.0.3**, not 7.x: typescript-eslint supports TypeScript below 6.1.
- **typescript-eslint 8.70.1**, not 8.71.0: 8.71.0 was published less than a day before this
  session, and pnpm 12's default minimum-release-age policy rejects it. Upgrade once it has aged.
- **esbuild is allowed to run its install script** (`allowBuilds` in `pnpm-workspace.yaml`);
  pnpm 12 fails installs with unapproved build scripts.
- **Internal packages ship TypeScript source** (`exports` point at `src/index.ts`); only the
  client has a build step. The M2 server can run the sim with tsx or a bundler.
- **One root Vitest config**; tests live in `packages/*/test`. Sim tests have their own tsconfig
  with Node types; the sim sources do not.
- **ESLint 10 flat config** with the recommended JS and typescript-eslint rules, plus
  import, global and `Math.random` restrictions for `sim` and `shared`. No Prettier yet.
- **LF line endings** enforced with `.gitattributes` (this machine has `core.autocrlf` on).
- **Node 22.12 or newer** (`engines`), which Vite 8 requires.
- **Dev server port 5180** (preview 4180), not Vite's default 5173, which other local projects
  on this machine use.

### Sim
- **Units:** SI inside the sim, +Y up. `PIXELS_PER_METER = 100` in `shared` (the prototypes'
  "100 px is about 1 m"). The drop scene zooms its camera (about 0.6) to fit 10 m on screen,
  rather than changing the constant.
- **Timestep:** 60 Hz fixed; sim time is `tick / 60`, computed from the integer tick so it never
  drifts. The accumulator drops real time beyond 0.25 s per frame, and treats frame times
  within 1e-9 s of a whole step as a whole step.
- **Commands** queue on the `Sim` and apply at the start of the next step. A `reset` command
  restarts the drop at tick 0.
- **RNG:** mulberry32 with its 32-bit state inside the sim state (plain JSON, snapshot-able).
  The drop scenario does not consume randomness; the determinism test uses a test-only
  scenario that consumes randomness every step.
- **Gravity 9.81 m/s²** (the prompt's value), not 9.80665.
- **Drop balls are point masses** at their lowest point, so the fall distance is exactly 10 m
  whatever size they are drawn. No air resistance, no bounce. The client draws both balls the
  same size (placeholder), so equal heights read the same at the bottom and the centre; the
  mass difference is shown by color and label.
- **The boundary test also covers `packages/shared`**, since the sim imports it. It forbids
  `console`, `Date`, `performance` and timers in the sim as well as DOM, network and Node APIs.

### Client and tools
- **Rendering interpolates** between the last two sim steps; when paused it draws the exact
  current step.
- **Test hooks** (`window.__ready`, `window.__game`, `window.__bootError`) are always installed,
  including in production builds. They are small; gate them behind a flag if that matters later.
- **Default scene is `empty`.** An unknown `?scene=` logs a console error and sets `__bootError`.
- **Audio is disabled** in the Phaser config (no sound yet; also avoids autoplay warnings).
- **Fonts:** the drop scene uses the system UI font as a placeholder. Fredoka, Nunito and Caveat
  are not loaded yet (self-host or use Google Fonts: to decide with the art work).
- **The drop scene shows text** (timer, landing times, ball masses, ruler labels and a controls
  hint), despite the "no text inside game scenes" preference. It is a measurement readout in a
  proof scene the prompt asked for, and the hint is controls-only, which the preference allows.
- **tools/shot** runs Chromium's new headless mode (GPU when available) by default;
  `--software-gl` uses the SwiftShader headless shell. Output goes to `artifacts/shots/`
  (git-ignored); the M0 evidence is copied into `docs/status/m0/`.
- **Console warnings do not fail a shot**, but they are logged and counted. Errors, page errors
  and failed requests do.
