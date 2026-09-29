# Design topics backlog

Nothing is approved. "Explored" means discussed or mocked up with a leaning, not final.

## Up next
1. **First expedition** (Mechanics Valley, projectile): what students do, the prediction interface, measurement tools, success criteria. Blocks Milestone 1 (D9).
2. **Teacher and classroom experience:** how a lesson runs start to finish, teacher controls, fitting a class period.
3. **Progression and notebook:** what students collect or unlock, mastery tracking, reasons to return at home.
4. **Onboarding:** a student's first five minutes (bean creation, controls, first prediction).
5. **Hub decisions:** camera (D1), layout (D2), region instancing (D8).
6. **Other regions:** Wave Canyon, Storm Highlands, Crystal Caves.
7. **Sound and music:** not discussed yet.
8. **Art contract:** write it with the bean as the worked example; blocks D13 (see `docs/ART_PIPELINE.md`).
9. **Drawing tool:** which tool the artists will use; blocks the exporter.
10. **Sim architecture sketch** in SI units, plus the first unit tests (`prompts/M0-first-session.md`).
11. **Catapult as predict, test, compare:** a prediction marker, a trail of the real flight, and the gap between them. Deferred by the user for now.

## To return to (raised 2026-09-29, share-site session)

### Blurry game at full screen
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

**Proposed fix, not started:**
- Size the canvas to the real screen pixels: factor k = fit scale × `devicePixelRatio`,
  recomputed on resize. Every camera zooms by k, so scenes keep their 1280×720 layout and
  coordinates.
- Raise `ART_RESOLUTION` from 2 to 3, so the bean stays sharp up to about k = 2.5 (it is drawn at
  up to 0.92× in the hub).
- Render text readouts at resolution k.
- Cap k at about 2.5 for weak Chromebooks, and check fps with `pnpm shot` on a large viewport.

**When:** after the M1 session 3 work lands, because it touches the client code that session is
editing (`main.ts`, `HubScene`, art loading).

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
