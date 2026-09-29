# Beananza (working name)

A browser game that teaches high school physics through play. This repo is early in
**Milestone 1**: a TypeScript workspace, a pure fixed-step sim, a Phaser client that renders it,
a screenshot and scripted-playthrough tool used to verify every scene, and a first hub plaza
where the bean (a rig built from the drawn parts in `art/bean/`) walks, runs, jumps and pushes
or rides carts on a rail.

Start with `CLAUDE.md` and `docs/` (design, decisions, implementation notes). Only what
`docs/DECISIONS.md` marks as confirmed is approved; everything else is a proposal. Current
state: `docs/STATUS.md`. Routine choices made while building: `docs/ASSUMPTIONS.md`.

## Requirements

- Node.js 22.12 or newer (developed on Node 24)
- pnpm 12.6.0, pinned in `package.json` (`packageManager`). With Corepack:
  `corepack enable pnpm`. If that fails with EPERM on Windows (Node in Program Files), use
  `corepack enable --install-directory "%APPDATA%\npm" pnpm` or `npm i -g pnpm@12.6.0`.

## Setup

```sh
pnpm install
pnpm shot:install      # once: downloads Playwright's Chromium for tools/shot
```

pnpm refuses packages published less than a day ago (its default supply-chain policy). If an
install fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, pin the previous version of the
package it names.

## Run the game

```sh
pnpm dev               # http://localhost:5180/ (opens the hub)
```

Pick a scene with `?scene=<name>`:

| Scene | URL | What it shows |
|---|---|---|
| `empty` | http://localhost:5180/?scene=empty | Background only; proves the client boots |
| `drop` | http://localhost:5180/?scene=drop | A 1 kg and a 10 kg ball released from 10 m, with a timer. R or tap: drop again |
| `hub` (default) | http://localhost:5180/?scene=hub | The hub plaza in ¾ top-down view, with one tree to walk behind and in front of, and a rail with a 5 kg and a 20 kg cart (speed shown in m/s). Arrows or WASD move, Shift runs, Space jumps, tap or click walks to a spot. Walk into a cart's end to push it (Shift pushes harder); E gets in or out of the 5 kg cart, Space also gets out. The bean, the tree and the carts are drawn art from `art/`; the plaza floor and the rail are placeholder shapes |
| `bean` | http://localhost:5180/?scene=bean | Rig gallery for review: the 8 directions, then walk, run, jump, fall, land, breathing and a blink at fixed clip times (labelled; no sim) |

`&paused=1` starts the scene's sim paused at t = 0 (tools/shot uses this to step to an exact time).
An unknown scene name logs a console error listing the registered scenes. The bean art is
checked against the art contract and rasterized before any scene starts; broken art is a boot
error.

The game follows `prefers-reduced-motion`: the bean loses its bob, squash, stretch, breathing
and waddle, but still changes pose (see `docs/ASSUMPTIONS.md`, M1 session 2).

Production build: `pnpm build` (output in `packages/client/dist`), then `pnpm preview`
(http://localhost:4180/).

## Tests and checks

```sh
pnpm test              # Vitest: sim timing, determinism, drop and hub physics, sim boundary, tools
pnpm typecheck         # tsc in every package
pnpm lint              # ESLint
pnpm build             # typecheck the client, then Vite production build
pnpm check             # all of the above
```

Key tests (in `packages/sim/test/`):
- `determinism.test.ts`, `drop.test.ts`: the same seed and inputs give an identical state after
  10,000 steps.
- `drop.test.ts`: both balls land at sqrt(2·10/9.81) ≈ 1.428 s, within one step.
- `hub.test.ts`: walk 2.4 m/s and run 4.2 m/s, diagonals no faster, jump apex 0.768 m and
  air time 2·v₀/g ≈ 0.791 s under 9.81 m/s², air control, walkable bounds and the prop, tap
  targets (arrive, clamp, cancel after 0.35 s stuck), and 10,000-step determinism with
  scripted input.
- `rail.test.ts`: carts on the rail: push acceleration F/m − 0.26 m/s² up to the cap (walking
  and running), rolling friction, bumper (0.45) and cart-to-cart (0.5) restitution, momentum
  conservation, the impact time, riding (v·m/(m+M) and back), and 10,000-step determinism.
- `hub-carts.test.ts`: carts in the hub: pushing only from a cart's end (blocked from north and
  south), E and Space to get in and out, riding speeds, a push into the other cart, and
  10,000-step determinism with scripted pushes, rides and jumps.
- `boundary.test.ts`: fails if `packages/sim` (or the `shared` code it uses) imports Phaser,
  client code, Node or network modules, or touches DOM globals, `Date`, `performance` or
  `Math.random`. It also type-checks the sim against the ES library only. Planck.js is the one
  allowed third-party import.

Also, in `packages/client/test/`:
- `hub-view.test.ts`: hub projection, depth scale, drawn jump height and draw order.
- `views.test.ts`: the facing-to-view mapping (5 views mirrored to 8), every row and boundary of
  the table in `docs/DESIGN.md` §6, starting from the sim's facing.
- `bean-art.test.ts`: the art contract for `art/bean/*.svg` (required parts, flat groups,
  facing-left drawings for asymmetric parts, the scarf tail on the bean's left in all 8
  directions, eye highlights on the light side, pivots).
- `prop-art.test.ts`: the art contract for `art/props/*.svg` (the tree and cart parts, wheel
  pivots and radius).
- `player.test.ts`: clip data and timings, the rig player, reduced motion, and choosing the clip
  from sim state.

And `tools/shot/test/script.test.ts` (script validation).

## tools/shot

Opens a scene in headless Chromium, optionally steps its sim to an exact time, and writes a PNG
plus a JSON log.

```sh
pnpm shot --all                                  # every registered scene, running live
pnpm shot --scene drop --t 1.0 --t 1.5           # drop scene at exactly t = 1.0 s and 1.5 s
pnpm shot --help                                 # all options
```

- **Server:** reuses a running `pnpm dev` on port 5180, or starts Vite in-process (and stops it
  afterwards). If another app holds the port, it starts on a free port instead. `--url <url>`
  points it at any server, such as `pnpm preview`.
- **Readiness:** waits for `window.__ready`, which the game sets once the scene has rendered.
- **Time:** with `--t`, the page loads with `?paused=1`, and the tool calls
  `window.__game.advanceTo(t)`, which steps the sim in whole fixed steps (t = 1.0 is exactly
  step 60).
- **Output:** `artifacts/shots/<scene>[_t<time>].png` and `.json` (git-ignored). The log holds
  console errors and warnings, page errors, failed requests, average fps and frame time over a
  2 s sample, the WebGL renderer, the scene name, the sim time, the scene's sim state, and the
  git commit (with a dirty flag).
- **Scenes without a sim** (like `empty`) ignore `--t`: they are shot live and the log says so.
- **Exit code:** non-zero if any shot has a console error, page error or failed request, or never
  becomes ready. Warnings are logged but do not fail the run.
- **Reduced motion:** `--reduced-motion` runs the page with `prefers-reduced-motion: reduce`
  and writes to `artifacts/shots/reduced-motion/` (works with scenes and scripts). Compare
  `pnpm shot --scene bean` with `pnpm shot --scene bean --reduced-motion`.
- **GPU:** by default it uses Chromium's new headless mode, which renders WebGL on the GPU when
  there is one. `--software-gl` uses the headless shell with SwiftShader (no GPU); that mode logs
  "GPU stall due to ReadPixels" warnings for WebGL canvases. Headless fps is informational only.

### Scripted playthroughs (`--script`)

```sh
pnpm shot --script tools/shot/scripts/drop-reset.json
```

A script is a JSON file naming a scene and a list of steps, each with exactly one action:

```json
{
  "scene": "drop",
  "steps": [
    { "wait": 1.0 },
    { "shot": "t1" },
    { "press": "KeyR" },
    { "wait": 0.5 },
    { "shot": "after-r" }
  ]
}
```

| Action | Value | What it does |
|---|---|---|
| `keyDown` / `keyUp` | Playwright key name (`"ArrowRight"`, `"KeyW"`, `"ShiftLeft"`, `"Space"`) | Hold or release a key |
| `press` | key name | Press and release a key |
| `tap` | `[x, y]` in viewport pixels (1280×720 by default, same as the game) | Click or tap there |
| `wait` | seconds of sim time | Step the sim forward, rounded to whole 60 Hz steps (at least one) |
| `shot` | name (lowercase, digits, `-`, `_`; unique) | Write `<name>.png` and `<name>.json` |

- **Deterministic:** the scene opens with `?paused=1` and the sim only moves on `wait` steps,
  in whole fixed steps. The same script always gives the same states.
- **Real input path:** keys and taps go through Playwright's keyboard and mouse into the page,
  so the client's own input handling turns them into sim commands. After each input the tool
  waits two rendered frames (`__game.settle()`) so the event is handled; the paused sim does not
  move. A command queued by an input applies at the start of the next sim step.
- **Output:** `artifacts/shots/<script file name>/<shot>.png` and `.json`, plus `run.json` for
  the whole run. Each shot log has the sim time, the scene's sim state (and, for scenes that
  provide it, what was drawn where), every step run so far with the sim time it ran at, and the
  console output since the page loaded.
- **Exit code:** non-zero if the script is invalid, a step throws, or the page logs any console
  error, page error or failed request.
- `--script` is repeatable and cannot be combined with `--scene`, `--all` or `--t`. Run
  `pnpm shot` from the repo root: relative `--script` and `--out` paths resolve against it.
- Script file names must be lowercase letters, digits, `-` or `_` (plus `.json`), and two
  scripts in one run cannot share a file name. Each run first removes the `.png` and `.json`
  files in its own output folder. The shot name `run` is reserved for `run.json`.

Scripts in `tools/shot/scripts/`:

| Script | Checks |
|---|---|
| `drop-reset.json` | The drop at t = 1.0 s; R and a tap each restart it |
| `hub-walk.json` | Hold → for 1.0 s (2.4 m), Shift + A for 1.0 s (4.2 m back), ↑ + → for 0.5 s |
| `hub-jump.json` | Space: apex at 0.4 s, landed at 1.0 s; then a jump while holding D (air control) |
| `hub-depth.json` | Taps to walk north of the tree (drawn behind it), then south (drawn in front), then a tap straight through the tree (target dropped after 0.35 s stuck) |
| `hub-depth-tie.json` | The bean on the same ground row as the tree (east of the trunk, mid-jump): drawn in front, and the log says so |
| `hub-carts-push.json` | Walk west of the 5 kg cart, push it east (two shots 0.1 s apart while it speeds up, then at the 1.9 m/s cap), let go; it rolls into the 20 kg cart |
| `hub-carts-heavy.json` | Walk east of the 20 kg cart and push it west: the same 42 N gives F/m a quarter as large, so the net acceleration is 42/20 − 0.26 = 1.84 m/s² against 8.14 m/s² for the 5 kg cart |
| `hub-carts-ride.json` | Push the 5 kg cart to the cap, E to get in (speed × 5/25), ride, E to get out (speed × 25/5) |
| `hub-carts-board-still.json` | Walk to the resting 5 kg cart and press E: the rider faces the camera (it faces the way the cart travels while it moves) |

After the three cart scripts, `pnpm shot:check-carts` recomputes from their logs the push
accelerations (F/m − 0.26 m/s²), the cap, momentum and restitution of the collision, the riding
speeds and every speed readout, and exits non-zero on any mismatch.

Hub shot logs add a `view` block: the bean's screen position (feet, in viewport pixels),
depth scale and draw depth, the rig (`view`, `mirrored`, `clip`, clip time and the pose's body
transform), `reducedMotion`, and for each prop whether the bean is drawn `behind` it or
`in front`. The `bean` gallery's log lists every cell's view, clip, time and body transform.
The hub state carries `bean.pushing`, `bean.riding` and `rail` (each cart's mass, position and
velocity, and the last 16 collisions with the velocities before and after); the `view` block
adds each cart's readout text.

The contract between the game and the tool is `packages/shared/src/test-api.ts`.

## tools/share

Builds a static preview site for coworkers (teachers and developers) into `artifacts/share/`:

```sh
pnpm share            # build the site (needs pnpm shot:install once)
pnpm share:preview    # serve it at http://localhost:4190
pnpm share:dry-run    # rebuild, then check the Cloudflare deploy without uploading
pnpm share:deploy     # rebuild, then deploy (needs `npx wrangler login` once)
```

- **Page** (`index.html`): the pitch, the playable game, and sections for teachers (DESIGN.md
  §1, 2, 8, 10, 11, 12), the roadmap (ROADMAP.md, with progress from STATUS.md), every decision
  (DECISIONS.md, filterable, `#D9` opens D9) and developers (IMPLEMENTATION.md §3 and the newest
  STATUS.md report). It is rendered from the docs on every run, so it never drifts from them.
  If a doc loses a heading the page uses, the build fails and names it.
- **Game** (`play/`): a production build with relative paths, loaded only when a visitor
  presses Play. `play/?scene=bean` and `play/?scene=drop` work too.
- **Screenshots** (`shots/`): taken with tools/shot from that same build.
- **No third-party requests:** the fonts (Fredoka, Nunito, Caveat) are self-hosted from
  `@fontsource`. The build fails if the page would contain a private claude.ai link.
- The folder is plain static files; any file server can host it.
- **Cloudflare:** `tools/share/wrangler.jsonc` deploys the folder as the Worker `beananza`
  (static files only), served at `beananza.<account subdomain>.workers.dev`. Deploying always
  rebuilds first. `tools/share/site/_headers` sets `noindex`, `nosniff`, no referrer, and
  long caching for the game's hashed files. Build from `main` so the page shows the latest status.

## Layout

```
packages/
  shared/   constants (PIXELS_PER_METER) and the test-hook contract; pure TS
  sim/      fixed 60 Hz sim in SI units (m, kg, s), seeded RNG; pure TS, no Phaser/DOM.
            Side views: +Y up. Hub: ground plane x east, y north, plus height z (Planck.js
            for hub collisions)
  client/   Vite + Phaser: scenes render sim state; input becomes sim commands.
            src/rig/: bean art contract, facing-to-view mapping, clips as data, rig player,
            and the Phaser rig
tools/
  shot/     Playwright screenshot and log tool
  share/    builds the preview site for coworkers (docs, screenshots, playable build)
docs/       design, decisions, implementation notes, assumptions, status
art/, reference/   design references only (never ported as code)
```

## Adding a scene

1. Create `packages/client/src/scenes/<Name>Scene.ts`. Scenes with a sim extend `SimScene`
   (fixed-step driving, pause and step-to for tools/shot); others implement `TestableScene`.
2. Give it a scene key equal to its name and register it in `packages/client/src/scenes/registry.ts`.
3. Put the rules in `packages/sim` with tests, then check it with `pnpm shot --scene <name>`.
