# CLAUDE.md

## Project
A browser game that teaches high school physics through play. Physics is the rulebook of the
world, not a quiz layered on top. Students meet in a shared hub, form small groups, and head
out on expeditions where they predict, test and compare. Used both in class (with a teacher)
and at home.

## Status: read this first
- This is **early exploration. Nothing is approved.** Treat every design and technical choice in
  `docs/` as a proposal to validate with a prototype, not a requirement.
- Before locking in anything marked **Open** in `docs/DECISIONS.md`, lay out the options with a
  recommendation and ask the user. Don't decide silently.
- When the user confirms a decision, update its status in `docs/DECISIONS.md`.
- Prefer small, runnable vertical slices over broad scaffolding.

## Where things are
- `docs/DESIGN.md`: design spec (vision, world, characters, interactions, tuning values from prototypes)
- `docs/ROADMAP.md`: milestones and acceptance checks
- `docs/DECISIONS.md`: decision log with open questions (imported below)
- `docs/IMPLEMENTATION.md`: lessons from the prototypes, architecture rules, rotation approach, engine options, behavior inventory and verified tuning numbers
- `docs/ART_PIPELINE.md`: the art pipeline (Claude draws SVG text, contract checks, review sheets)
- `docs/TOPICS.md`: design topics backlog
- `docs/STATUS.md`: the current state (what works, open issues, next)
- `docs/archive/`: frozen history (old session reports, the assumptions log, the old prompts'
  handover). Not maintained; read only when a detail is needed.
- `reference/`: the showcase page and the bean rotation comparison (open in a browser). Behavior reference only; never port their code.
- `art/`: the bean, cosmetic and prop SVGs the game loads by part id, with anchors and pivots in the files (see `art/README.md`), plus reference art (body forms, the Heavy Baron) and the palette.

## Proposed stack (not yet confirmed, see DECISIONS.md)
- TypeScript everywhere, pnpm workspaces monorepo
- Client: Phaser (latest stable) with Vite
- Physics: Planck.js, wrapped in a pure `sim` package
- Multiplayer (Milestone 2): Colyseus on Node
- Persistence (later): Postgres
- Tests: Vitest

## Architecture rules
- `packages/sim` is pure: no rendering, DOM, or network code. Fixed timestep (60 Hz), deterministic.
  Input goes in as commands; the client renders from sim state.
- The same sim code should later run on the server as the authority for group expeditions.
- Work in SI units inside the sim (m, kg, s). Convert to pixels in the client with a single
  `PIXELS_PER_METER` constant.
- Cosmetics never affect physics. Every bean body form uses the same collider and properties.
- Beans are a parts-based rig (feet, body, belly, pattern, scarf, eyes, mouth, arms, headwear,
  accessories) animated in code. Do not build per-combination sprite sheets.

## Proposed layout
```
packages/
  shared/   types, constants, content data (concepts, cosmetics, expeditions)
  sim/      physics and game rules (Planck.js), unit tested
  client/   Phaser scenes, rendering, input, UI
  server/   Colyseus rooms (Milestone 2)
docs/
art/
```

## Conventions
- Write Vitest tests for sim behavior: movement, jump arcs, cart collisions, prediction scoring.
- Accessibility: respect `prefers-reduced-motion`; never rely on color alone; tap-first controls
  that also work with keyboard (school Chromebooks and phones are the baseline).
- Privacy and safety (students are minors): no free-text chat, no custom text or drawings on
  avatars, preset pings only, minimal personal data (nicknames plus class codes).

## Prototype references (behavior only, never port the code)
- Showcase draft (playable arena, animations, kit, hub, map, boss): https://claude.ai/artifact/4v4B5RFYFt3nw6PwP4mWhS (also `reference/showcase.html`)
- Rotation comparison: https://claude.ai/artifact/6pakwQQE6hkR8MzaMhBzT2 (also `reference/bean-turn.html`)
- Design canvas: https://claude.ai/artifact/9YDRLAEtTBbmrrfWxTDWyX
- Prototype numbers are in screen pixels and tuned for feel. Re-derive them in SI units in the real sim (see `docs/IMPLEMENTATION.md` section 6).

## Also proposed (see docs/IMPLEMENTATION.md)
- Exact integrators for teaching scenarios; Planck.js only for general collisions
- Automatic y-sorting for depth; animation clips as data; no CSS-style state-toggled animation
- Draw each asset once; generate everything else from it (`docs/ART_PIPELINE.md`)
- Verify with screenshots and scripted playthroughs, and never claim a result you haven't looked at

## Commands
Details in `README.md`.
- `pnpm install`, then once `pnpm shot:install` (Playwright Chromium)
- `pnpm dev`: game at http://localhost:5180/?scene=<name> (`hub` is the default; also `bean`, `looks`, `reactions`, `clip`, `anim`, `drop`, `empty`; `&paused=1` starts paused; `&look=blue,spots,bow,glasses` sets the bean's look; `&layout=bench` opens a test yard instead of the plaza)
- `pnpm check`: typecheck, lint, tests and build (`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`)
- `pnpm verify`: the whole pass in about a minute: check, every scene and script, the looks, and
  the sim states against `tools/shot/golden/` (`pnpm verify --update-golden` rewrites them; the
  diff is reviewed in the PR). Between steps use `pnpm verify --no-check --scripts <names>`.
  CI runs it on every pull request and on pushes to main (`.github/workflows/verify.yml`).
- `pnpm shot --all` or `pnpm shot --scene drop --t 1.0`: PNG plus JSON log in `artifacts/shots/`.
  It starts its own server on a free port (`--reuse` for the one on 5180), and `--jobs 4` runs
  scripts in parallel.
  Checks on the logs: `pnpm shot:check-carts`, `pnpm shot:check-looks`, `pnpm shot:compare-states <old evidence folder>`.
  Look at the screenshot and the log before claiming a scene works or looks right.
- `pnpm shot:sheet <pngs or folders> [--crop x,y,w,h]`: many frames in one labelled image.
- `pnpm art:check`, `pnpm art:part <file>`, `pnpm clip:sheet <clip>`: the art contract, one
  piece in all views, one clip across its cycle, in seconds and without the game.
- `pnpm art:sheet`: before, after and difference of the art against HEAD, for review.

## How we work
The user's attention is the limit, so sessions are short, steered and one at a time.
- **Start:** read "Current state" in `docs/STATUS.md` and `gh pr list` (with CI status; a red
  run on an open PR comes first), say where things are in 3 lines, and agree with the user on **one slice** for the session.
- **Branch:** one per session, `<area>/<topic>`, in the main checkout. Use a git worktree only
  when the user deliberately runs a second session at the same time.
- **Open decisions:** when one comes up, ask in the session (options plus one recommendation),
  then record what the user confirms in `docs/DECISIONS.md`. No separate design chats.
- **Size:** the hand-written diff (not golden files or generated output) should be reviewable in
  about 15 minutes, roughly under 600 lines. If a slice grows, stop at a working point and open
  the PR; the rest is the next session.
- **While working:** `pnpm verify --no-check --scripts <the scripts the change touches>`. Look at
  every screenshot or sheet before claiming a result. Updates are 1 to 2 lines, only at step
  boundaries or when something breaks or needs the user.
- **Technical recipes are skills** (`.claude/skills/`): `hub-interaction`, `draw-piece`,
  `add-clip`. Show every art change as a `pnpm art:sheet` image.
- **End:** full `pnpm verify` green (explain every golden change), update "Current state" in
  `docs/STATUS.md` in place, commit, confirm `git status` is clean (so CI tests what was
  tested locally), push, and open the PR from the template. Don't wait for CI
  (`.github/workflows/verify.yml`): the user checks it before merging, and a red run is fixed
  at the start of the next session. Show the key screenshot or sheet, then hand over in **at
  most 10 lines**: PR link, what to look at, what failed, decisions needed. Routine choices go
  in the PR description.
- **Reviewer agent:** only for sim, physics or determinism changes, or when the user asks. One
  round; what is left goes in the PR's open issues.
- **The user merges.** Never merge into main, force-push, or run `pnpm share:deploy` /
  `pnpm share:password` without asking (a guard hook in `.claude/settings.json` blocks them).

@docs/DECISIONS.md
