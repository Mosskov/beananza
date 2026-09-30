# Design spec (working draft)

**Status: exploration. Nothing here is approved.** Sections are marked:
- **Explored**: prototyped or mocked up, direction liked, not final
- **Proposed**: recommended, needs confirmation
- **Open**: undecided, see `DECISIONS.md`
- **Parked**: deliberately set aside for now

Visual reference: the design canvas the user created with Claude (claude.ai artifact
`https://claude.ai/artifact/9YDRLAEtTBbmrrfWxTDWyX`, private to the user unless shared). It holds
the style studies, hub concepts, character sheets, animation loops and interactive prototypes
this spec summarizes.

---

## 1. Vision and audience (Explored)
- Browser game for **high school** physics. Used **in class with a teacher and at home**.
- Physics is the world's rules. The core habit we train: **predict → test → compare**.
- Tone: cozy, fun, low stakes. Missing a prediction is funny, never punishing.
- Sessions must fit a class period: expeditions of roughly 15–20 minutes.

## 2. Core loop (Explored)
1. The class gathers in a shared **hub**.
2. Students form **groups of 2–4** and pick an assigned expedition.
3. The group travels through a **region gate** into its expedition.
4. Before key events, each student **predicts** the outcome; the world then shows what happens.
5. Results feed a personal **field notebook** and the class-wide **Discovery Wall**.
6. Groups return to the hub to share.

## 3. World structure
**Regions** (Explored), each teaching a domain:
- **Mechanics Valley**: kinematics, forces, energy, momentum
- **Wave Canyon**: waves and sound
- **Storm Highlands**: electricity and magnetism
- **Crystal Caves**: optics (locked at start)

**Hub, the "Field Station"** (Explored): shared by the whole class (about 30 players). Features:
region gates, Expeditions board, Discovery Wall, demo stage or amphitheater (teacher demos),
Wardrobe (customization), Library (notebook), playground with physics toys (seesaw, swings,
trampoline, carts), group camps, benches, pond, arrival pad.

**Hub layout (Confirmed, D2, 2026-09-30):** one 2D **hexagon island floating in a blue sky**
(flat edges north and south, 24 m corner to corner), big enough for a class of about 30, with a
camera that follows the player's bean. A stone arrival pad at the centre; stone paths lead to
**one portal per region** (Mechanics Valley, Wave Canyon and Storm Highlands along the north half;
Crystal Caves, locked, by the west corner). The cart rail, the bench with Priya and trees are on
the island. Walking into a portal (or tapping it, or E near it) floats the bean into its swirl
and on to the region; each region is a placeholder scene until it is built. Earlier concepts, for
the record: A, *Town square* (one large island with neighbourhoods) and B, *Floating islands* (a
central island with rope bridges to one islet per region).

**Anomaly zones (Proposed):** pockets where one law is subtly altered (sideways gravity,
zero friction, no momentum conservation). Students diagnose what changed.

## 4. Camera and views
- **Hub: ¾ top-down view (Proposed).** Proven in the walk-around prototype. Characters scale with
  depth: `scale = 0.62 + 0.30 * clamp((y - y_top) / depth_range, 0, 1)`, and draw order is sorted
  by ground y. Isometric was explored for hubs but is not recommended (depth-sorting cost).
- **Expeditions: side view** with real gravity, so heights and trajectories are readable.

## 5. Visual style (Explored)
- **Cozy storybook**: warm, flat shapes, soft drop shadows (12–18% opacity), rounded forms.
- Physics overlays (vectors, predicted arcs, measurements) use a hand-lettered **field notebook**
  look: dashed arcs, labeled arrows.
- Fonts: **Fredoka** (display), **Nunito** (UI), **Caveat** (in-world signs and annotations).
- Palette and drawing conventions: `art/README.md`.

## 6. Characters: bean buddies (Explored)
**Avatar:** a small, round "bean" creature.

**Body forms (Explored, cosmetic only):** Bean, Mochi (short and wide), Gumdrop (pointed top),
Pill (tall and slim). All share one collider and identical physics.

**Customization layers (Explored):**
- Color: about 10 base colors (each with arm, foot and belly shades)
- Pattern: plain, spots, stripes, freckles, two-tone belly, patch
- Headwear (biggest silhouette change): beanie, sprout, antenna, bear ears, bow, tuft, propeller cap, ball cap
- Face: round, sleepy, sparkly, lashes, glasses, wink, cat mouth, toothy
- Accessories: scarf, satchel; **earned** per region: goggles (Mechanics), snorkel (Waves),
  bolt pin (Storm), prism pendant (Crystal)
- **Group scarf** in the group's color appears automatically while in a group
- **Teacher** is visually distinct (white lab-coat bean)

Rules: silhouettes must stay distinguishable without color (color-blind students); preset parts
only, no custom text or drawings; gently discourage exact duplicates within a class.

**Views (Explored):** five drawn views (front, front ¾, side, back ¾, back). The side and ¾ views
are mirrored for the other side, giving 8 directions. Mapping from movement angle
(screen coordinates, y down, degrees):

| Angle range | View | Mirrored |
|---|---|---|
| −22.5 to 22.5 | side | no (facing right) |
| 22.5 to 67.5 | front ¾ | no |
| 67.5 to 112.5 | front | no |
| 112.5 to 157.5 | front ¾ | yes |
| beyond ±157.5 | side | yes |
| −157.5 to −112.5 | back ¾ | yes |
| −112.5 to −67.5 | back | no |
| −67.5 to −22.5 | back ¾ | no |

When idle, keep the last facing. When pushing, force the side view.

**Rig (Proposed):** parts-based, animated in code (tweens or timelines). Reference part geometry
with part ids: `art/bean/*.svg`. Origin (0, 0) is the point between the feet on the ground.

**Animation states (Explored), timings from prototypes:**
- **Idle:** breathe (squash about 3.5%, 3 s loop), blink every 4 s
- **Walk:** 0.56 s cycle. Side view bobs and steps; front and back views waddle (±5°) with alternating foot lifts; arms swing
- **Run:** 0.34 s cycle, 8° forward lean, bigger bounce (about 12 units), strong arm pump, dust puffs, fast scarf flap
- **Jump:** crouch (squash) → launch (stretch) → airborne (arms up, feet tucked) → fall → land (squash 0.12–0.14 s, dust)
- **Push:** side view, lean 10° (light) or 16° (heavy), both arms forward; heavy adds effort face, sweat drop, slower steps
- **Sit:** hop onto the seat (0.35 s arc), feet dangle and swing; dozes (closed eyes, floating "z") after 5 s
- **Reactions:** Thinking (during prediction), Eureka! (correct prediction: jump, lightbulb, sparkles),
  Oops (missed prediction: squish, dizzy stars; must feel funny, not punishing), Wave hi (reply to a ping)
- All motion should respect `prefers-reduced-motion`.

**Companions, "Physics pals" (Explored, optional):** Spark (electricity), Drip (waves),
Pebble (mechanics), Prism (light). One per region; could be befriended on completion.

## 7. Movement and interactions (Explored)
Values below come from a 1280×720 prototype scene in **screen pixels, with 100 px ≈ 1 m**.
Use them as tuning starting points; the real sim should use SI units.

- **Controls:** tap or click to walk to a point; WASD or arrows; **Run** toggle button or hold
  Shift; **Jump** button or Space; **E** or a contextual button to sit or stand.
- **Walk** 240 px/s, **run** 420 px/s. Tap targets are clamped to the walkable area; cancel a
  target if the bean is stuck for about 0.35 s.
- **Jump:** initial velocity 480 px/s, gravity 1500 px/s² (apex about 77 px, air time about
  0.64 s). Air control allowed. The bean can hop over low objects once more than about 30 px up.
- **Carts on a rail (1D):** masses 5 kg and 20 kg. Push force 4200 px·kg/s² (6300 when running);
  push speed cap 190 px/s (280 running); rolling friction deceleration 26 px/s²; end-bumper
  restitution 0.45; cart–cart restitution 0.5 with momentum conservation. The bean pushes only
  from the side (approaching from above or below is blocked). Show each cart's speed in m/s.
  Teaching goals: force versus mass, inertia (it keeps rolling), momentum transfer.
- **Bench:** a solid obstacle. Tap it to walk over and sit. A seated NPC classmate greets you
  ("Hi!" and a wave). Any movement input stands you up.

## 8. Expeditions and learning
- **Predict → test → compare** before key events; every prediction is logged. (Explored)
- **Measurement tools:** stopwatch, ruler, force meter, speed readouts. (Proposed)
- **Discovery Wall:** class-shared plaques for each law discovered. (Explored)
- **Field notebook:** per student, fills with discovered laws. (Proposed)
- **First expedition, Mechanics Valley projectile launch (Open, needs design):** decide the launcher
  inputs (angle, speed), the prediction interface (mark a landing spot?), what is measured, and
  what counts as success.

## 9. Enemies and bosses (Parked)
- Principle: **beat them with physics, never with combat.** No health bars or attacks.
- Each enemy personifies a common **misconception**; proving it wrong adds the correct law to the Discovery Wall.
- Pests that tease and obstruct: Nudgelings (secret extra forces), Slickers and Stickers (change
  friction), Echo bats (delayed sounds), Static sprites (charge you up), Mirror mimics (wrong
  reflections). Some can steal hats, triggering a chase.
- World bosses (group fights with roles such as Dropper, Timer, Predictor):
  - **The Heavy Baron** (Mechanics): a mossy boulder golem with a top hat and monocle who believes
    heavier things fall faster. Phase 1, the tower drop (prototyped: 10 m drop, t = √(2h/g) ≈ 1.43 s,
    both balls tie); Phase 2, redirect rolling boulders using momentum; Phase 3, projectile onto a switch.
  - Maestro Discord (Waves), the Short-Circuit King (Storm), the Prism Queen (Crystal).
  - Meta villain: **Professor Paradox**, who causes the anomaly zones.
- A "certainty" meter replaces health and drops each time students prove the boss wrong.

## 10. Multiplayer and classroom (Proposed; the hub part built 2026-09-30, D5)
- Class code = room. Hub room holds about 30 players (up to 40). **Built:** the server runs the
  hub sim as the authority for the whole hub (movement, carts, the bench, portals), not only
  movement; clients send commands and draw snapshots. Expedition rooms per group (2–4) run
  authoritative physics (not built).
- Names: students pick a preset name ("Brave Otter"), never type one (D26).
- Communication: preset pings only ("On my way", "Look here", "Need help", "Nice find!").
- Name tags appear on proximity (built: within 3 m); groups shown by scarf color and a ground ring.
- Beans pass through each other (D27, Open); a bench seat and the ridable cart take one bean each.
- Teacher controls: broadcast banner, recall everyone to the hub, freeze, lock or unlock regions,
  assign expeditions, class progress view.
- Region instancing (Open): private per group, fully shared, or private with visible traces of other groups.

## 11. Progress tracking (Proposed)
- Event log entries: prediction made, outcome, error size, attempts, hints used, time, each tagged
  with a **concept id** (for example "horizontal and vertical motion are independent").
- Aggregates into a per-student mastery map (field notebook) and a teacher heatmap per concept.
- Store minimal personal data: nicknames plus class codes. Be mindful of FERPA and COPPA.

## 12. Accessibility and platform (Proposed)
- Runs smoothly on school Chromebooks and phones; tap-first, keyboard supported.
- `prefers-reduced-motion`; color never the only signal; readable contrast on buttons.
