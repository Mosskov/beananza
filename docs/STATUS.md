# Status

## Milestone 0: scaffold and verification loop (2026-09-29)

M0 is complete. Every check below was run and looked at in this session. No decision in
`docs/DECISIONS.md` was changed: D6 (stack) and D14 (engine) are still **Open**, and the Phaser
scaffold is waiting for your confirmation (see open issue 1).

### What was built

| Area | What |
|---|---|
| Workspace | pnpm 12 workspace (`packages/shared`, `packages/sim`, `packages/client`, `tools/shot`), TypeScript 6 strict, ESLint 10, Vitest 5. No `packages/server`. |
| `shared` | `PIXELS_PER_METER = 100`, and the contract for the test hooks (`window.__ready`, `window.__game`, `window.__bootError`) |
| `sim` | Pure TypeScript. SI units, +Y up. Fixed 60 Hz `FixedStepper` with an accumulator (0.25 s stall cap). Seeded mulberry32 RNG whose state lives in the sim state. A generic `Sim` runner: commands in, plain-JSON state out. |
| Drop scenario | 1 kg and 10 kg point masses released from 10 m. Integration is exact for constant gravity, and ground contact is solved analytically within the step. `reset` command. |
| `client` | Vite 8 + Phaser 4.2.1. A scene registry: `?scene=<name>` picks a scene and `?paused=1` starts its sim paused. `SimScene` base (the sim steps in fixed steps; the scene draws interpolated state). Scenes: `empty`, `drop`. |
| Drop scene | Side view with a metre ruler, the release height, and a line joining the two ball bottoms. Readout of t and landing times. R or a tap sends `reset` to the sim. Placeholder circles, marked as such in the code. |
| `tools/shot` | Playwright tool. Reuses or starts the dev server, waits for `__ready`, and can step to an exact sim time. Writes a PNG and a JSON log: console errors and warnings, page errors, failed requests, fps and frame time, WebGL renderer, scene, sim time, sim state, git commit. Exits non-zero on any error. |
| Docs | `README.md` (how to run the game, the tests and tools/shot), `docs/ASSUMPTIONS.md`, and the Commands section of `CLAUDE.md` |

Commits, oldest first:
- `a7d382a` import the handover
- `6fe68b1` workspace and sim core
- `14bc3c6` client and tools/shot
- `28f9fdc` drop scenario
- `3eb9d1a` drop scene
- `4a75940` docs
- `4f86e7d` review fixes
- then this status.

### Test results

`pnpm check` (typecheck, lint, test, build): exit 0 at `4f86e7d`. Vitest ran 4 files and 38 tests; all passed.

- `packages/sim/test/determinism.test.ts`:
  - The same seed and inputs give an identical state after 10,000 steps. The test scenario consumes randomness every step and gets commands.
  - A different seed gives a different state.
  - Irregular frame times through the accumulator give the same state as direct stepping.
- `packages/sim/test/drop.test.ts`:
  - Both balls land at sqrt(2·10/9.81) = 1.42784 s. The landing step is within one step of that, and the solved contact time matches to 1e-9.
  - Both balls are at the same height at every step.
  - y = h − ½gt² at t = 1 s (5.095 m).
  - Both balls are down by t = 1.5 s.
  - The 10,000-step replay of this scenario is identical.
- `packages/sim/test/boundary.test.ts`:
  - `sim` and `shared` import nothing except each other: no Phaser, client, Node or network code. They use no DOM, network, timer, `Date`, `performance` or `Math.random` globals.
  - The sim type-checks against the ES library only.
  - 17 known-bad snippets must be caught. The reviewer also injected violations into `sim/src/time.ts` and confirmed the test fails.
- `packages/sim/test/time.test.ts`: covers the 60 Hz accumulator behaviour, the stall cap, the interpolation factor, and tick-to-seconds conversion without drift.

### Screenshot results

All shots were taken at commit `4f86e7d` with a clean tree. Evidence (PNG plus JSON) is copied to `docs/status/m0/`. I looked at every PNG.

| Shot | Errors / warnings | Sim time | What the image and log show |
|---|---|---|---|
| `docs/status/m0/empty.png` | 0 / 0 | n/a | Cream background; the client boots |
| `docs/status/m0/drop.png` (live) | 0 / 0 | 2.083 s | Both balls on the ground; "landed at 1.428 s" twice |
| `docs/status/m0/drop_t0.000.png` | 0 / 0 | 0.000 s | Both balls at the 10 m release line |
| `docs/status/m0/drop_t1.000.png` | 0 / 0 | 1.000 s | Both balls level just above the 5 m tick; the log has y = 5.095 m for both, and vy = −9.81 m/s |
| `docs/status/m0/drop_t1.500.png` | 0 / 0 | 1.500 s | Both balls on the ground; the log has landedAt = 1.4278431 s for both |

I also checked the drop scene running live in the browser: R and a tap each restart the drop (0.317 s after R, both balls were at 9.508 m, which matches h − ½gt²), with no console errors.

### FPS as measured (informational, not a gate)

- **Headless Chromium 153, new headless mode on this machine's GPU** (RTX 5070 Ti, D3D11):
  - rAF sampling gave 170 fps, 5.88 ms average frame and 6.1 ms maximum, for both scenes.
  - Phaser's `loop.actualFps` reported about 108 at the same time (open issue 3).
- **`--software-gl`** (headless shell with SwiftShader, no GPU):
  - The drop scene ran at 60 fps, 16.67 ms average frame and 16.8 ms maximum.
  - This mode logs 4 "GPU stall due to ReadPixels" console warnings. They come from Chromium reading back the WebGL canvas in software, not from game code, and they do not appear in the default GPU mode.
  - Log: `artifacts/shots-swgl/drop.json`. It is not committed.
- **Not measured yet:** real school Chromebooks and phones, which are the stated baseline.

### Review gate

A separate reviewer subagent that wrote no code ran from a clean clone. It checked install, build, typecheck, lint, tests, `pnpm shot --all`, drop at 1.0 s and 1.5 s (it opened the images), the boundary test, units and timestep against `docs/IMPLEMENTATION.md` §3, the README, and that `docs/DECISIONS.md` is unchanged.

**Round 1:** it passed all 5 items and found no blockers. Its findings and what happened to them:
1. `docs/STATUS.md` was missing: this file.
2. `--all --t` failed on the `empty` scene: fixed. Scenes without a sim are now shot live, with a note in the log.
3. The README overstated what `pnpm build` checks: fixed.
4. tools/shot hardcoded `'empty'` as the fallback scene: fixed. It now asks the game for its default scene.
5. The balls had different radii, so their centres differed even when they were level: fixed. Both are now drawn the same size.

**Round 2** was a fresh reviewer and clean clone at `9d9621e`. It passed all items and confirmed each round 1 fix:
- `--all --t 1.0` exits 0, and the `empty` log carries the note.
- Plain `pnpm shot` uses the game's default scene.
- The balls are level at both centre and bottom at 1.0 s.
- The STATUS numbers match the committed logs, and it reproduced the `--software-gl` numbers.

It found three wording nits in this file, fixed in the final commit:
- the round 2 placeholder, now this entry;
- open issue 5's list of math operations;
- the M1 section, where the decision list overstated what ROADMAP.md says blocks M1.

No round 3 was needed, and nothing failed.

### Open issues

1. **D6 and D14 (stack and engine) are still Open.** M0 uses Phaser because the M0 prompt asked for it. Phaser is confined to `packages/client`. Please confirm or redirect before M1 builds more on it. I did not change `docs/DECISIONS.md`.
2. **Text in the drop scene:** a timer, landing times, masses, ruler labels, and the controls hint "R or tap: drop again". This conflicts with the "no text inside game scenes" preference unless measurement readouts count as an exception. It needs your call. The field-notebook overlay style would be the natural home for it.
3. **Phaser's `actualFps` (about 108) disagrees with rAF sampling (170)** in headless GPU mode. Not investigated. Treat headless fps as informational.
4. **No fps numbers from real target devices** (Chromebooks, phones).
5. **Cross-engine determinism:** the sim so far uses only operations that are exactly specified: `+ − × ÷`, `sqrt`, `floor`, `min`/`max`, `Math.imul` and integer bit operations. `Math.sin`, `Math.exp` and the like are not guaranteed bit-identical across JS engines. This matters once a Node server is the authority in M2. Both would be V8, but that should be tested when it arrives.
6. **Test hooks ship in production builds.** They are tiny, but should be gated if that matters.
7. **Brand fonts are not loaded** (Fredoka, Nunito, Caveat). Placeholder system font for now.
8. **typescript-eslint is pinned to 8.70.1** because pnpm 12's minimum release age rejected 8.71.0. Bump it later.
9. **No CI yet.** `pnpm check` and `pnpm shot --all` are ready to run in one.
10. **Environment notes for this machine:**
    - The Corepack pnpm shim was installed into `%APPDATA%\npm`, because Program Files is not writable.
    - Stopping a background `pnpm dev` on Windows can leave the Vite child process running; end it by PID.
    - Another local project uses port 5173, which is why this repo uses 5180.

### Assumptions

All logged in `docs/ASSUMPTIONS.md`. The ones most worth a look:
- The stack is scaffolding, not a decision (see open issue 1).
- `PIXELS_PER_METER = 100`, with the camera zoomed per scene.
- g = 9.81 m/s².
- Balls are point masses at their lowest point, with no drag or bounce.
- Commands apply at the start of the next step.
- Dev port 5180.
- tools/shot uses the GPU headless mode by default.
- Working package scope `@beananza/*`.

## Proposed plan for M1 (single-player vertical slice)

**Decisions to settle first.** `docs/ROADMAP.md` only gates the expedition on D9. My recommendation is to settle these before building on them:
- D6/D14: stack and engine.
- D1: hub camera, with ¾ top-down as the leaning.
- D3: parts rig.
- D12: rotation.
- D4: whether Planck.js enters for hub collisions or M1 stays with hand-written exact 1D/2D sims.
- Whether hub jump gravity is realistic or stylized (the prototype used 1500 px/s²).
- D9: the first expedition needs a design pass before slice 7.

**Slices.** Each is small and runnable, with sim tests, a registered scene, and `tools/shot` evidence:
1. **Scripted input for tools/shot:** `--script` with timed commands such as key presses, taps and waits. This lets playthroughs be verified, as the prototype workflow did.
2. **Hub plaza scene (`hub`):**
   - The sim is a 2D ground plane in metres. The client adds the ¾ projection.
   - Walkable-area bounds.
   - Depth scale `0.62 + 0.30·t` and automatic y-sort.
3. **Movement in the sim:**
   - Walk 2.4 m/s and run 4.2 m/s, re-derived from the prototype's 240 and 420 px/s. Jump as decided.
   - Keyboard and tap-to-move become commands. Tap targets are clamped, and a move cancels when stuck for 0.35 s.
   - Tests pin the tuned numbers.
4. **Bean rig v0** from `art/bean/*.svg` parts:
   - 5 views mirrored to 8 directions, with the angle mapping from DESIGN.md §6 unit-tested.
   - Animation clips as data (idle, walk, run, jump, land).
   - Reduced-motion fallback.
5. **Carts on a rail:**
   - Exact 1D sim with push force, speed caps, rolling friction, bumper and cart-to-cart restitution, momentum conservation, and riding (v' = v·m/(m+3)).
   - Tests such as "momentum is conserved in cart collisions".
   - Speed shown in m/s.
6. **Bench and sit, then customization basics:** color, one pattern, three headwear pieces, one face.
7. **Expedition prototype** once D9 is designed: side-view projectile with predict, launch, compare, and a local notebook.
8. **CI:** run `pnpm check` and `pnpm shot --all` on every push, and keep the shots as artifacts.
