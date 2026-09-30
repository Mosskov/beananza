# Design topics backlog

Nothing is approved. "Explored" means discussed or mocked up with a leaning, not final.

## Up next
1. **First expedition** (Mechanics Valley, projectile): what students do, the prediction interface, measurement tools, success criteria. Blocks Milestone 1 (D9).
2. **Tools prep:** done 2026-09-30 (PR #5): CI, golden sim states, the art toolkit, the clip
   sheet, the reviewer agent, PR template and guard hooks.
3. **Reaction model:** done 2026-09-30 (D26, PR #7). The reaction art is still to draw.
4. **Teacher and classroom experience:** how a lesson runs start to finish, teacher controls, fitting a class period.
5. **Progression and notebook:** what students collect or unlock, mastery tracking, reasons to return at home.
6. **Onboarding:** a student's first five minutes (bean creation, controls, first prediction).
7. **Hub decisions:** camera (D1), layout (D2), region instancing (D8).
8. **Other regions:** Wave Canyon, Storm Highlands, Crystal Caves.
9. **Sound and music:** not discussed yet.
10. **Art contract:** in place for the bean, cosmetics and props (`art/README.md`, checked in
   tests); what remains is the bean-shape approach (below) and the next steps in
   `docs/ART_PIPELINE.md` §7.
11. **Drawing tool:** answered 2026-09-29: Claude draws SVG text, so there is no tool and no
   exporter (D13).
12. **Sim architecture sketch** in SI units, plus the first unit tests (done in M0).
13. **Catapult as predict, test, compare:** a prediction marker, a trail of the real flight, and the gap between them. Deferred by the user for now.

## To return to (raised 2026-09-29, share-site session)

### Blurry game at full screen (fixed 2026-09-29)
**Fixed:** see "A sharp picture at full screen" in `docs/archive/ASSUMPTIONS.md` and
`packages/client/src/screen-scale.ts`. The problem and the plan below are kept as they were.

**Problem:** the game draws into a fixed 1280×720 canvas (`Phaser.Scale.FIT` in
`packages/client/src/main.ts`), and the browser stretches that image to fill the screen, so the
bean, props and readouts look soft. Measured on the built game:

| Screen | Canvas | Shown at |
|---|---|---|
| 1920×1080 | 1280×720 | 1920×1080 (1.5× stretch) |
| 1920×1080 at 150% Windows scaling | 1280×720 | 2880×1620 (2.25×) |
| 2560×1440 | 1280×720 | 2560×1440 (2×) |

The art is rasterized at 2 texture pixels per art unit (`ART_RESOLUTION` in
`packages/client/src/art/raster.ts`), so the detail exists; it is lost when the scene is drawn at
1280×720 and then stretched. The embedded game on the share site is barely affected (its frame is
about 1280 wide); full screen and `play/` on its own page are.

**Proposed fix (built as described, with k capped at 2.5 and `ART_RESOLUTION` 3):**
- Size the canvas to the real screen pixels: factor k = fit scale × `devicePixelRatio`,
  recomputed on resize. Every camera zooms by k, so scenes keep their 1280×720 layout and
  coordinates.
- Raise `ART_RESOLUTION` from 2 to 3, so the bean stays sharp up to about k = 2.5 (it is drawn at
  up to 0.92× in the hub).
- Render text readouts at resolution k.
- Cap k at about 2.5 for weak Chromebooks, and check fps with `pnpm shot` on a large viewport.

### Changing the bean's shape (part of D13, still Open)
**Problem:** the body outline is drawn separately in each of the 5 views (front, front ¾, back ¾ and
back share one path; side has its own). About 10 parts per view are placed against it by hand:
belly, scarf, shoulders, eyes, cheeks, mouth, goggles, the headwear anchor, sleep eyes, the doze
"z", plus the `-left` drawings. A new shape means redrawing all of them. Two slips from this came
up in one session: the side belly had to be recomputed from the body curve, and back ¾ had copied
front ¾'s near and far sides.

**Options discussed:**
1. **Hand-drawn outline, everything else snaps to it.** Parts that hug the body (belly, scarf,
   patterns) are drawn oversized and clipped to the body outline when rasterized; patterns
   already are (D25). Parts on the body (eyes, arms, headwear) hang from anchors (D22). A new shape
   is then 5 outlines plus about 5 anchors per view.
2. **Generated outline.** Describe the body as a simple 3D shape with a few numbers (height,
   width, roundness of the top) and project it to each view's outline and anchor positions, like
   the paper 3D props (D12). A new shape, or another body form (D7), is a change of numbers. Risk:
   a mechanical look; hand choices such as the side eye set in from the edge need rules or
   per-view offsets.
3. **Keep drawing everything by hand.** Fine only if the shape rarely changes.

**Leaning (not decided):** option 1 now, as it extends D22; the missing piece is clipping the belly
and scarf to the body. Try option 2 as a small prototype when D7 (more body forms) comes up, since
four forms × five views is where hand drawing gets expensive.

## To return to (raised 2026-09-29, after M1 session 3)

### A smoother session workflow (done 2026-09-29, tools session)
**Superseded 2026-09-30** by CLAUDE.md "How we work" (short steered sessions, one at a time,
decisions asked in-session). Kept as it was:

**Decided with the user:**
- **Design passes run in a separate short chat** before a build session, so the build runs
  without waiting on answers. The D9 questions are now in `docs/D9-options.md`.
- **Concurrent sessions each use their own git worktree** at a short path, on their own branch.
- **Art changes are reviewed with `pnpm art:sheet`** (D13).

**Built** (see README):
- `tools/shot` starts its own server on a free port by default (`--reuse` for the one on 5180),
  and `--jobs` runs scripts in parallel with identical sim states.
- `pnpm verify`: the whole pass in about 55 s, `pnpm check` included. The same checks took
  91 s plus `pnpm check` as separate commands; `check-looks` alone went from 58 s to 29 s.
- `pnpm shot:sheet` and `pnpm art:sheet`.

What follows is the original write-up.

**Problem:** M1 session 3 took about 2 h 20 min of active work, not counting the waits for
answers. Some of that was the scope: a refactor with a parity proof, anchors, the cart hop, the
bench, Priya and customization, plus two review rounds. The rest was avoidable friction:
- **Verification was slow.** A full pass (61 shots, `shot:check-carts`, `shot:check-looks`,
  `shot:compare-states`) took several minutes and ran about 6 times. The session's ad-hoc
  runner started a new pnpm, Vite server and browser for every script, although `pnpm shot`
  takes many `--script` flags in one run. `check-looks` replays every hub script 4 times.
- **A stale dev server.** The `pnpm dev` server on port 5180 stopped seeing newly added source
  files and answered 500, so every later run had to start its own server on port 5181.
- **Backslashes lost in the shell.** Heredocs and inline Python in the Bash tool collapsed `\\`
  into `\`, which broke regexes and strings about five times.
- **Two sessions in one working tree.** The share-site session switched branches under the
  session 3 work, and the two had to coordinate by message.
- **No shared way to look at many frames.** The session wrote a contact-sheet helper in its
  scratchpad, and the reviewer overwrote it with its own.

**Proposed changes, not started:**
1. **Smaller sessions:** one or two slices per prompt, each reviewed on its own.
2. **`pnpm verify`:** one command that runs `pnpm check`, every scene and script in one browser
   session, `shot:check-carts`, `shot:check-looks` and `shot:compare-states` against the latest
   `docs/status/` folder, and prints a short summary. Full runs only at the end of a slice; in
   between, only the scripts a change touches.
3. **`pnpm shot:sheet`:** a repo tool that crops and tiles shots into one image (with labels), so
   a session or reviewer can look at many frames at once.
4. **One git worktree per concurrent session** (`git worktree add`, short paths), so sessions
   never share a branch or working tree. *Done: in CLAUDE.md.*
5. **tools/shot always starts its own server** on a dedicated port, instead of reusing whatever
   runs on 5180. *Done: on a free port by default; `--reuse` opts in (`tools/workflow`).*
6. **Session prompts say to use the Write and Edit tools for code with backslashes.** The
   fourth-session prompt already does.

**When:** items 2, 3 and 5 are small tools work (about half an hour) and fit at the start of a
session, before its first slice. Items 1, 4 and 6 are about how prompts are written and
sessions are run.

## Parked
- **Enemies and bosses:** misconception-themed and non-violent. The Heavy Baron is sketched, with Phase 1 prototyped (D10).

## Explored so far
- Overall concept and core loop
- Visual style (cozy storybook with field-notebook overlays)
- Characters: bean buddies, body forms, customization layers, five views, animation set
- Movement and interactions: walk, run, jump, push carts, sit on the bench (tuning values in DESIGN.md)
- Hub concepts: small plaza, town square, floating islands
- Multiplayer, progress tracking and tech stack proposals
- Prototype arena: cart riding, U-Track energy ride, swimmable pond with a shark fin, catapult with crank, Priya launcher, goggles and bandage
- Rotation approaches (drawn views, paper 3D, pre-rendered 3D, live 3D), the art pipeline proposal, and engine options including Unreal
