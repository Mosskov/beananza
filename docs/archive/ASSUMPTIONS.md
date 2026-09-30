# Assumptions

> Archive, frozen 2026-09-30: no new entries. Routine choices now go in the PR description.

Routine choices made while building, logged so they can be reviewed and reversed. None of them
changes a decision in `docs/DECISIONS.md`. Newest milestone first.

## Reactions, first session (branch `feat/reactions`), 2026-09-30

No decision changes; D26 is built as confirmed. From `prompts/reactions-first-session.md`. The
sim, the clips and the effect slots were built by parallel forks in separate worktrees and merged.

### Baseline
- The first `pnpm verify` crashed on the known browser-close flake (`browser.newContext`); the
  rerun passed (340 tests, 0 golden differences).

### Sim (slice 1)
- `since` is `state.tick` when the reaction starts. The hub clears it in the step where
  `tick + 1 >= reactionEnd`, at one fixed point after the interaction modules (as the hop timers).
- `emote` is handled in `hub.ts` before the interaction modules; the table's `emote` flag
  decides, and only `waveHi` is accepted.
- Table rows: `free` allows `body` for eureka, oops and dizzy and `arms` for waveHi;
  `approaching`, `sitting` and `riding` allow the wave's arm; `pushing` and the four hop acts
  allow face and effect only. `dizzy` has a `body` group in `free` so a sway can come later; no
  clip uses it yet.
- `STILL_SPEED_M_S` is 0.01 m/s ("standing still"; the prompt gave no number).
- The two TypeScript-compile boundary tests got a 30 s timeout: they passed alone in under a
  second but exceeded the 5 s default when two `verify` runs shared the machine.
- Golden files: `bean.reaction: null` added to 59 files by hand from HEAD, so `--update-golden`
  did not reorder keys. `writeGolden` already keeps unchanged files byte for byte.

### Clips and player (slice 2)
- Reaction clips are in `CLIP_NAMES` and `CLIPS` so `clip:sheet` works unchanged; their tracks
  carry `group`, act clips never do. Clip names equal the sim's `ReactionKind`.
- Reduced motion holds the squash at 1.06 × 0.94 (the prototype's Eureka crouch) for eureka and
  oops; invented for oops. One `still` value each, easy to change.
- Oops keeps the prototype's 0.5 s shakes; the squish overlaps the last one so the clip is
  exactly `OOPS_S`.
- The wave uses `armB` in the front, back and ¾ views and `armA` in the side view (`armB` is the
  hidden pushing arm there). Rest angles are invented: `WAVE_UP` −110° (from Priya's wave),
  `WAVE_UP_SIDE` −165° (tuned on the sheet).
- The wave arm ramps up from 0 over the first 8 %, because a reaction track replaces a channel
  and cannot see the act's arm angle; walking shows a small pop at the start.
- A tap on your own bean (`hitsBeanBody` in `rig/hit.ts`, unit tested; `HubScene.hitsOwnBean`)
  is checked before props and ground taps. The hit area is the bean's bullet shape: a rectangle
  for the lower half and a half ellipse for the dome, from the body part's bounds in the current
  view (`bodySpan()` and `bodyTop()`), so it is the same for every look: with `drawnTop()`, which
  headwear raises, the `hub-depth-tie` tap waved instead of walking in the sprout look, and
  `looks-compare` caught it. The first version treated the
  span's west reach as a signed offset and never hit; found in review, fixed, and covered by
  `hub-wave-tap`.
- Consequences of that tap rule, which D24 did not cover: tapping your own seated bean waves
  (it used to stand you up; tapping the bench outside the bean, any movement key, E or Space
  still stand you up), and tapping your own bean while it stands in front of the bench waves
  instead of walking to a seat (tap the bench or press E). The bean is drawn in front, so a tap
  on it is a tap on the bean.
- `eureka` moves `footA` and `footB` with the body (same `y` keys), so the whole bean jumps as
  in the prototype; reduced motion drops it (`motion`).
- `samplePose` takes `mirrored`. In the mirrored `front-34` view the wave moves to the near arm
  with its rotation flipped, so the screen-right arm waves in SE and SW. In `back-34` the same
  move swings the arm across the back (seen on the sheet), so that view is left as it was. `front`
  and `back` are never mirrored; the side view's near arm needs no swap.
- `gallery`: the `reactions` scene draws the bean on open ground with the act's own clip and
  parts (no props, carts or bench), samples each reaction at 15 %, 40 % and 70 %, uses animation
  time 10 s with acts started 1 s earlier, and faces the walking and pushing rows east.

### Effect slots (slice 3)
- Effects use palette colours only (not recoloured per bean); the contract flags key colours.
- `fxHead` and `fxBrow` ride with the body; `fxGround` stays on the ground. Effect images draw in
  front of the bean's parts.
- Anchor positions are a first guess from the prototype's "z" and sweat drop; the art lane tunes
  them. Effects mirror their position in mirrored views and are not flipped.
- Only the "z" is registered (`art/effects/doze-z.svg`, on `fxHead`). Sweat and dust have slots
  and anchors but no drawings.
- Only `front.svg` had the "z" (the prompt said five views); the one that existed was removed.
  Effects do not depend on the view, so the `doze` clip sheet now shows the "z" in all eight
  directions. In the hub a seated bean always faces the camera, so nothing changes there.

### Known limitations (for the art lane)
- In the side views (E, W, and while walking, pushing or riding) the wave lifts the arm from
  mid-torso to about eye level but keeps it in front of the body, so it reads weakly. A clear
  side-view wave needs a side arm drawn to reach outside the silhouette.
- The back-¾ views show the wave faintly for the same reason (short arm, partly behind the body),
  and the mirrored back-¾ view (NW) is not corrected (see above).

### Tooling gaps found
- `hub-interaction` says to run `pnpm verify --update-golden --scripts <new script>`, but that
  run includes `pnpm check`, whose golden completeness test fails until the files exist, and
  `--update-golden` refuses to write after a failed step. Adding `hub-wave` and `hub-wave-tap`
  needed `writeGolden` called directly for those scripts (12 and 5 files added, no other file
  touched).
- The `add-clip` skill listed the removed `fx` slot and knew nothing of reaction clips or
  `Track.group`; updated.
- `pnpm art:sheet --base` cannot compare the anchors change: its "before" runs the current code
  on old art, which fails the new anchor requirement. The slice 3 fork used a scratch worktree
  of main for the before images.
- Two `verify` runs at once make the sim's TypeScript-compile tests slow (see the timeout above).

## Tools prep session (branch `tools/prep`), 2026-09-30

No decision changes. From `prompts/tools-prep-session.md`.

### Baseline
- **main failed `pnpm check`** at `9e3d3ef`: the D26 row in DECISIONS.md has an escaped pipe
  (`\|`) inside a cell, which `tools/share`'s table parser split into a sixth cell. The parser
  now splits only on unescaped pipes (GFM) and unescapes them, with a test. Everything else in
  the baseline `pnpm verify` passed (58 states, 0 differences against `docs/status/m1-s3`).
- **pnpm on this machine** comes from corepack (`corepack enable --install-directory` into a
  user folder), because no global pnpm was installed; nothing in the repo depends on it.

### Golden sim states (`tools/shot/golden/`)
- **`docs/status/` is no longer the baseline.** It keeps each session's images and write-ups as
  history. `pnpm verify` compares against `tools/shot/golden/`; `--baseline <folder>` still
  compares against an evidence folder.
- **One file per shot**, `<script>/<shot>.json` and `<scene>_t<time>.json`, with exactly the
  fields `script`, `shot`, `scene`, `layout`, `look` (always null) and `state` (timed shots:
  `scene`, `t`, `layout`, `look`, `state`). Many small files make a PR diff name the shot that
  changed. The state is stored as the game logs it, so the comparison stays exact (no rounding).
- **Seeded from `docs/status/m1-s3`** with the documented renames applied (drawing-only fields
  copied from main's run). `hub-yard-bench` and `hub-yard-carts` are newer than m1-s3, so their
  6 states come from main's run at `9e3d3ef`. 64 files; 0 differences against main's scripts.
- **The golden check also fails on a new shot without a file**, and on files no script takes
  (a test and `verify`'s `golden` row). Evidence folders from older sessions have fewer
  scripts, so `--baseline` does not check for extras.
- **`--update-golden` writes only after a passing run**, and a file whose state is equal (in
  any key order) keeps its bytes, so the diff shows only real changes. With `--scripts` it
  touches only those scripts' files and leaves the timed shots alone. `--timed scene@t` adds a
  timed shot (the only way to add one).
- **Proof on a real change:** `HUB_WALK_SPEED` 2.4 → 2.5 (reverted) made
  `verify --scripts hub-walk` fail on 3 of 4 shots, each line naming the file and fields
  (`tools/shot/golden/hub-walk/walked-1s.json .bean.x …; .bean.vx: 2.4 ≠ 2.5`). Moving one
  golden file away failed both the completeness row and the comparison.

### CI (`.github/workflows/verify.yml`)
- **ubuntu-latest, Node 24, pnpm through corepack** (the version in `package.json`). The pnpm
  store is cached by the lockfile's hash, the Playwright browser by the Playwright version; the
  browser's system libraries are installed every run (`playwright install-deps`, not cacheable).
- **`pnpm check`, then `pnpm verify --no-check`**, so check runs once and its failure shows as
  its own step.
- **A contact sheet per script** (`pnpm shot:sheet`) goes into `artifacts/sheets/`, uploaded
  with `artifacts/verify/` and `artifacts/shots/` as `verify-artifacts` (kept 14 days), even
  when a step fails.
- **No retry.** The known flake (the browser closing mid-run) is recorded if it shows up.

### The art toolkit (`art:check`, `art:part`) and the clip sheet
- **The contract code became importable from Node** without moving it: the `?raw` imports
  moved to `rig/looks-sources.ts` and `art/prop-sources.ts`, the prop contract to
  `art/prop-contract.ts`, and `@beananza/client` exports `./art/*` and `./rig/*` for tools/shot.
  The builders throw `ArtContractError` with the problem list, which `art:check` prints.
- **One checks module** (`client/src/art/checks.ts`) for the CLI and the tests. The new drawing
  rules and their numbers: near parts at pivot x < 0 in front ¾ and > 0 in back ¾ (far parts
  opposite); the near arm after the body and the far arm before it in the ¾ and side views;
  `belly`, `eyes`, `eyes-sleep`, `mouth`, `cheeks` and every anchor inside the body outline
  within 1.5 units (curves sampled at 12 points, ellipses at 24); the side belly's frontmost
  point within 2 units of the body's front edge. Current art: 0 findings. The session 3 slips,
  re-introduced: the side belly gives 1 finding (6.5 units short at y −24), back ¾ gives 4.
- **Why the side belly rule is about the front edge,** not "inside the outline": the old belly
  was inside the body; its fault was being inset from the front (it read as a spot on the hip).
- **`art:part` draws in headless Chromium,** the engine the game rasterizes with, and each part
  as its own SVG image placed in its view's frame, as the game rasterizes each part on its own.
  No new dependency. Timing on this machine, `pnpm art:part` for a headwear piece in all 8
  views: 2.7 s wall, of which 0.7 s is the tool's own work; the rest is starting Node, tsx and
  pnpm. Getting there: the root scripts run `node --import tsx` (one process, not pnpm → pnpm →
  tsx → node: 5.0 s before), and the command exits without waiting for Chromium to close
  (1.3 s on Windows). The headless shell was slower to use here (2.8 s in the tool).
- **The clip sheet is a game scene** (`?scene=clip`), shot by tools/shot, so the real `BeanRig`
  and `samplePose` draw it; a second renderer of poses in Node would be a second version of
  the rig. Columns: a looping cycle split evenly, a one-shot clip start to end; the blink
  overlay is off (time 0). Part overrides per clip (push: the pushing arm; doze: closed eyes and
  "z") are a small table in the scene that mirrors the hub's presentation rows. Shot at 2×
  device pixels so 8 × 8 cells stay readable. `verify` shoots it live with its defaults (idle).

### Skills, the reviewer, the PR template, hooks
- **Six skills, not five:** the five the prompt names plus `session-start` (worktree, install,
  baseline), because the fourth-session prompt's setup and baseline sections had to become a
  skill name too. Written by hand in the skill-creator's format (frontmatter with a
  trigger-rich description, checklists that say why); its eval loop was skipped, as the
  reviewer walks each skill on a toy case instead.
- **"Adding a scene" stays in README** as the one copy: no skill covers a new scene on its own,
  and the CLAUDE.md line that repeated it is gone. `hub-interaction` points at it.
- **The reviewer agent** has Read, Grep, Glob, Bash and PowerShell; no Edit or Write. Its
  instructions forbid writing into the repo through the shell; the tool list cannot enforce
  that.
- **The guard is a Node script** (`.claude/hooks/guard.mjs`), so it runs the same on Windows,
  in CI and in cloud containers, and returns a PreToolUse `deny` with a reason that says to ask
  the user. It splits a command on `;`, `&&`, `||`, `|` and newlines and checks each part:
  `pnpm … share:deploy|share:password|cf-deploy|cf-password`; `git … push` with `--force`,
  `--force-with-lease`, `--force-if-includes`, a short flag cluster containing `f`, or a `+`
  refspec; `git merge|rebase` when the current branch (in the payload's `cwd`) is main, or
  after a `git checkout|switch main` earlier in the same command. Known limits: it reads the
  branch of `cwd`, not of a `cd` or `-C` path inside the command, and a commit message that
  quotes a blocked command is blocked too (the user can then run it).
- **The allowlist** names each command (`pnpm art:part`, `pnpm art:part *`, …) for both Bash
  and PowerShell, rather than the legacy `:*` prefix form, which reads ambiguously next to
  script names with colons.
- **No render-on-save hook,** as the prompt says: the skills call `art:part` when it matters.

### Cloud sessions and lanes
- **SessionStart hook** (`.claude/hooks/session-start.sh`): only when `CLAUDE_CODE_REMOTE` is
  `true`; `pnpm install --frozen-lockfile` (enabling corepack if pnpm is missing); Playwright's
  Chromium only if `chromium.executablePath()` does not exist (so a `PLAYWRIGHT_BROWSERS_PATH`
  that already has it is used), then `playwright install-deps chromium` where the container
  allows it. It calls Playwright through `pnpm exec`, not `pnpm shot:install`, to avoid a nested
  pnpm. Tested here on Windows with `CLAUDE_CODE_REMOTE=true`: with the browser present it
  skips it (5 s); with an empty `PLAYWRIGHT_BROWSERS_PATH` it installed Chromium and the
  headless shell (2 min 25 s) and the next run skipped it. **Not tested in a real cloud
  container.**
- **Review round 1 fixes:** the guard also blocks `gh pr merge`, pushes to main by refspec,
  `--delete` or a bare `git push` on main, `git fetch …:main`, `git branch -f|-D main`, `pull`,
  `cherry-pick` and `am` on main, and direct `wrangler` deploys, secrets and remote D1
  migrations (`--dry-run` passes); it follows `cd` and `git -C` to judge the right tree.
  `art:check` reports a drawing that is not registered and a registered id with no drawing
  (`registrationFindings`), and a test checks the loaded sources equal the files on disk.
  `--update-golden` refuses `--no-check`. The skills gained the missing steps (looks gallery
  row, D25 confirmation, effects not built yet, a new layout field, the clip log's path).
  Not changed: the geometry sampler's limits (no `transform`, compact arc flags), the one-point
  side-belly test, and CI running for both push and pull_request (two runs per PR push).
- **Review round 2 fixes:** the guard now reads each simple command with its quoted text
  blanked out (a commit message or `echo` that mentions `git push origin main` is not blocked),
  splits chains outside quotes, looks inside subshells and `bash -c` / `powershell -Command`,
  and blocks `HEAD` / `@` pushed from main, `push --mirror` and `--all`, `checkout -B main`,
  `switch -C main`, `update-ref refs/heads/main`, `branch -d main`, `rebase <x> main`,
  `reset` and `revert` on main, and share-site scripts run by npm, yarn, npx or bun as well as
  pnpm. `checkout -b x main` no longer counts as switching to main. `art:check` names any SVG
  under `art/` that the game cannot load (a new folder, an id with `_`) unless it is listed in
  `REFERENCE_ART`. The reactions prompt's Step 0 names `session-start`, and the fourth
  session's branch follows the lane pattern (`behaviour/m1-s4`).
- **The lane file map** in CLAUDE.md assigns the drawing loaders, galleries and clip data to the
  art lane and the sim, hub scene, scripts and golden files to the behaviour lane; the five
  shared files get one-line additions only.

## A sharp picture at full screen, 2026-09-29

Fixes the "Blurry game at full screen" topic in `docs/TOPICS.md`. No decision changes and no sim
change: the sim states from `pnpm verify` still match `docs/status/m1-s3` (58 of 58), and the
looks check still shows 177 of 177 identical.
- **The canvas has the screen's real pixels.** `client/src/screen-scale.ts`: k = fit scale ×
  `devicePixelRatio`, from the `#game` box, recomputed on every resize (`installRenderScale`).
  `Phaser.Scale.FIT` stays, so the picture is shown at the same size and letterboxed as before;
  only the canvas behind it grows. At 1280×720 and a ratio of 1, k is 1 and nothing changes.
- **Scenes keep the 1280×720 layout.** Every camera is framed with `frameCamera` (size, zoom × k,
  centred on the same point), so scene coordinates, taps and the `view` blocks in the shot logs
  (`onScreen` in `HubScene.debugState`) are the same at every k. The hub's controls hint used
  `setScrollFactor(0)`, which zooms about the camera's centre, so it now sits in the world at the
  window's bottom right corner; the hub camera never moves.
- **Text renders at resolution k** (`sharpText`), and follows k when the window changes.
- **k is capped at 2.5** (`MAX_RENDER_SCALE`, for weak Chromebooks: a 2560×1440 screen at a ratio
  of 1 needs 2, a 4K one 3) and floored at 0.5 (small phones need fewer pixels than the layout).
- **`ART_RESOLUTION` 2 → 3**, so the bean (drawn up to 0.92 of full size in the hub) stays sharp at
  the cap. At k = 1 the screenshots differ a little from the M1 session 3 evidence (sharper edges);
  the logs do not. Texture memory for the parts is about 2.25 times what it was.
- **Measured** (software GL, headless Chromium): the canvas is exactly the CSS size × ratio for
  1280×720 at ratios 1 and 2, 1920×1080, 900×700 and a 390×700 phone at ratio 3, and follows live
  window resizes. A tap at layout x = 800 at 1920×1080 sends the bean to sim x = 1.6 m.
  Not measured: fps on real GPUs, Chromebooks and phones (the sandbox's software GL gives 3 to 30
  fps run to run, before and after alike).

## Hub refactor for parallel work (branch `refactor/hub-parallel`), 2026-09-29

No behaviour change: 58 sim states identical to `docs/status/m1-s3`, and the view blocks and all
56 script screenshots byte-identical to a baseline shot before the change. No decision changes.
- **Each interaction owns its acts.** `CartAct` and `BenchAct` moved into their modules with a
  rules table per act kind (`walks`, `usesPlanck`), replacing the hand lists `actWalks` and
  `actUsesPlanck`. The module list and the merged `ACT_RULES` live in `interactions/index.ts`;
  modules read the rules from `HubStep.rules`, so nothing imports in a circle.
- **Presentation rows per interaction** in `client/src/scenes/presentation/`; `hub-presentation.ts`
  merges them into one table that must cover every act kind.
- **Props name their drawing.** `PropFootprint.art` (the `art/props/` id) and `usable` (taps send
  `use`). The hub draws every prop and bench the same way, from all its parts in `PROP_PARTS`
  order; it used to draw every prop as a tree. `compare-states` maps older logs (a rename entry).
- **Client constants:** `UI_FONT` (was copied in five scenes) and `PALETTE.hedge` in `config.ts`;
  the ground, hedge, shadow and text styles in `HubScene.ts` are named.
- **Test yards:** `?layout=<name>` opens the hub on a named layout (`HUB_LAYOUTS`): `plaza`, or
  a yard with the plaza's ground, start and camera and one thing on it (`bench`, `carts`), so the
  depth scale and screen positions match the plaza. Scripts take `"layout"`; `pnpm shot --layout`
  writes to `layout-<name>/`. An unknown layout is a boot error, so a typo cannot show the plaza.
  `hub-yard-bench` and `hub-yard-carts` give the same bean and cart states as the plaza scripts.
- **Not done:** per-session STATUS files. The share site shows the first `## ` section of
  `STATUS.md` as the newest report, and the conflict it would avoid (two sessions adding a
  section at the top) is small.

## Workflow tools (`pnpm verify`, `shot:sheet`, `art:sheet`), 2026-09-29

Built on the branch `tools/workflow`, from the workflow chat (`docs/TOPICS.md`, "A smoother
session workflow"). D13 is partly confirmed there.
- **tools/shot starts its own server by default**, on a free port. Reusing a running
  `pnpm dev` is opt-in (`--reuse`): in M1 session 3 a stale one answered 500.
- **`verify` runs 4 scripts at a time.** Each script steps a paused sim explicitly, so the
  states are the same. This was checked: `--jobs 1` and `--jobs 4` gave 56 sim states with
  0 differences, and all 12 scripts took 9 s instead of 14 s. The CLI's default stays 1.
- **`verify` runs `pnpm check` alongside the scripts**, which don't sample fps. The live scenes
  wait until it finishes, so their fps samples run on a quiet machine.
- **`verify` finds the timed shots in the baseline folder** (`drop_t1.000` and `drop_t1.500`),
  rather than keeping a list of its own, so the baseline decides what gets compared.
- **Open issue: one browser crash in 6 full runs.** Once, the headless browser closed mid-run
  ("Target page, context or browser has been closed"). The cause is unknown; possibly load from
  the concurrent `pnpm check`. The next 5 runs passed.
  - `verify` now reports a crash as a FAIL row for the step it hit, skips the log checks, and
    still prints the summary.
  - If it recurs, run `pnpm check` and `pnpm verify --no-check` one after the other, and look
    into it.
- **`verify` prints only failures and a summary table.** The full log goes to
  `artifacts/verify/`, to keep a session's context small.
- **Sheets are drawn on a canvas in headless Chromium**, so no image library (such as sharp)
  was added.
- **The art sheet** shows the `bean` and `looks` galleries (fixed poses, no sim) and the hub
  paused at t = 0, at 2× scale.
  - "Before" uses the ref's art with the current code, served by a Vite plugin from `git show`.
    An art file that is new since the ref uses the current file, and a note says so.
  - A pixel counts as changed when a channel differs by more than 2 of 255. Two runs without
    an art change were pixel-identical in all three scenes.
  - The zoom crop is the changed box plus 40 units of margin, at least 200 × 200 CSS pixels.

## Share site (`tools/share`), 2026-09-29

Sharing the project with coworkers: a site built locally from the docs and deployed on
2026-09-29 to https://beananza.niclasmosskov.workers.dev, behind one shared password. Comments on
open decisions are a later step. D11 has a note only and stays Open.
- **Built from the docs on every run**, not written by hand, so it matches the repo. Only the
  pitch, section intros and labels are written in `tools/share/src/page.ts`.
- **Teacher sections** are DESIGN.md §1 (vision), §2 (core loop), §8 (expeditions and learning),
  §10 (multiplayer and classroom), §11 (progress tracking) and §12 (accessibility). The heading
  tags (Explored, Proposed) show as chips and are explained once.
- **Milestone progress** is derived from STATUS.md: done when it has a "## Milestone N" report,
  in progress when it has "## MN, session" reports only, else planned.
- **The game loads on request** (a Play button over the hub screenshot), so the page itself
  stays light (the whole folder is about 2 MB).
- **Screenshots come from the built game** served by `vite preview`, not the dev server, so a
  dev server of another checkout on port 5180 can never leak into them.
- **Fonts are self-hosted** (`@fontsource` 5.3.0), so visitors make no requests to Google.
- **`noindex`** on the page: it is for people with the link, not search engines.
- **Cloudflare:** the Worker is named `beananza` (the user's choice); `pnpm share:deploy`
  rebuilds and then deploys (`tools/share/wrangler.jsonc`). First deployed after the M1 session 3
  work was merged, as the user asked. The site's Play buttons include the `looks` scene, and the
  third teacher screenshot is the looks gallery.
- **Setting the password:** the first `pnpm share:password` ran through Claude Code's `!` prompt,
  got no input and saved an empty secret; the Worker's fail-closed check kept the site shut
  (503). The user then set it in the dashboard, which saves a version without deploying it;
  it went live with `wrangler versions deploy`. Checked live: every path, the game's files
  included, answers 401 with the login prompt without a password or with a wrong one; the user
  confirmed the right password opens the site and the game.
- **wrangler 4.143.0**, not 4.143.1: 4.143.1 was published less than a day before this
  session. Its `workerd` dependency (Cloudflare's local runtime, only for `wrangler dev`) has
  its install script denied in `pnpm-workspace.yaml`.
- **One shared password** (the user chose it over Cloudflare Access): HTTP Basic Auth in a small
  Worker (`tools/share/worker/index.ts`) that runs before every file (`run_worker_first`). Only
  the password is checked, any username works. It is compared through SHA-256 digests without
  an early exit. No `SITE_PASSWORD` secret means 503 for everyone (fail closed). The Worker's
  own responses are `no-store` and `noindex`. Tested with Vitest in Node; `wrangler dev` is not
  used (its `workerd` runtime is not installed).
- **Comments (step 3):** Cloudflare D1 (`beananza-comments`, created in region EEUR), read and
  written only by the Worker after the password check. Open decisions take new comments;
  closed ones keep theirs visible. A name is required (free text, up to 60 characters; the
  audience is adult coworkers) and remembered in the browser's localStorage; comments are plain
  text up to 2000 characters, shown with textContent. No Turnstile: only people with the
  password can reach the form. Cross-site posting is blocked by requiring JSON and a matching
  Origin. No editing or deleting by visitors (no accounts); comments are listed and removed with
  wrangler (README). `pnpm share:deploy` applies pending migrations before deploying.
- **Response headers** (`tools/share/site/_headers`): `X-Robots-Tag: noindex`, `nosniff`,
  `Referrer-Policy: no-referrer`, and a year of private, immutable caching for `play/assets/*`
  (content-hashed names; private because the site is behind a password).
- **Look:** the game's palette on graph paper (the field-notebook style in DESIGN.md §5),
  Fredoka for headings, Nunito for text, Caveat for handwritten captions. Status badges pair a
  shape with a word, never colour alone. The only animation is the dashed arc in the hero,
  skipped under reduced motion.

## M1 session 3 (interaction states, the bench, customization basics), 2026-09-29

### Decisions confirmed at the start of the session
D21 (interaction states), D22 (anchors and pivots in the SVGs; D13 stays Open), D23 (the cart
hop and the rider clipped below the rim), D24 (the bench and sitting; D2 stays Open), D25
(customization basics), D7 (Bean only this session; stays Open) and D18 (footprint stays
0.25 m). See `docs/DECISIONS.md`.

### Interaction states (`packages/sim/src/interactions/`)
- **`bean.act` replaced `bean.riding` and `bean.pushing`.** `{ kind: 'free' }`,
  `{ kind: 'pushing', cart, dir, run }` (the old `pushing` object plus `kind`) and
  `{ kind: 'riding', cart }`. The hub's data moved to `scenarios/hub-world.ts`; `hub.ts`
  re-exports it, so imports did not change.
- **Module interface** (`interactions/types.ts`): `command` (offered every command first),
  `drive` (after the desired velocity, before anything moves: pushing starts and stops here),
  `place` (after the carts and Planck moved) and `facing`. The hub calls them in a fixed order
  (`INTERACTIONS`). The rail and Planck steps stay in `hub.ts`: they are the world, not an
  interaction.
- **The Planck body is active only while the bean walks freely** (D21): `free`, and since the
  bench also `approaching` (a free walk to a seat, with a tap target). While pushing it used to be active, but
  its result was always overwritten; making it inactive changed no state in 2,760 sampled
  states of 11 seeded playthroughs, all 13 hub tests or the session 2 script states.
- **Facing** is computed once at the end of the step from the act's rule, or from the desired
  ground velocity when free. Same values as before (facing never feeds back into physics).
- **Parity check:** `pnpm shot:compare-states docs/status/m1-s2` compares the sim state of every
  stepped shot log with a fresh run, after mapping renamed fields. Live shots (`hub.json`,
  `drop.json`) are skipped: their tick depends on wall-clock time.

### Anchors and pivots (D22)
- **Pivot values were generated from the old rules** and written into the SVGs as
  `data-pivot`; a test re-implements the old rules and checks every part of every file still
  gets the same point. Every stepped PNG was byte-identical before and after.
- **Anchors used now:** `headwear` (every view, at the top of the body), `lean` (side view,
  replacing the constant 40), and the cart's `floor`, `rim-west`, `rim-east`, `base-east`,
  `base-west`. No hand anchors: the push clip still slides the arms by clip data.
- **The cart floor height is sim data** (`CART_FLOOR_M = 0.1`, moved from the client to
  `hub-world.ts`, since the hop ends there); the `floor` anchor must match it (the rail's centre
  line is 10 units north of the cart's origin, plus 10 up).
- **`RAIL_GAUGE_M` moved to `hub-view.ts`** so tests can import it without Phaser.

### Getting into and out of a cart (D23)
- **New acts:** `boarding` (crouch until `hopTick`, hop until `endTick`), `riding` (now with
  `since`, the tick it landed) and `leaving`. Durations are rounded to whole steps: crouch 7,
  hop in `round((0.32 + d/9)·60)`, hop out 23. `d` is the ground distance from the bean to the
  cart's centre on the rail when E is pressed.
- **The arc is a parabola** (`4·arc·p·(1−p)` on top of the straight line), not the prototype's
  sine: the shape of a real hop, and only exactly specified arithmetic (open issue 5). The arc
  heights are the prototype's (0.30 m + 0.3·d in, 0.40 m out).
- **Getting in lands wherever the cart is at the end:** the path bends toward a moving cart.
  Momentum v·m/(m+20) applies at touchdown, at the end of that step (after the rail step), so
  the cart coasts under friction during the crouch and the hop. Getting out applies
  v·(m+20)/m at take-off, at the start of the step (as before).
- **A rider now stands at z = 0.1 m in the sim** (it was 0 and the client added the floor).
  `stepHeight` only runs while the bean walks.
- **Mid-hop:** E, Space and taps are dropped; held keys still update the input, so the bean
  walks on after landing. During the crouch the bean does not stop carts (it is committed to
  the hop), and the Planck body is inactive.
- **`rail.riders`** logs the last 16 in/out events (time, masses, velocities before and after);
  `shot:check-carts` now checks riding from these events plus friction between the shots.
- **Drawing:** jump clip for the crouch (t = 0) and the rising half, fall clip for the falling
  half, a land squash in the cart. Drawn in the cart (between back and front, masked) from the
  top of the hop in, and until the top of the hop out. The draw-back from the cart's end fades
  out over the first half of the hop in. The readout of the cart in use moves up and stays 12
  units above the bean's head. Under reduced motion the drawn height has no arc (`flatZ`).
- **The rider mask** is a Phaser 4 mask filter on the rig (`filters.internal.addMask` with a
  Graphics in world coordinates, not on the display list), rendered only while in a cart:
  everything above the rim, and the cart front's trapezoid below it, from the cart's anchors.

### The bench and sitting (D24)
- **Layout:** `layout.benches` (a solid footprint like the props, plus `seatHeight` 0.30 m,
  `seatDy` −0.15 m and two seats at ±0.4 m). A seated bean's ground point is 0.15 m south of
  the bench's centre line, so its dangling feet hang over the seat's front edge in the drawing.
  The bench is at (−3.6, 1.2) m, clear of every earlier script's path (their sim states are
  unchanged); PLACEHOLDER spot pending D2. The hub's walkable-edges test now uses the plaza
  without the bench (running north from (−3, −1) meets it); its numbers are unchanged.
- **Stand spot:** 0.05 m in front of the bench's footprint, in front of each seat. E picks the
  free seat whose stand spot is nearest (the first on a tie) if it is within 1.3 m; a tap on the
  bench's drawing (`use`, engine bounds) picks the nearest free seat from anywhere. E tries the
  cart first, then the bench.
- **New acts:** `approaching` (tap targets to the stand spot; a held key, a new tap or a jump
  cancels it, and getting stuck gives up; review round 1: from behind or beside the bench it
  walks via two waypoints, out past the nearer end on its own row and down to the stand spots'
  row, so no leg crosses the bench), `seating` (21 steps, arc 0.26 m, starting the step
  after arriving), `sitting` (`since` = the tick it landed) and `standing` (18 steps, arc 0.26 m;
  a tap that stood the bean up is walked to afterwards). Mid-hop, E, Space and taps are dropped;
  held keys still count, so holding a key while landing on the seat stands the bean straight
  back up (any movement input stands it up).
- **Seats can be `taken`** (for Priya); nobody else sits there.
- **A new module hook, `settle`,** runs at the very end of the step: arriving at the stand spot
  (the tap target is dropped there) starts the hop on.
- **Drawing:** the seat's point comes from the bench art's `seat-<id>` anchor, and a bean on or
  hopping to or from the seat is placed between its stand spot on the ground and that anchor
  (screen space), plus the hop's arc scaled like a jump. So the seated bean sits exactly on the
  drawn seat, whatever its depth scale (characters are scaled by depth, props are not). It sorts
  just in front of the bench; no ground shadow while on it.
- **Clips:** `sit` (feet 8–15 units down, alternating over 1.3 s; arms ±12°; breathing) and
  `doze` (feet still at 12, slower breathing, the "z" in a new `fx` slot rising and shrinking
  over 2 s). A track can carry `still`: under reduced motion it holds that value instead of
  being dropped (the feet hang at 12 units, the "z" stays put).
- **Doze** is drawn from `sitting.since` (5 s), not sim state: every client derives the same.
  The eyes swap for `eyes-sleep`; the parts table (`PART_DEFAULTS`) resets them in every other
  state.
- **The `bean` gallery** has a fifth row (sit at four phases, doze at four times), so rows moved
  closer (138 px) and the rigs are a little smaller (0.72).
- **The dev server on port 5180 did not see new source files** (Vite's resolver answered 500 for
  a module added during the session), so shots in this session used `--port 5181`, which starts
  a fresh server per run. Restart `pnpm dev` after pulling.

### Customization basics (D25)
- **The look is data in `shared/src/look.ts`** (colour, pattern, headwear, face; the palette's
  10 colours), for the M2 server to pass between players. The sim never uses it: the boundary
  test fails on any sim source that names anything from that file (with a fixture that proves
  the check can fail).
- **`?look=`** on any scene (ids in any order; unknown ids are a console warning, not an
  error). Boot rasterizes the colours the scene needs: the look's, orange and blue (Priya), or
  all 10 for the `looks` gallery. No in-game wardrobe yet (it needs design).
- **Texture keys** are `bean:<colour>:<source>:<part>` for parts drawn in key colours and
  `bean:any:<source>:<part>` for the rest, so a colour costs only the parts that change.
- **Far shades** (the side and ¾ views' far foot and arm) are not in the palette table: each
  colour's are its foot and arm darkened by orange's per-channel ratios.
- **Cream** gets a 2.5-unit outline in its foot colour on the body (the art rule for very light
  shapes); on the cream plaza it would otherwise vanish.
- **Spots** are clipped to each view's body with an SVG `clipPath` when rasterized, and sit
  right after the body (under the belly, scarf and face) in the body's segment, so they bob and
  squash with it. Front and back spots are symmetric; the side and ¾ views' spots mirror with
  the view (the bean's two flanks are mirror images).
- **Headwear** sits after the goggles (or before the body with `data-layer="behind"`), in the
  body's segment, placed at the view's `anchor-headwear`; the bow's `-left` groups sit at the
  mirrored anchor. The glasses sit after the eyes; there is no face in the back views. Goggles
  and headwear or glasses together are not handled yet (the goggles come with the catapult).
- **The readout of the cart in use** now clears the highest visible part (headwear included),
  not the body's top.
- **"The collider and every sim number are identical for every cosmetic"** is proven by the
  boundary test (the sim cannot see a look) and by `pnpm shot:check-looks`, which runs every
  hub script in the default look and three others through the real game and compares all 48
  stepped sim states (53 with the bench scripts). A Vitest replay across looks was not added: the sim factory takes no
  look, so such a test could not fail.
- **Greyscale:** `looks-greyscale.png` (made from the gallery shot with Pillow) was checked by
  eye: the sprout, the ears and the bow change the head's outline; spots and glasses read as
  darker marks. The bow is the smallest silhouette change.

### Priya, the seated classmate (D24)
- **The sim only keeps her seat:** the east seat is `taken`, so E and taps always lead the
  bean to the west seat. Who sits there (Priya, blue, default look) is client data
  (`scenes/classmates.ts`); she is drawn only where the sim marks the seat as taken.
- **Her greeting is worked out from the bean's state:** for 2.4 s after the bean's `sitting.since`
  on her bench she plays `wave` and shows "Hi!" (the one text exception, DESIGN.md §7;
  PLACEHOLDER system font and a plain panel). No new sim state, and every client draws the same.
- **She waves the arm away from the bean** (screen right): the arm towards it would be hidden
  behind the seated bean. The wave is 0.4 s between −95° and −125°; under reduced motion the arm
  stays raised at −110°. Her feet swing 0.4 s out of step with the bean's.
- **She does not doze, walk or react to anything else** (the prototype's Priya also walked to
  the catapult; out of scope).
- **`hub-bench.json` changed** with her: the bean now walks to the west seat, so the shots are
  retimed and add `greeted` and `greeting-over`.

### Hub presentation (`packages/client/src/scenes/hub-presentation.ts`)
- **One row per act kind:** the act's clip (or null for the ground clips), the toggled parts it
  shows (`arm-far-push`), where the bean draws (`ground` or in a `cart`), the shadow, how much
  of the cart stand-off applies, the cart in use, and the flat hop height for reduced motion.
  Rows take the animation time, so hops animate from sim time. `chooseClip` takes the act's clip instead of the old
  `pushing`/`riding` flags; jump, fall and land still come first.

## M1 session 2 (bean rig v0, carts on a rail), 2026-09-29

### Decisions confirmed at the start of the session
D3 (parts rig in our own code, clips as data, no Spine), D12 for characters (5 views mirrored
to 8; asymmetric parts drawn for the mirrored directions), D4 for the carts (exact 1D sim,
kinematic Planck bodies for the bean's collisions), D18 (bean 1.14 m, 20 kg, drawn jump height
scaled by depth), D19 (cart numbers in SI) and D20 (default scene `hub`). D13 records that
Claude draws the art as SVG; it stays Open. See `docs/DECISIONS.md`.

### Bean art and rig (`packages/client/src/rig/`)
- **The SVGs in `art/bean/` are loaded as they are** (Vite `?raw` imports), split by top-level
  `<g id>`. A small regex parser (not DOMParser) so the same code runs in the art-contract test
  under Node. The contract: flat groups, required parts per view, `-left` drawings for
  asymmetric parts (`art/README.md`).
- **Asymmetric parts:** a part is asymmetric when a `-left` file has it. v0 has two: the scarf
  tail and the eyes. The eye highlights "stay on the light side by rule" was implemented as two
  small `-left` eye drawings rather than code: simpler, and the same mechanism as the tail. A
  test checks every highlight sits right of its pupil and the tail stays on the bean's left.
- **The `-left` drawings are authored as seen on screen**; inside the flipped view the rig
  places them at the mirrored pivot and flips them back, so their motion (rotation, offsets)
  still mirrors like every other part. `data-after` sets their draw order.
- **Pivots by rule** until the files carry pivot markers: arms and the scarf tail rotate about
  the first point of their path, feet about their ellipse centre, eyes about the mean eye
  centre, everything else about (0, 0).
- **Rasterized once at boot** (before the game starts) at 2 texture px per art unit, each part
  cropped to its pixels. Phaser draws images; nothing is redrawn per frame. The shadow part of
  `front.svg` is the ground shadow for every view.
- **Hidden by default:** the goggles (earned; catapult later) and the side view's pushing arm.
- **Rig structure:** root (position, depth scale) → flip (mirroring) → one container per view
  combination (built lazily, shown one at a time) → segments. Consecutive body parts share one
  container with the body transform (bob, lean, squash about the feet); feet sit outside it, so
  they stay on the ground and the SVG draw order is kept.
- **Three animation families:** front/back, the ¾ views, side. Slots `footA/footB/armA/armB`
  map to left/right or near/far parts per view.
- **Clips** port the prototype's keyframes and timings (walk 0.56 s, run 0.34 s, idle breathe
  3 s, blink 4 s, land 0.13 s). CSS ease-in-out is approximated by smoothstep; side-view steps
  are linear, as in the prototype. Keys are fractions of the cycle; a track may have its own
  period (scarf flap) and a half-cycle offset (the other foot or arm).
- **Clip choice from sim state only:** airborne and rising → `jump` (t since take-off);
  airborne and falling → `fall` (t since the apex, −vz/g); within 0.13 s after the exact
  touchdown → `land`; else `run` above 3.3 m/s (halfway between walk and run speeds), `walk`
  above 0.05 m/s, else `idle`. The sim leaves the ground on the jump command, so the crouch
  plays as a squash in the first moments after take-off, not before it.
- **Animation time** is sim time, interpolated like positions: `sim.time − (1 − α)·dt`.
  Looping clips run on the absolute sim time, so switching clips can jump in phase (not
  blended). Blinking is an overlay on every clip.
- **Reduced motion** (`prefers-reduced-motion`, read once when a scene starts): tracks marked
  as body motion are dropped: bob, squash and stretch, breathing and the waddle. The run lean,
  arm and foot poses, the scarf flap and blinking stay. The prototype stopped every animation;
  keeping small limb motion keeps walking readable.
- **No dust puffs, sweat or effort face yet**, and no push clip (see the carts section).

### Hub with the rig
- **Drawn height is `z · depthScale`** (D18): a jump is always about 0.67 of the bean's drawn
  height. The sim's z and the draw order are unchanged.
- **The shot log's `view.bean.rig`** gives the view, mirroring, clip, clip time and the pose's
  body transform.

### Gallery scene `bean`
- A tool scene with no sim: 32 poses at fixed clip times, so it is deterministic without
  stepping. It shows **labels** because it is for reviewers, not players (D17 is about game
  scenes). Under reduced motion it says so in the corner.

### tools/shot
- **`--reduced-motion`** sets Playwright's `reducedMotion: 'reduce'` and writes to
  `<out>/reduced-motion/`, so it never overwrites the normal shots. Logs carry `reducedMotion`.

### Carts: rail sim (`packages/sim/src/rail.ts`)
- **Event-driven exact integration.** Between events each cart (or group of carts pressed
  together) has a constant acceleration, so x + v·t + ½·a·t² is exact. Events solved in the
  step, earliest first: reaching the push cap, stopping, a bumper hit, two carts meeting (time
  of impact from the quadratic gap). At most 32 events per step; beyond that the step only
  clamps positions (never reached in tests).
- **Rolling friction always acts**, including while pushing (D19): net push acceleration is
  F/m − 0.26 m/s². It is a constant deceleration, the same for every mass (μ_r ≈ 0.0265). A
  cart at rest feels none. At the cap the push exactly balances friction and the speed holds.
- **Pushing against the motion** slows the cart with push and friction together. If F/m were
  below 0.26 the push could not start the cart (not the case for these masses).
- **Carts pressed together move as one body** (the bean pushes one into the other): combined
  mass, one push, one cap. Bumpers stop a group pushed into them.
- **Collisions:** instantaneous impulses. Bumpers v' = −0.45·v; carts use the 1D restitution
  formula with e = 0.5 and conserve momentum exactly. Closing speeds under 1e-6 m/s end in
  contact (no bounce), so bounces cannot chatter. Carts are exactly touching after an impact.
  The prototype's visual bounce above 0.45 m/s is not drawn yet.
- **Riding** conserves momentum with the bean at rest along the rail: getting in
  v' = v·m/(m+20), getting out v' = v·(m+20)/m (the bean hops off without carrying momentum,
  as in the prototype). The 5 kg cart is the only one that can be ridden.

### Carts in the hub (`packages/sim/src/scenarios/hub.ts`)
- **Layout:** rail at y = −2.1 m from x = −3.68 to 3.68 (the prototype's 736 px), 5 kg cart at
  x = −2.1 and 20 kg at 1.6 (the prototype's spots, centred). Carts are 0.8 × 0.4 m on the
  ground. PLACEHOLDER layout pending D2.
- **In Planck, carts are kinematic boxes.** Each step the rail moves first; each cart body then
  sweeps from its old to its new position during the world step, then it is set exactly to the
  rail's position.
- **A bean standing on the rail stops carts** (review round 1: a cart used to carry the bean
  along at full speed). When the bean's footprint overlaps the rail band (|y − rail| < 0.45 m)
  and it is not riding, the rail sim splits the rail at the bean's footprint [x − 0.25, x + 0.25]:
  carts on each side stop against it with restitution 0 (the braced bean passes the momentum to
  the ground) and the rail logs a `bean` collision. The bean is not pushed along (Planck's
  contact skin may shift it by a few millimetres). A `bean` collision does not conserve the
  carts' momentum by design, so the momentum checks only use `carts` collisions. The prototype
  slowed the cart by 10% per frame instead. The rule ignores height: a bean mid-jump over the
  rail also stops a cart (Planck would bump it anyway); hopping over low objects is not built.
- **Pushing:** on the ground, the bean's centre within the rail band (|y − rail| ≤ 0.2 m, so it
  touches an end, not a long side), its footprint within 0.03 m of the end, and at least 35% of
  its move direction along the rail towards the cart (the prototype's 0.35). Run pushes with
  63 N. From the north or south the box simply blocks the bean. While pushing, the bean's
  facing is forced along the rail (side view) and it is kept against the cart's end, moving at
  the cart's speed; tap targets do not count as stuck while pushing.
- **E (`action`)** gets in within 1.2 m of the light cart's centre (on the ground; the
  prototype used 2.2 m) and gets out. **Space** gets out instead of jumping while riding.
  Getting in is instant (no hop animation yet). While riding, movement input is ignored, the
  bean follows the cart, and its Planck body is inactive (set from the state every step).
  Getting out puts the bean 0.5 m south of the rail at the cart's x.
- **A rider's facing** (the user's request): toward the camera while the cart is still, the way
  it travels while it moves. It turns sideways above 0.3 m/s and back to the camera below
  0.1 m/s, keeping its facing in between so it never flickers. In the sim, since facing is
  shared state (M2).
- **The state keeps the last 16 collisions** (`state.rail.collisions`) with masses, velocities
  before and after, and the solved impact time, for the scripted checks.

### Carts in the client
- **Drawn carts** from `art/props/cart.svg` (added at the user's request after review round 1):
  back and rocks behind a rider, front and two wheels in front; the wheels roll without
  slipping (angle = x / 0.09 m). The rail, sleepers and bumpers are still PLACEHOLDER shapes in
  code. Carts draw at a fixed size like the tree (props are not depth-scaled).
- **Speed readout** above each cart: |v| with two decimals and "m/s" (a measurement readout,
  D17). No mass labels (no labels on interactables); the rocks show which cart is heavy. The
  shot log lists each cart's readout next to the speed it should show.
- **Riding draw order:** cart back, then the bean standing on the cart floor (0.1 m up), then
  the cart front, which hides the bean's feet. The shadow hides while riding.
- **Push clips** (DESIGN.md §6): side view, lean 10° (light) or 16° (a cart of 10 kg or more),
  both arms forward (the side view's far arm shows), steps every 0.45 s or 1 s. The lean stays
  under reduced motion; the small bob goes. No effort face or sweat drop yet. While riding the
  bean plays `idle`.
- **Controls hint** now includes "Action: E". No on-screen touch buttons yet (phones cannot get
  into a cart): noted as open.
- **Next to a cart's end the bean is drawn back from its footprint** (review rounds 1 and 2: it
  overlapped the cart, pushing or standing). Its drawn body is wider than its 0.25 m footprint,
  so on the rail the drawing (and its shadow) moves away from the nearest cart until the body
  meets the end. How far the body reaches comes from the body part's drawn bounds in the
  current view (`BeanRig.bodySpan`), plus the lean's tip at belly height (0.40 m · sin lean)
  while pushing. Drawing only; the sim position and the shot log's sim state are unchanged (the
  log's screen position is the drawn one). The push clip slides the arms forward so the hands
  reach the cart.
- **Carts stand on the near rail:** the rails are drawn 0.2 m apart (±0.1 m from the rail's
  centre line) and a cart's drawing is placed on the near (south) rail, where its visible
  wheels run (review round 2: they sat between the rails).
- **The readout moves up (1.35 m instead of 0.95 m) while the cart is ridden**, clear of the
  bean's head.

### Prop art (`art/props/`, `packages/client/src/art/`)
- **The tree and the cart are drawn once as SVG** (they never turn) and loaded by part id like
  the bean, rasterized at boot by the shared `art/raster.ts`. Part lists per prop are checked
  at boot and in `prop-art.test.ts`. Wheels pivot on their hub by rule (`wheel-…` parts).
- **The tree's look changed** (a cloud canopy of flat circles, a flared trunk); its footprint,
  position and draw order did not.
- **A rider is wider than its cart:** the bean's body (1.0 m × depth scale, about 0.87 m by the
  rail) sticks out past the 0.8 m cart's sides. The prototype clipped the rider below the rim.
  Open issue.

### tools/shot
- **`pnpm shot:check-carts`** re-checks the three cart scripts' logs: push acceleration
  (F/m − 0.26), the cap, momentum and restitution of the logged collision, riding speeds and
  every readout.

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
- **Output goes to `artifacts/shots/<script name>/`.** Script file names follow the shot-name
  rules and must be unique within a run, so the folder is always a direct child of `--out`. At
  the start of a run only that folder's top-level `.png` and `.json` files are removed. The
  shot name `run` is reserved. Relative `--script` paths resolve against the repo root, like
  `--out` (pnpm runs the tool from `tools/shot`).

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
  distance, so the bean arrives exactly when nothing is in the way. A target right against an
  edge, corner or prop can't be reached exactly (Planck's contact skin); a blocked step within
  0.02 m of the target counts as arrived. Run applies to tap moves while Shift is held.
- **Stuck:** a step is blocked when it makes less than 25% of the intended progress toward the
  target; 21 blocked steps in a row (0.35 s) drop the target. Sliding along a prop is not stuck.
- **Facing** is the unit vector of the last ground movement, kept while idle; it starts facing
  the camera (south). The rig will map it to the 8 views.
- **The layout is fixed per scenario.** `state.layout` is for reading; the Planck world is built
  from it once, when the scenario is created.
- **Commands with non-finite numbers are ignored** (they will arrive over the network in M2).
- **Commands:** `move` (held direction plus Run), `moveTo` (tap target), `jump`. The held input
  is part of the sim state, so a replay needs only the commands.

### Hub scene (`packages/client/src/scenes/HubScene.ts`)
- **Projection:** `screen = (x·100, −(y + z)·100)` px, no foreshortening (1 m north = 100 px
  up, as in the prototype). Camera zoom 1, centred on ground point (0, −0.5), so the 11.6 × 5 m
  walkable area fills most of the 1280×720 view.
- **Depth scale** `0.62 + 0.30·clamp((y_top − y) / depth_range, 0, 1)`, with y_top the walkable
  area's north edge and depth_range its north-south size (5 m). Only the bean is scaled;
  props are drawn at a fixed size (DESIGN.md §4 says characters scale).
- **Draw order** is `−y·100` from the ground position (not the height), so a jump never changes
  the order. On the same ground row the bean draws in front of a prop (explicit +0.5 tie-break),
  and the shot log's behind or in-front field uses the same rule. Props sort by their footprint
  centre. Ground, floor and shadows sit below everything sorted.
- **Placeholders**, all marked in code: the bean is an outlined ellipse with a belly and eyes.
  The eyes slide toward the facing direction and hide when facing away; this is not the 8-view
  mapping. The prop is a round tree. The floor is a stone rectangle with a hedge band.
- **Input:** held keys are read from Phaser key objects, and a `move` command is sent only when
  the direction or Run changes (on key events and once per frame, which catches keys released
  on blur). Space sends `jump` on its keydown event, ignoring OS repeats. Phaser's `JustDown`
  misses a press and release within one frame. A tap or click sends `moveTo` with the ground
  point under the pointer (z = 0); only the primary button or a touch counts.
- **No on-screen touch buttons** for Run and Jump yet; phones can tap-to-move only.
- **The hub shows one controls hint** ("Move: arrows or WASD   Run: Shift   Jump: Space"),
  which the no-text rule allows. There is no other text.

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
