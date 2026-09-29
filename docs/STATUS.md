# Status

## M1, session 2: bean rig v0 and carts on a rail (2026-09-29)

Both slices are built, tested and reviewed. The user also asked for two extras during the
session: the tree and the carts drawn as SVG props, and a rider that faces the camera in a still
cart. Every check below was run and looked at in this session. Evidence is in
`docs/status/m1-s2/`, shot at `ac4eafe` with a clean tree.

**Note on M1 session 1:** this file never got an "M1, session 1" section. That session is
recorded only in `docs/ASSUMPTIONS.md` and git history (`cdbb65c`..`a22c84b`). Its checks were
re-run at the start of this session and still pass (see Test results).

### Decisions confirmed

All are recorded in `docs/DECISIONS.md`:
- **D3:** a parts rig, animated in our own code, with clips stored as data. No Spine.
- **D12, partly confirmed:**
  - Characters use 5 drawn views mirrored to 8 directions. Parts that aren't symmetrical get their own drawings for the mirrored directions, so cosmetics never jump from side to side.
  - Props that never turn are drawn once, as SVG in `art/props/`.
  - "Paper 3D" for props that must turn stays Open.
- **D4, partly confirmed:** each rail is an exact 1D sim; the carts are kinematic Planck bodies.
- **D18:** the bean is 1.14 m tall (100 art units = 1 m) and weighs 20 kg. The drawn jump height is scaled by depth. The footprint stays 0.25 m.
- **D19:** the cart numbers in SI units:
  - push 42 N, or 63 N running
  - speed caps 1.9 and 2.8 m/s
  - rolling friction 0.26 m/s², which also acts while pushing
  - restitution 0.45 at the bumpers and 0.5 between carts
  - carts of 5 kg and 20 kg, and only the 5 kg cart can be ridden
- **D20:** the default scene is `hub`.
- **D13 stays Open.** Its leaning now records that Claude draws the art as SVG text.

### What was built

| Area | What |
|---|---|
| Bean art | `art/bean/*-left.svg`: facing-left drawings of the parts that aren't symmetrical (the scarf tail and eyes) for the 3 mirrored directions. There is an art contract with checks at boot and in tests: flat part groups, required parts, and pivots derived by rule. |
| Rig (`packages/client/src/rig/`) | **View mapping:** `viewForFacing` picks the view from the sim facing (DESIGN.md §6); it's a pure function with tests.<br>**Clips as data:** idle, walk (0.56 s), run (0.34 s, 8° lean), jump, fall, land (0.13 s), push and heavy push, plus a blink every 4 s.<br>**Rig player:** a pure player samples the clips. The clip is chosen from sim state only, and animation time is sim time.<br>**Reduced motion:** drops bob, squash, stretch, breathing and waddle; poses stay.<br>**Phaser rig:** built from textures made once from the SVG parts. Mirrored views flip the drawings of the parts that aren't symmetrical back. |
| Scenes | **`bean`:** a gallery of the 8 directions and every clip at fixed times.<br>**`hub`:** the rig replaces the placeholder bean; the drawn jump height is scaled by depth; E is the action key. Plain `localhost:5180` opens the hub. |
| Carts, sim | **`packages/sim/src/rail.ts`:** an exact event-driven 1D rail that solves each step's events in time order:<br>• a cart reaching the cap or stopping<br>• a bumper hit or a cart-to-cart collision<br>• carts pressed together moving as one body<br>• riding: v·m/(m+20) getting in and back getting out<br>• a bean standing on the rail stopping carts with restitution 0<br>**`hub.ts`:** a 7.36 m rail with the 5 kg and 20 kg carts. The bean pushes only from a cart's end; from north or south it is blocked. E gets in and out, Space also gets out. A rider faces the camera while the cart is still and the way it travels while it moves. The state logs the last 16 collisions. |
| Carts, client | **Drawn carts** from `art/props/cart.svg`. The wheels roll on the near rail, and the rider draws between the cart's back and front.<br>**Speed readout** in m/s above each cart (D17).<br>**Drawing fixes:** next to a cart's end, the bean is drawn back so its wider body doesn't overlap (drawing only). |
| Props | `art/props/tree.svg` and `cart.svg`, loaded by part id through the rasterizer shared with the bean (`packages/client/src/art/`). |
| tools/shot | `--reduced-motion` (writes to `<out>/reduced-motion/`). Four cart scripts. `pnpm shot:check-carts` recomputes acceleration, momentum, restitution, riding speeds and readouts from the logs. |
| Docs | README (scenes, scripts, checks), `art/README.md` (bean and prop contract), `docs/ASSUMPTIONS.md` "M1 session 2", CLAUDE.md scene and art lines |

The session's commits run from `e292b4e` to `ac4eafe`, plus this status.

### Test results

**`pnpm check`** exits 0 at `ac4eafe`: 177 tests in 13 files pass, and so do typecheck, lint and the build. The new tests:
- **`views.test.ts`:** every row of the DESIGN.md §6 table, inside values and both edges. It starts from the sim's facing, and also covers the exact boundaries, the 8 compass directions and mirrored body reach.
- **`bean-art.test.ts`:**
  - the art contract
  - the scarf tail stays on the bean's left in all 8 directions
  - eye highlights stay on the light side
  - pivots, and rejecting broken art
- **`player.test.ts`:**
  - clip timings, and each clip at its key times
  - reduced motion
  - choosing clips (jump, fall, land, push, riding)
- **`prop-art.test.ts`:** the tree and cart parts, the wheel pivots and radius.
- **`hub-view.test.ts`:** adds the depth-scaled jump height and the stand-off from the cart.
- **`rail.test.ts`:**
  - push acceleration F/m − 0.26 up to the cap, walking and running, for 5 and 20 kg
  - pushing against the motion, and pushing two carts as one body
  - friction, and stopping at v²/(2·0.26)
  - bumper restitution, with the impact time solved exactly
  - momentum and e = 0.5 in cart collisions (4 cases), and the impact time
  - a bean stopping carts
  - riding both ways
  - 10,000-step determinism
- **`hub-carts.test.ts`:**
  - pushing only from a cart's end; north and south are blocked
  - pushing on a diagonal, and not along the side
  - E and Space in and out
  - riding speeds, and rider facing (still, east, west, turning back)
  - a cart stopped by a standing bean
  - a push into the other cart
  - 10,000-step determinism with pushes, rides and jumps
- The M0 and M1 session 1 tests (drop, hub movement, determinism, boundary) all still pass. The boundary test has 21 checks.

**Scripts:** `pnpm shot:check-carts`, run on the logs, passes every check. Recomputed from the logged masses, velocities and sim times:
- Push acceleration: 8.14 m/s² for 5 kg and 1.84 m/s² for 20 kg (F/m − 0.26), with the cap at exactly 1.9 m/s.
- Collision at t = 2.9173 s: 5 kg goes from 1.6615 to −0.3323 m/s and 20 kg from 0 to 0.4985 m/s. Momentum is 8.3075661418 kg·m/s before and after, and restitution is exactly 0.5.
- Riding: getting in, 1.9 becomes 0.375667 m/s (= 1.9·5/25 − 0.26/60). Getting out, 0.245667 becomes 1.224 m/s (= ×25/5 − 0.26/60).
- Every readout matches |v| to two decimals.

### Screenshot results

I looked at every PNG at `ac4eafe`. All shots have 0 console errors and 0 warnings, except software GL, as in M0.

| Evidence | What the image and log show |
|---|---|
| `docs/status/m1-s2/bean.png` | Row 1: S front, SE front ¾, E side, NE back ¾, N back, NW back ¾ mirrored, W side mirrored, SW front ¾ mirrored. The scarf tail is on the bean's left in all 8, behind the body facing east and in front facing west. Rows 2–4 show walk, run, jump, fall, land, breathing and blink at fixed times. |
| `docs/status/m1-s2/reduced-motion/bean.png` | Same poses. The log has body y 0 and scale 1 in every cell; the run lean stays at 8°. |
| `hub.png` | The drawn tree, both carts on the rail at 0.00 m/s, the rig bean, and the hint "… Action: E" |
| `hub-walk/*.png` | 2.4 m in 1.0 s, 4.2 m running back (mirrored side view, run clip), and the diagonal in back ¾ |
| `hub-jump/*.png` | Apex z 0.7679 m at 0.4 s, drawn 60.5 px up (0.768·100·0.788); landed at 1.0 s |
| `hub-depth/*.png`, `hub-depth-tie/*.png` | Behind the tree (trunk and canopy over the bean) and in front of it, including the same ground row. The log and image agree. |
| `hub-carts-push/*.png` | The push pose with hands on the cart's end; 0.68 then 1.49 then 1.90 m/s; the cart coasts, then collides and bounces (0.05 and 0.22 m/s) |
| `hub-carts-heavy/*.png` | The west push mirrors the east push. Drawn gaps are 87.2 px (east) and 90.7 px (west); the difference is only the 16° against 10° lean. |
| `hub-carts-ride/*.png` | The rider between the cart's back and front, readout above its head; getting out to the south as the cart speeds up to 1.22 m/s |
| `hub-carts-board-still/in-still-cart.png` | A rider in a still cart faces the camera (log: facing (0, −1), front view) |
| `drop_t1.000.png`, `drop_t1.500.png` | Both balls level at y = 5.095 m at 1.0 s; both landed at 1.42784 s by 1.5 s |

### FPS as measured (informational)

- **Headless GPU** (RTX 5070 Ti, D3D11), measured with rAF:
  - hub (rig, carts, readouts): 170.01 fps, 5.88 ms average frame, 6.1 ms maximum
  - bean gallery (32 rigs): 170 fps
  - empty and drop: 170 fps
  - Phaser's `actualFps` reads about 107–108 (M0 open issue 3).
- **Software GL** (SwiftShader, no GPU; `docs/status/m1-s2/software-gl/`):
  - hub and bean: 60 fps, 16.67 ms average frame, 16.8 ms maximum
  - hub logs the 4 known "GPU stall due to ReadPixels" warnings
- **Still not measured:** real Chromebooks and phones.

### Review gate

A separate reviewer subagent ran 3 rounds. It wrote no code, used fresh clones at `E:/rv2`, `E:/rv3` and `E:/rv4` (still on disk; delete when you like) on port 5190, and looked at every PNG.

**Round 1**, at `346df9b`: all 9 checklist items passed. Its should-fix findings:
- A cart shoved a bean standing on the rail along at full speed, so the bean walked backwards.
- The bean overlapped the cart it pushed.
- This file was stale.

Its nits: the heavy-push wording, the CLAUDE.md scene list, the gallery log missing the blink time, and the readout touching the rider's head.

**Fixed in `f860d2d`:**
- A standing bean now stops carts, logged as a `bean` collision.
- The bean is drawn back from the cart while pushing.
- Arms reach the cart.
- The nits above.

**Round 2**, at `e7b86b9`, after the prop art: all items passed. Its should-fix findings:
- A standing bean still overlapped a cart.
- The shadow didn't move with the draw-back.

Its nits: the wheels sat between the rails, the D12 wording, and the "reference only" notes.

**Fixed in `408bacb`:** a general stand-off based on the art's body bounds, and carts on the near rail. Then the user noticed pushing west looked different from pushing east. That was a sign bug for mirrored views in the new stand-off, fixed in `8d821e1` with a test.

**Round 3**, at `8d821e1`: all items passed, with no should-fix findings. Its one optional nit, a test for a rider facing west, was added in `ac4eafe`.

### Open issues

1. **Interaction states don't scale yet.** Riding and pushing are separate flags with branches in `hub.ts`, and `HubScene` has per-case drawing rules. See the plan below.
2. **The rider is wider than the cart.** The bean's body (about 0.87 m drawn by the rail) sticks out past the 0.8 m cart. The prototype clipped the rider below the rim; that could come with a hop-in animation.
3. **Getting in and out are instant.** There is no hop yet (the prototype hopped in about 0.32 s plus a little per metre).
4. **The footprint (0.25 m) is narrower than the drawn body.** The client draws the bean back next to cart ends, but it can still overlap other props from the side, for example the tree. A wider footprint would be a D18 change.
5. **A bean mid-jump over the rail still stops a cart.** Hopping over low objects isn't built.
6. **Readouts show speed, not direction.** After the collision, 0.05 m/s west and 0.22 m/s east look alike. Direction may matter for the momentum lessons.
7. **No effort face, sweat drop or dust puffs yet,** and no visual cart bounce above 0.45 m/s.
8. **Pivots come from rules, not markers in the SVGs.** Belly height and cart floor height are constants in code. Anchor markers in the SVGs would replace them (ART_PIPELINE.md §2).
9. **No on-screen touch buttons,** so phones can't get into a cart or jump. This was out of scope.
10. **Carried over:**
    - no real-device fps (M0 issue 4)
    - cross-engine determinism with Planck's trig (M0 issue 5)
    - test hooks in production builds (M0 issue 6)
    - fonts not loaded (M0 issue 7)
    - no CI (M0 issue 9)
    - the drop scene's mass labels overlap the 10 m line near the release (reviewer nit)
    - the tree's greens are new colours, not in the palette table
11. **M0's open issues 1 and 2 are resolved:** D6 and D14 were confirmed in M1 session 1, and D17 allows measurement readouts. The M0 section below still lists them as they were at the time.

### Proposed plan for the next session

1. **Interaction states first**, my recommendation for making the next interactions maintainable:
   - one interaction state on the bean (`free`, `pushing`, `boarding`, `riding`, `leaving`, then `sitting`), with one sim module per interaction
   - timed transitions with a start time, such as the hop into the cart
   - a facing rule per state
   - a client table mapping state to clip, visible parts and where the bean draws relative to the prop
   - anchor markers in the SVGs (cart floor, seat, hands)
   - move pushing and riding into this without changing their numbers; the existing tests and `shot:check-carts` must still pass
2. **The bench and sitting** (DESIGN.md §6 and §7):
   - the bench as a solid prop drawn in `art/props/`
   - tap or E to walk over and sit (a 0.35 s hop arc); any movement input stands the bean up
   - feet dangle; the bean dozes after 5 s
   - Priya seated, with "Hi!" and a wave (D2 layout is still Open, so the bench goes in the placeholder plaza)
3. **Customization basics:** color, one pattern, three headwear pieces, one face.
   - Color: palette swaps in the SVG before textures are made.
   - Pattern: overlays masked to the body.
   - Headwear: anchored at the top of the body.
   - D7 (body forms) comes up here.
4. **Open for you:** D2 (hub layout), D7 (body forms), D9 (first expedition), and the D12 prop part (paper 3D).

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
