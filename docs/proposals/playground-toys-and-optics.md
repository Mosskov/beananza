# Plan: playground toys, and an optics system for a laser expedition

> **STATUS: NOT YET APPROVED. For review by another agent in a separate session.**
> Nothing here is decided. Every rule, number and approach is a proposal; nothing in
> `docs/DECISIONS.md` has changed. The reviewer should challenge the design, the feasibility
> claims (none were verified by building or by reading the code in depth: they come from the
> docs and the architecture rules in CLAUDE.md) and the order of work. Unchecked points: the
> ¾ projection's effect on visual angles (client code not read), Planck's behaviour with a
> dynamic body pushed by the bean's body, and draw order for large rotating footprints.

## Context
You asked whether the pipeline is ready for more assets. Static art is ready (draw-piece, art
contract, `art:check`/`art:sheet`, prop loader). Interactive props also need behaviour (sim
module, presentation row, test yard: `hub-interaction` skill), and any Open rule needs a design
pass first. You chose two tracks:
- **Track A, playground toys:** seesaw and swing (DESIGN.md §2), a small test batch of
  interactive props, not tied to D9 or D2.
- **Track B, refraction prism (laser expedition piece):** a giant rectangular glass prism with a
  refractive index; pushed in any direction; rotates freely, for Snell's-law experiments.
  Feasible in the current architecture (top-down sim, exact rays), with the risks below.

## Track B decisions you made
- **Rotation:** both must work: (1) two beans push as a couple (second bean = Priya/NPC in
  single-player, a real player in multiplayer); (2) one bean pushes a corner against a fixed
  post that acts as the pivot.
- **Camera:** per-room option to toggle between the ¾ view and a straight-down view. True angles
  show only in the straight-down view; the ¾ view needs a protractor readout (D17 allows it).

## Track B scope (confirmed in discussion)
Optics only, about 10 element types sharing one system. Gears, levers and turntables are a later,
separate rigid-prop layer. Dispersion (colour) is later; the first slice is single-colour Snell,
total internal reflection and lenses.

## Track B design (proposals, to confirm in a design pass)
- **Scale change (you want ~10 types):** Track B is a *system plus a catalogue*, not one prop.
  An optical element = pose + shape + material, as data in `packages/shared`. Adding a type is a
  data row, not new code or a new drawing. Build the system with two types first (rectangular
  slab, equilateral triangle) to prove it is general, then add the rest as data-only PRs.
- **Ray tracer on edges, not "polygons":** each edge knows the medium on both sides (n), so one
  algorithm covers slabs, prisms, mirrors, beam splitters, water tanks and non-convex pieces.
  Curved surfaces (lenses, half-cylinder) need arc edges as first-class (polygon approximations
  give wrong focal behaviour). Dispersion (colour) means several rays per colour: a scope call.
- **Bodies:** Planck convex polygons and circles (vertex cap 8; concave = compound fixtures), mass
  from density x area. One generic pushable/rotating-body module parametrised by mass and inertia,
  not an interaction per type. Non-optical rotating objects (gears, levers, turntables) stay a
  separate rigid-prop layer; don't fold them into optics.
- **Rays:** a pure `sim` function (exact, deterministic): laser pose, element poses and
  materials in; beam segments out. Snell refraction, total internal reflection, critical angle,
  walls and targets; a bounce cap. Unit-tested against textbook values. No Planck.
- **Prism body:** the first dynamic prop (carts are kinematic). Force-limited push like D19,
  mass, floor friction as linear and angular damping, pivot post as a fixed Planck body.
- **Art:** generated from the catalogue row (footprint or arc path, material tint, highlights),
  not one SVG per type; "draw once, generate the rest". A contract check on the shape spec and
  material palette replaces per-file checks. Touches D12 (paper 3D, Open): the exception now
  covers a whole class of props, so it needs a real decision. Generic split draw layers.
- **Tests and shots:** parametrised over the catalogue (Snell per material, conservation,
  determinism); one test yard `?layout=optics&piece=<id>` and parametrised shot scripts, so
  golden files and review size do not grow per type.
- **Camera toggle:** client-only, a per-layout option; the sim stays in x/y metres (D15).

## Steps
1. **Design pass (one message, before any build):** `design-pass` skill. Track A: seesaw and
   swing rules (tip angle, reach, pendulum length, damping, hop in and out like D23). Track B:
   the two rotation mechanisms, prism mass and push force, n value(s), pivot post rules,
   camera toggle scope, and the small D12 "extruded polygon" exception. Record only what you
   confirm in `docs/DECISIONS.md`.
2. **Track B slice 1 (no open dependencies):** the ray module with tests and a debug prism
   angle in a test yard (`?layout=prism`), beam drawn, `art:sheet`/shot evidence.
3. **Track A art (art lane):** `draw-piece` for `seesaw.svg` and `swing.svg` (shadow, fixed and
   moving parts with `data-pivot`, seat anchors as in `bench.svg`). Register in
   `packages/client/src/art/prop-sources.ts` and `prop-contract.ts`.
4. **Behaviour lane, one interaction per PR:** seesaw, swing, then prism push, then the two
   rotation mechanisms, each through `hub-interaction` with its own test yard, tests first,
   presentation row, shot scripts and golden.
5. **Sequence:** at most two lanes (one art, one behaviour); each its own branch and PR; CI
   green; `reviewer` agent; you merge.

## Reuse
- `packages/sim/src/interactions/bench.ts` and `hop.ts` (template for seat interactions).
- `cart.ts` push model and D19 numbers; `art/props/cart.svg` (`data-pivot`, split layers).
- `HUB_LAYOUTS` `yard()`, optional `PlazaLayout` fields; `pr-ready` skill.

## Verification
- `pnpm check`, `pnpm art:check`, `pnpm art:part <file>`, `pnpm verify` (golden diff explained).
- Ray tests: Snell angles, critical angle, total internal reflection, 10,000-step determinism.
- Look at each test-yard screenshot and log before claiming it works.

## Open items
Seesaw/swing numbers; whether the pair is right; Track B numbers; D5 (second bean), D12
exception, and cross-engine trig determinism for M2.
