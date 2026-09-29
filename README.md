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
| `hub` (default) | http://localhost:5180/?scene=hub | The hub plaza in ¾ top-down view, with one tree to walk behind and in front of, and a rail with a 5 kg and a 20 kg cart (speed shown in m/s). Arrows or WASD move, Shift runs, Space jumps, tap or click walks to a spot. Walk into a cart's end to push it (Shift pushes harder); E hops in or out of the 5 kg cart, Space also gets out. Tap the bench, or press E near it, to walk over and sit next to Priya, a blue classmate, who says "Hi!" and waves (the bean dozes after 5 s); any movement, E or Space stands up. The bean, the tree, the carts and the bench are drawn art from `art/`; the plaza floor and the rail are placeholder shapes |
| `bean` | http://localhost:5180/?scene=bean | Rig gallery for review: the 8 directions, then walk, run, jump, fall, land, breathing, a blink, sitting and dozing at fixed clip times (labelled; no sim) |
| `looks` | http://localhost:5180/?scene=looks | Customization gallery for review: spots, the sprout, bear ears, the bow and glasses each on all 8 directions, then the 10 colours with mixed pieces (labelled; no sim) |

`&paused=1` starts the scene's sim paused at t = 0 (tools/shot uses this to step to an exact time).
`&look=<ids>` sets the bean's look (D25), any of: a colour (`orange` default, `blue`, `green`,
`pink`, `yellow`, `violet`, `teal`, `coral`, `cream`, `slate`), `spots`, a headwear piece
(`sprout`, `bear-ears`, `bow`) and `glasses`, comma-separated in any order, for example
http://localhost:5180/?look=blue,spots,bow,glasses. Unknown ids are logged as a warning. The
look is drawing only: the sim never sees it. There is no in-game wardrobe yet.
An unknown scene name logs a console error listing the registered scenes. The bean art is
checked against the art contract and rasterized before any scene starts; broken art is a boot
error.

The game follows `prefers-reduced-motion`: the bean loses its bob, squash, stretch, breathing
and waddle, but still changes pose (see `docs/ASSUMPTIONS.md`, M1 session 2). Hops (into and out
of a cart, onto and off the bench) move in a straight line without the arc, the feet on the
bench hang still, and the doze "z" stays put.

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
- `hub-cart-hops.test.ts`: the hop in (crouch 0.12 s, then 0.32 s + 0.111 s/m, arc
  0.30 m + 0.3/m, landing on the floor at the end tick) and out (0.38 s, arc 0.40 m), input
  ignored mid-hop, and restoring a mid-hop snapshot into a fresh scenario.
- `hub-bench.test.ts`: the bench: solid, E within 1.3 m or a tap walks over and sits (0.35 s hop,
  arc 0.26 m), taken seats skipped, standing up on a held key, E, Space or a tap (0.30 s hop),
  cancelling the walk over, a mid-hop snapshot, and 10,000-step determinism.
- `boundary.test.ts`: fails if `packages/sim` (or the `shared` code it uses) imports Phaser,
  client code, Node or network modules, or touches DOM globals, `Date`, `performance` or
  `Math.random`. It also type-checks the sim against the ES library only. Planck.js is the one
  allowed third-party import. And it fails if any sim source uses anything from
  `shared/src/look.ts` (cosmetics never touch the sim, D25).

Also, in `packages/client/test/`:
- `hub-view.test.ts`: hub projection, depth scale, drawn jump height and draw order.
- `views.test.ts`: the facing-to-view mapping (5 views mirrored to 8), every row and boundary of
  the table in `docs/DESIGN.md` §6, starting from the sim's facing.
- `bean-art.test.ts`: the art contract for `art/bean/*.svg` (required parts, flat groups,
  facing-left drawings for asymmetric parts, the scarf tail on the bean's left in all 8
  directions, eye highlights on the light side, `data-pivot` pivots equal to the rules they
  replaced, anchors, and rejecting broken markup).
- `prop-art.test.ts`: the art contract for `art/props/*.svg` (the tree, cart and bench parts,
  wheel pivots and radius, and anchors that agree with the sim: the cart floor and the seats).
- `looks.test.ts`: parsing `?look=`, the colour swaps (all six key colours, derived far
  shades, cream's outline, scarf and face never recoloured), the cosmetic art contract, patterns
  clipped to each view's body and headwear at each view's anchor, the bow on the bean's left in
  every direction (behind the head facing east, in front facing west), and every one of the 160
  looks on all 8 directions keeping every drawn part and adding each piece in its place.
- `classmates.test.ts`: Priya sits on the seat the sim keeps for her and greets for 2.4 s after
  the bean sits down next to her.
- `hub-presentation.test.ts`: the hub's table of how each interaction state draws (clip, parts,
  placement, shadow, cart stand-off, the flat hop for reduced motion).
- `player.test.ts`: clip data and timings, the rig player, reduced motion, and choosing the clip
  from sim state.

And in `tools/shot/test/`: script validation, `verify`'s helpers (the newest status folder,
`--scripts`, the summary table), the sheet layout and crops, and the art sheet's art paths and
zoom box.

## Verify everything: `pnpm verify`

One command for the whole pass, with one dev server and one browser:

```sh
pnpm verify                                  # everything; about a minute
pnpm verify --no-check --scripts hub-bench   # between steps: only these scripts, no pnpm check
```

It runs, in order:
1. `pnpm check`, in the background while the scripts run;
2. every script in `tools/shot/scripts/`, four at a time;
3. the hub scripts in the three `check-looks` looks;
4. every scene live, plus the timed shots found in the baseline (such as `drop_t1.000`). These
   wait for `pnpm check` to finish, so their fps samples run on a quiet machine;
5. `check-carts`, the looks comparison, and `compare-states` against the newest `docs/status/`
   folder (`--baseline <folder>` picks another).

It prints only the failures, then a summary table (step, result, seconds, one line of detail),
and exits non-zero on any failure. Everything else goes to `artifacts/verify/verify.log`, with
`pnpm check`'s output in `artifacts/verify/check.log`. Shots land in `artifacts/shots/` as usual.

With `--scripts a,b`, it skips the scenes and any check whose scripts did not run, and says so.
Other options: `--jobs <n>` (default 4), `--port <n>`, `--reuse`.

## Look at many frames: `pnpm shot:sheet`

```sh
pnpm shot:sheet artifacts/shots/hub-bench --title hub-bench
pnpm shot:sheet artifacts/shots/hub-bench/greeted.png artifacts/shots/look-cream-sprout/hub-bench/greeted.png --crop 180,150,240,180 --scale 1.5
```

Tiles PNGs (files, or every PNG at the top of a folder) into one labelled image in
`artifacts/sheets/`. Labels are the paths below the folder the files share, so the same shot in
several looks stays apart. Options:
- `--crop x,y,w,h` (image pixels);
- `--cols`;
- `--scale` (default 0.5, or 1 with a crop);
- `--title`, `--out`.

It needs no image library: it draws on a canvas in headless Chromium.

## Review an art change: `pnpm art:sheet`

```sh
pnpm art:sheet               # the working tree's art against HEAD
pnpm art:sheet --base main   # against another ref
```

Shoots the `bean` and `looks` galleries and the hub (paused at t = 0, for the props) at 2×
twice: once with the working tree's art, once with the art of `--base`. Both are drawn by the
current code. The second Vite server answers every `?raw` import under `art/` with
`git show <ref>:art/…`, so no second checkout is needed.

Output in `artifacts/art/`:
- `sheet.png`: every scene as before, after and changed pixels (magenta over a faded picture);
- `zoom.png`: the same, cropped to what changed;
- `before/`, `after/` and `diff/`: the single images.

The command also prints the changed art files and, per scene, how many pixels changed and
where. With no change, every scene is pixel-identical and the sheet says "no change". Every art
change is reviewed with this sheet (`docs/ART_PIPELINE.md`).

## tools/shot

Opens a scene in headless Chromium, optionally steps its sim to an exact time, and writes a PNG
plus a JSON log. `pnpm verify`, `shot:sheet` and `art:sheet` are built on it
(`tools/shot/src/session.ts`).

```sh
pnpm shot --all                                  # every registered scene, running live
pnpm shot --scene drop --t 1.0 --t 1.5           # drop scene at exactly t = 1.0 s and 1.5 s
pnpm shot --help                                 # all options
```

- **Server:** starts its own Vite server in-process on a free port, and stops it afterwards.
  It never depends on a long-running `pnpm dev`, which can go stale.
  - `--port <n>` starts it on exactly that port.
  - `--reuse` reuses the app's dev server on port 5180 (or `--port`) if it runs there.
  - `--url <url>` points it at any server, such as `pnpm preview`.
- **Parallel scripts:** `--jobs <n>` runs up to n scripts at once, each in its own page. The sim
  states are the same; only the order of the printed lines changes.
- **Scale:** `--scale <n>` sets the device pixels per CSS pixel (default 1).
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
| `hub-carts-ride.json` | Push the 5 kg cart to the cap, E: crouch, hop up, fall into the cart (masked below the rim), land (speed × 5/25 at touchdown), ride, E: hop out (speed × 25/5 at take-off) |
| `hub-carts-board-still.json` | Walk to the resting 5 kg cart and press E: mid-hop, then the rider faces the camera (it faces the way the cart travels while it moves) |
| `hub-bench.json` | Tap the bench: walk over to the free (west) seat, hop on, sit next to Priya, who says "Hi!" and waves for 2.4 s (feet swinging, two phases), then no greeting, a doze after 5 s, then → stands up and walks off |
| `hub-bench-depth.json` | On the bench's row (drawn in front), behind it (drawn behind), in front of it, then E to sit |
| `hub-bench-around.json` | From behind the bench, a tap on it: the bean walks out past its west end and round to the front, then sits |

After the three cart scripts, `pnpm shot:check-carts` recomputes from their logs the push
accelerations (F/m − 0.26 m/s²), the cap, momentum and restitution of the collision, the riding
speeds (from the logged touchdown and take-off, with rolling friction in between) and every
speed readout, and exits non-zero on any mismatch.

`pnpm shot:check-looks` runs every hub script in the default look and in three other looks
(together they use every piece and three colours, one of them light), in one server and browser,
and fails if any shot's sim state differs: cosmetics never touch the sim (D25). `pnpm shot --look <ids>` runs any scene or
script in a look and writes to `<out>/look-<ids>/`.

`pnpm shot:compare-states <old status folder> [<new shots folder>]` compares the sim state of
every stepped shot log in an earlier session's evidence (for example `docs/status/m1-s2`) with a
fresh run of the same scripts, after mapping the fields renamed or added since (listed in
`tools/shot/src/compare-states.ts`). Live shots are skipped: their tick depends on wall-clock
time. It exits non-zero on any difference.

Hub shot logs add a `view` block: the bean's screen position (feet, in viewport pixels),
depth scale and draw depth, the rig (`view`, `mirrored`, `clip`, clip time and the pose's body
transform, the interaction state and how it was drawn: `act`, `placement`, `masked`, `drawnZ`
and the feet's offsets), `reducedMotion`, each classmate's clip, greeting time and bubble text, and for each prop (the tree and the bench) whether
the bean is drawn `behind` it or `in front`. The `bean` gallery's log lists every cell's view,
clip, time and body transform. The hub state carries `bean.act` (the interaction state:
`free`, `pushing`, `boarding`, `riding`, `leaving`, `approaching`, `seating`, `sitting` or
`standing`, with its timing in ticks) and `rail` (each cart's mass, position and velocity, the
last 16 collisions with the velocities before and after, and the last 16 times the bean got in
or out); the `view` block adds each cart's readout text.

The contract between the game and the tool is `packages/shared/src/test-api.ts`.

## tools/share

Builds a static preview site for coworkers (teachers and developers) into `artifacts/share/`:

```sh
pnpm share            # build the site (needs pnpm shot:install once)
pnpm share:preview    # serve it at http://localhost:4190
pnpm share:dry-run    # rebuild, then check the Cloudflare deploy without uploading
pnpm share:deploy     # rebuild, then deploy (needs `npx wrangler login` once)
pnpm share:password   # set or change the site password (asks for it)
pnpm share:migrate    # apply tools/share/migrations to the comments database
pnpm share:comments   # list every comment (id, decision, name, date, text)
```

`pnpm share:password` must run in a real terminal (PowerShell or similar). Run through Claude
Code's `!` prompt it gets no input and saves an empty password (the site then stays closed).
The password can also be changed in the Cloudflare dashboard (Workers & Pages → beananza →
Settings → Variables and Secrets), but saving there only creates a new version: press Deploy
too, or run `pnpm --filter @beananza/share exec wrangler versions deploy <version id>@100%`.

- **Page** (`index.html`): the pitch, the playable game, and sections for teachers (DESIGN.md
  §1, 2, 8, 10, 11, 12), the roadmap (ROADMAP.md, with progress from STATUS.md), every decision
  (DECISIONS.md, filterable, `#D9` opens D9) and developers (IMPLEMENTATION.md §3 and the newest
  STATUS.md report). It is rendered from the docs on every run, so it never drifts from them.
  If a doc loses a heading the page uses, the build fails and names it.
- **Game** (`play/`): a production build with relative paths, loaded only when a visitor
  presses Play. `play/?scene=looks`, `play/?scene=bean` and `play/?scene=drop` work too.
- **Screenshots** (`shots/`): taken with tools/shot from that same build.
- **No third-party requests:** the fonts (Fredoka, Nunito, Caveat) are self-hosted from
  `@fontsource`. The build fails if the page would contain a private claude.ai link.
- The folder is plain static files; any file server can host it.
- **Cloudflare:** `tools/share/wrangler.jsonc` deploys the folder as the Worker `beananza`,
  served at `beananza.<account subdomain>.workers.dev`. Deploying always rebuilds first.
  `tools/share/site/_headers` sets `noindex`, `nosniff`, no referrer, and private long caching
  for the game's hashed files. Build from `main` so the page shows the latest status.
- **Password:** `tools/share/worker/index.ts` asks every visitor for one shared password (the
  browser's own login box; any username works) before serving any file, the game included.
  The password is the Worker secret `SITE_PASSWORD`, set with `pnpm share:password`, never in
  the repo. Until it is set the site answers 503 to everyone, so it is never open by mistake.
  Changing it locks out everyone who had the old one.
- **Comments on decisions:** each open decision has a comment list and a form (name and
  comment, plain text, up to 60 and 2000 characters); comments on decisions that have since
  closed stay visible, and each decision's line shows its count. They live in the Cloudflare D1
  database `beananza-comments` (schema in `tools/share/migrations/`), behind the same password,
  through `/api/comments` (`tools/share/worker/comments.ts`). Posts must be JSON from the site
  itself, so the remembered password cannot be used to post from another site. No emails or IP
  addresses are stored. To remove a comment:
  `pnpm --filter @beananza/share exec wrangler d1 execute beananza-comments --remote --command "DELETE FROM comments WHERE id = 7"`.
  Served without the Worker (e.g. `pnpm share:preview`), the page hides the comment sections.

## Layout

```
packages/
  shared/   constants (PIXELS_PER_METER) and the test-hook contract; pure TS
  sim/      fixed 60 Hz sim in SI units (m, kg, s), seeded RNG; pure TS, no Phaser/DOM.
            Side views: +Y up. Hub: ground plane x east, y north, plus height z (Planck.js
            for hub collisions); src/interactions/: one module per interaction (carts, bench)
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
