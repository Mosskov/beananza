# Beananza (working name)

A browser game that teaches high school physics through play. This repo is early in
**Milestone 1**: a TypeScript workspace, a pure fixed-step sim, a Phaser client that renders it,
a screenshot and scripted-playthrough tool used to verify every scene, and a first hub plaza
where a placeholder bean walks, runs and jumps.

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
pnpm dev               # http://localhost:5180/
```

Pick a scene with `?scene=<name>`:

| Scene | URL | What it shows |
|---|---|---|
| `empty` (default) | http://localhost:5180/?scene=empty | Background only; proves the client boots |
| `drop` | http://localhost:5180/?scene=drop | A 1 kg and a 10 kg ball released from 10 m, with a timer. R or tap: drop again |
| `hub` | http://localhost:5180/?scene=hub | The hub plaza in ¾ top-down view, with one tree to walk behind and in front of. Arrows or WASD move, Shift runs, Space jumps, tap or click walks to a spot. Placeholder art |

`&paused=1` starts the scene's sim paused at t = 0 (tools/shot uses this to step to an exact time).
An unknown scene name logs a console error listing the registered scenes.

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
- `boundary.test.ts`: fails if `packages/sim` (or the `shared` code it uses) imports Phaser,
  client code, Node or network modules, or touches DOM globals, `Date`, `performance` or
  `Math.random`. It also type-checks the sim against the ES library only. Planck.js is the one
  allowed third-party import.

Also: `packages/client/test/hub-view.test.ts` (hub projection, depth scale and draw order) and
`tools/shot/test/script.test.ts` (script validation).

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

Hub shot logs add a `view` block: the bean's screen position (feet, in viewport pixels),
depth scale and draw depth, and for each prop whether the bean is drawn `behind` it or
`in front`.

The contract between the game and the tool is `packages/shared/src/test-api.ts`.

## Layout

```
packages/
  shared/   constants (PIXELS_PER_METER) and the test-hook contract; pure TS
  sim/      fixed 60 Hz sim in SI units (m, kg, s), seeded RNG; pure TS, no Phaser/DOM.
            Side views: +Y up. Hub: ground plane x east, y north, plus height z (Planck.js
            for hub collisions)
  client/   Vite + Phaser: scenes render sim state; input becomes sim commands
tools/
  shot/     Playwright screenshot and log tool
docs/       design, decisions, implementation notes, assumptions, status
art/, reference/   design references only (never ported as code)
```

## Adding a scene

1. Create `packages/client/src/scenes/<Name>Scene.ts`. Scenes with a sim extend `SimScene`
   (fixed-step driving, pause and step-to for tools/shot); others implement `TestableScene`.
2. Give it a scene key equal to its name and register it in `packages/client/src/scenes/registry.ts`.
3. Put the rules in `packages/sim` with tests, then check it with `pnpm shot --scene <name>`.
