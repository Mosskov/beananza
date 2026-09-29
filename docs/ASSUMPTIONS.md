# Assumptions

Routine choices made while building, logged so they can be reviewed and reversed. None of them
changes a decision in `docs/DECISIONS.md`. Newest milestone first.

## M1 session 1 (tools/shot scripts, hub plaza, movement), 2026-09-29

### Decisions confirmed at the start of the session
D1 (¾ top-down), D14 (web, TypeScript + Phaser), D6 in part (TypeScript, Phaser, Vite, Vitest,
Planck.js), D4 in part (Planck.js for hub collisions), and the new D15 (hub coordinates), D16
(realistic hub jump) and D17 (measurement readouts allowed). See `docs/DECISIONS.md`. The M0
note "the stack is scaffolding, not a decision" no longer applies to those parts.

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
