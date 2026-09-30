# Implementation direction

From the design session, September 2026. Everything here is a proposal or a lesson learned,
except where marked **user-directed**. Nothing is approved. Open questions live in
`docs/DECISIONS.md` (see D3, D4, D12, D13, D14).

## 1. What the prototypes are for

The design canvas and the showcase page are a **sketchbook**: fast to make, cheap to throw away,
good for deciding what the game should feel like. Port their *behavior* and *tuned numbers*.
Never port their code. It is SVG plus CSS keyframes plus JavaScript that was patched many times
over, and it was never meant to be a codebase.

Reference material is in `reference/` (open the HTML files in a browser) and linked in `CLAUDE.md`.

## 2. Lessons from the prototype workflow

**Worked well, keep:**
- **Parts-based vector bean.** One set of parts across five drawn views (mirrored to eight
  directions) gave squash and stretch, goggles on and off, a bandage, swimming and floating on
  its back, all with very little extra art. Strong evidence for D3.
- **Fast idea-to-playable loop** for design exploration.
- **Screenshot and interaction testing after every change.** Nearly every visual bug (carts
  leaving the rails, the bean poking out of the cart, a mouth hidden under a medal) was caught
  by looking at a screenshot or running a scripted playthrough. Build this into the real repo
  (built in M0: `tools/shot` and `pnpm verify`).
- **The tuned numbers** in section 6. They are the most valuable thing to carry over.

**Does not scale, avoid:**
1. **Duplicated art.** Every board had its own copy of each drawing. The Heavy Baron was drawn
   five or more times, and one bug (the sash covering his mouth) existed in every copy.
   Draw once, generate everything else (see `docs/ART_PIPELINE.md`).
2. **Fragile plumbing.** The showcase was scraped from the canvas and the game logic sits under
   about a dozen layers of search-and-replace patches. Ordering bugs kept appearing.
3. **Physics in screen pixels with fudge factors.** Depth squashed to 0.55, per-object scale
   factors, one pixel speed for every direction. A game that shows students numbers needs the
   simulation in real units, with the camera as a separate projection.
4. **Animation as CSS classes** toggled by state. Hard to sync to physics events (landing, a
   splash, putting goggles on). Store clips as data and play them from code.
5. **Hand-made depth slots** for every object (behind the bench, around the catapult, and so on).
   Sort automatically by world position (y-sort).
6. **Per-object hit testing** written by hand. Use engine picking against object bounds.

## 3. Architecture rules (proposed)

- `packages/sim` is pure TypeScript: SI units (m, kg, s), +Y up, fixed 60 Hz timestep with an
  accumulator, seeded RNG only, no DOM, Phaser or network imports. Input goes in as commands.
  A test should fail if `sim` imports anything from the client.
- The camera is a projection layered on top: 3/4 top-down in the hub, side view in expeditions.
  Sim state is in world units; the client converts with `PIXELS_PER_METER`.
- **Teaching scenarios use exact integrators** (projectiles, the U-Track, energy) so the numbers
  shown to students are textbook-true. Use Planck.js only for general collisions. Box2D's
  friction and bounce are approximations that could make a correct prediction look wrong.
- Lock tuned behavior with unit tests, for example: "crank notch N always lands at distance D",
  "energy never increases on the U-Track", "a 1 kg and a 10 kg ball dropped from 10 m land
  together".
- Rendering: one container per rig, automatic depth sorting by world y.
- Animation: clips as keyframes per part, played by a small rig player. The prototype's CSS
  timings convert almost one-to-one.
- Cosmetics never affect physics (unchanged from `CLAUDE.md`).

## 4. Rotation (see the comparison page)

Live comparison: https://claude.ai/artifact/6pakwQQE6hkR8MzaMhBzT2 (also `reference/bean-turn.html`).

In a 3/4 view, turning something on the ground cannot be done by rotating a flat picture. It just
looks like a tilted picture. Tilting in the picture plane (a side view) is free.

| Approach | Free rotation | Art cost | Fit |
|---|---|---|---|
| Drawn views (5 drawings, mirrored to 8) | Snaps to 8 directions | One drawing per view per prop | Best for characters |
| "Paper 3D" in code (simple boxes, beams, wheels, drawn flat) | Any angle | Props authored as shapes | Good for boxy props, faceted on round bodies |
| Pre-rendered from 3D (8 or 16 angles) | Snaps | 3D modelling and rendering | Loses the hand-drawn look |
| Live 3D (Three.js, toon shading) | Any angle | Biggest pipeline change | Riskiest for the storybook look |

**Leaning (D12):**
1. Characters stay 2D parts rigs with 8 directions.
2. Most props never rotate (bench, gate, trees, pond): one drawing each.
3. The few props that must turn in the hub (catapult, carts on curved track) use a small
   "paper 3D" prop kit (box, beam, wheel, arm). The prototype catapult is a working example.
4. Split aiming: coarse facing in the hub, precise launch angle and power in a side view, where
   tilt is free and the parabola looks true.
5. Do not adopt a full 3D engine unless the world ends up full of rotating props.

Open question for the user: how many props beyond the catapult and carts must players turn or
aim in the hub? That decides whether the paper 3D kit is a one-off or a real system.

## 5. Engine options (D14)

Researched September 2026; verify current state before relying on it.

- **Unreal Engine: not recommended.** Epic dropped built-in HTML5 export after UE 4.24. In UE5 the
  official route to a browser is Pixel Streaming (server-rendered video, one stream per player,
  costly and latency-prone; a class of 30 means 30 streams). Third-party WebGPU ports exist but
  are unofficial. Unreal is 3D-first, builds are large, school laptops and Chromebooks are the
  baseline, and Epic announced Unreal Engine 6 in May 2026 (UE 5.8 is the last planned UE5
  release), so it is mid-transition. It would make sense only if the project became an installed
  3D game for capable PCs.
- **TypeScript + Phaser + Vite** (current proposal): code-first 2D with a large HTML5 community.
  Fits the parts-rig characters and lets Claude Code write, run and test everything directly.
- **Godot:** the alternative if a visual editor for non-programmers matters. Free and open source,
  strong at 2D. Web export uses WebGL 2.0 (Compatibility renderer).

## 6. Prototype behavior and tuned numbers

All values are from the showcase prototype, in **screen pixels** (100 px is about 1 m). They are
tuned for *feel*. Choose SI values in the real sim and re-tune to reach the same feel. Hub jump
gravity is stylized (1500 px/s², not 9.8 m/s²); decide deliberately whether the hub should be
realistic.

**Movement:** walk 240 px/s, run 420. Hub jump: vz 480, g 1500 (apex about 77 px, air time about
0.64 s). Swimming 130 px/s (190 with Run), back stroke 110. Priya walks at 150 px/s.

**Carts on the rail** (5 kg and 20 kg): push force 4200 (6300 running) px·kg/s²; speed caps 190
(280 running) px/s; rolling friction 26 px/s²; bumper restitution 0.45; cart-to-cart 0.5.
Riding the empty cart: the bean adds 3 kg. Hopping in applies v' = v·m/(m+3) and hopping out
reverses it (momentum is conserved). The cart bounces visually only for impacts above 45 px/s.

**U-Track** (side view, reached through the plaza gate): parabola y = 620 − 0.002·(x−640)² px
(3.2 m start height); g 980 px/s²; rolling friction coefficient 0.02; air drag 0.00008·v|v|;
release nudge 140 px/s; winch 110 px/s; car 5 kg, 8 kg with the bean. The energy bar splits
total energy into height (M·9.8·h), motion (½Mv²) and lost to friction. Red dots mark each
turning point. A ride takes about 45 s to settle.

**Pond:** swim speed as above; jump-in makes a big splash and a 0.6 s dunk; walking in makes a
small one. Space in the water flips to a back float; Space again rolls back over. After 15 s
in the water a harmless shark fin rises and roams; it sinks when the bean leaves.

**Catapult** (5 crank notches; the bean cannot launch it):
- Crank: E or click winds one notch. Past 5 it releases back to 0. Firing uses up the tension.
- The arm rests at 198° (+2.5° per notch) and swings to 58° in 0.36 − 0.035·notch seconds
  (ease-out cubic). The bean is released as the arm passes 74°.
- Launch is 45°: horizontal speed equals vertical speed. Vertical speed by notch:
  `[110, 190, 290, 440, 515, 760] px/s`, flight gravity 1500 px/s², flight time
  T = (vz + √(vz² + 2·g·z0)) / g where z0 is the release height. The bean does one somersault.
- Rough landings from the default spot: notches 0–1 sand in front; 2 near side of the pond;
  3 far side of the pond; 4 the grass beyond the pond; 5 leaves the arena. Treat these as
  targets for feel; re-derive in real units.
- The catapult can be grabbed by its rear handle (E) and pulled like a wagon; it follows and
  turns to point away from the bean. It cannot be dragged into the pond, onto the bench or over
  the rails. The launch direction is wherever it points.
- Landing on the ground: dust puff and about 1.6 s of dizzy stars. Flying out of the arena: the
  bean is gone for about 1.4 s, then walks back in from the nearest screen edge onto dry ground
  with a bandage for a few seconds.
- Goggles: pulled over the eyes when the bean lands in the bowl (0.75 s animation), pushed back
  up about 1 s after landing.

## 7. User-directed prototype feedback (current direction)

These are direct requests from the user while prototyping. Treat them as strong preferences, and
still confirm before hard-coding anything that conflicts with an Open decision.

- **No text inside game scenes.** Players discover what is clickable on their own. The one
  exception is Priya's "Hi!" bubble when the bean sits next to her.
- **Hints are only the controls:** Move (arrows or WASD), Run (Shift), Jump (Space), Action (E).
- **E is a context action** on whatever is nearby: step through a gate, get in or out of a cart,
  sit or stand at the bench, grab the catapult handle, wind the crank, climb into the bowl, get
  into the U-Track car, let go, winch back up. **Space jumps**, and it also leaves a cart or the
  catapult, or flips to a back float in water. Everything is also clickable, and touch screens
  get on-screen buttons.
- **No self-launch** on the catapult: clicking Priya while the bean sits in the bowl makes her
  walk over and pull the lever.
- **Full-screen mode for every showcase strip.**
- A prediction flag (drop a marker where you think you will land) was discussed and deferred
  ("not for now"). It is the natural next step for the catapult as a predict, test, compare moment.

## 8. Known issues in the reference art

- The Heavy Baron's sash runs into the mouth and off the body edge, and the "1 t" medal sits on
  the mouth. This exists in the exported `art/baron/heavy-baron.svg` and in the design canvas.
  A corrected version is in the "The Heavy Baron" section of `reference/showcase.html` (the sash
  is lowered and clipped to the body, and the medal moved up to the sash near the left shoulder).
