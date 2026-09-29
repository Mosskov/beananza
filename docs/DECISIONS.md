# Decisions

Only change a status after the user confirms. Newest changes at the top of each entry's notes.

| ID | Topic | Options | Current leaning | Status |
|---|---|---|---|---|
| D1 | Hub camera | ¾ top-down, isometric | ¾ top-down (proven in prototype, simpler depth sorting) | **Confirmed** 2026-09-29 (M1 session 1): ¾ top-down |
| D2 | Hub layout | Town square, floating islands | Prototype a single small plaza first; decide later | Open |
| D3 | Bean rendering | Parts-based rig, pre-rendered sprite sheets | Parts-based rig (combinatorial customization). The prototype strongly supports this: goggles on and off, a bandage, swimming and a back float all came cheap from one set of parts | Open |
| D4 | Physics setup | Planck.js for hub (top-down) and expeditions (side view) as separate worlds | Planck.js, separate worlds, SI units. Use exact integrators for the scenarios students predict (projectiles, the U-Track, energy) and Planck.js only for general collisions | **Partly confirmed** 2026-09-29: Planck.js for hub collisions (top-down world, SI units), from M1 session 1. Expedition physics and the exact-integrator rule stay Open |
| D5 | Multiplayer timing | From day one, after single-player slice | Single-player slice first, sim kept separable for Colyseus | Open |
| D6 | Tech stack | TS + Phaser + Vite + Planck + Colyseus + Postgres + Vitest | As listed | **Partly confirmed** 2026-09-29: TypeScript + Phaser + Vite + Vitest, and Planck.js (see D4). Colyseus and Postgres stay Open |
| D7 | Body forms offered | Bean, Mochi, Gumdrop, Pill (all cosmetic) | Offer all four; same collider | Open |
| D8 | Region instancing | Private per group, shared, private with traces | Private with visible traces | Open |
| D9 | First expedition | Projectile launch in Mechanics Valley | Needs a design pass before building | Open |
| D10 | Enemies and bosses | Misconception-themed, non-violent | Parked until the core loop works | Parked |
| D11 | Hosting and database | TBD | Decide at Milestone 3 | Open |
| D12 | Rotation approach | Drawn views only, "paper 3D" props, pre-rendered 3D, live 3D | Drawn 8-direction characters; most props never rotate; "paper 3D" for the few props that must turn in the hub; precise aiming in a side view. See `docs/IMPLEMENTATION.md` section 4 | Open |
| D13 | Art source and pipeline | Ad hoc SVGs, or a vector tool with an art contract and an automated build | Vector tool (Figma suggested) + art contract + validate/generate/gallery build. Blocked on choosing the drawing tool. See `docs/ART_PIPELINE.md` | Open |
| D14 | Engine | Web with TypeScript + Phaser, Godot (web export), Unreal | Stay on the web with TypeScript + Phaser; Godot if a visual editor is needed; Unreal not recommended (no official web export, Pixel Streaming cost and latency, 3D-first). Refines D6. See `docs/IMPLEMENTATION.md` section 5 | **Confirmed** 2026-09-29: web, TypeScript + Phaser |
| D15 | Hub sim coordinates | Ground plane x/y plus height z; or x, height y, depth z | Ground plane | **Confirmed** 2026-09-29: x east and y north on the ground plane, in metres, plus height z (up, gravity along −z). North draws up the screen. The ¾ projection, depth scale and draw order live only in the client |
| D16 | Hub jump gravity | Stylized (15 m/s², prototype), realistic with the same apex, realistic with the same air time | Realistic, same apex | **Confirmed** 2026-09-29: g = 9.81 m/s², apex 0.768 m (v₀ = √(2·g·0.768) ≈ 3.882 m/s, air time ≈ 0.791 s), air control on |
| D17 | Text in game scenes | No text at all; measurement readouts as an exception | Readouts as an exception | **Confirmed** 2026-09-29: measurement readouts (timers, measured values with units, ruler and scale labels) are allowed as instruments. No instructional text and no labels on interactables. Controls hints stay allowed |

## Prototype feedback from the user (current direction, not product decisions)

These were direct requests while prototyping. Treat them as strong preferences, and confirm
before hard-coding anything that conflicts with an Open decision. Details in
`docs/IMPLEMENTATION.md` section 7.

- No text inside game scenes; players discover what is clickable. Exception: Priya's "Hi!" bubble.
  Measurement readouts are also allowed (D17).
- Hints are only the controls: Move (arrows or WASD), Run (Shift), Jump (Space), Action (E).
- E is a context action on whatever is nearby. Space jumps, and leaves a cart or the catapult,
  or flips to a back float in water.
- Catapult: only Priya can launch it (no self-release). The bean puts goggles on when loaded and
  takes them off after landing. Flying out of the arena brings the bean back walking in with a
  bandage for a while.
- A prediction flag for the catapult was deferred ("not for now").
