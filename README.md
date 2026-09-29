# Beananza (working name)

A browser game that teaches high school physics through play. This repo is at **Milestone 0**:
a TypeScript workspace, a pure fixed-step sim, a Phaser client that renders it, and a
screenshot tool used to verify every scene. There are no game features yet.

Start with `CLAUDE.md` and `docs/` (design, decisions, implementation notes). Nothing in there
is approved yet. Current state: `docs/STATUS.md`. Routine choices made while building:
`docs/ASSUMPTIONS.md`.

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

`&paused=1` starts the scene's sim paused at t = 0 (tools/shot uses this to step to an exact time).
An unknown scene name logs a console error listing the registered scenes.

Production build: `pnpm build` (output in `packages/client/dist`), then `pnpm preview`
(http://localhost:4180/).

## Tests and checks

```sh
pnpm test              # Vitest: sim timing, determinism, drop physics, sim boundary
pnpm typecheck         # tsc in every package
pnpm lint              # ESLint
pnpm build             # typecheck + Vite production build of the client
pnpm check             # all of the above
```

Key tests (in `packages/sim/test/`):
- `determinism.test.ts`, `drop.test.ts`: the same seed and inputs give an identical state after
  10,000 steps.
- `drop.test.ts`: both balls land at sqrt(2·10/9.81) ≈ 1.428 s, within one step.
- `boundary.test.ts`: fails if `packages/sim` (or the `shared` code it uses) imports Phaser,
  client code, Node or network modules, or touches DOM globals, `Date`, `performance` or
  `Math.random`. It also type-checks the sim against the ES library only.

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
- **Exit code:** non-zero if any shot has a console error, page error or failed request, or never
  becomes ready. Warnings are logged but do not fail the run.
- **GPU:** by default it uses Chromium's new headless mode, which renders WebGL on the GPU when
  there is one. `--software-gl` uses the headless shell with SwiftShader (no GPU); that mode logs
  "GPU stall due to ReadPixels" warnings for WebGL canvases. Headless fps is informational only.

The contract between the game and the tool is `packages/shared/src/test-api.ts`.

## Layout

```
packages/
  shared/   constants (PIXELS_PER_METER) and the test-hook contract; pure TS
  sim/      fixed 60 Hz sim in SI units (m, kg, s), +Y up, seeded RNG; pure TS, no Phaser/DOM
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
