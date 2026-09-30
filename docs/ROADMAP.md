# Roadmap (proposed)

Each milestone should land as several small, runnable slices. Nothing here is approved.

## Milestone 0: scaffold
- **Progress:** done
- pnpm workspace with `shared`, `sim`, `client` (server comes later)
- Phaser and Vite dev server; Vitest running in `sim`
- A fixed-timestep loop in `sim`, driven by the client
- **Done when:** the dev server shows an empty scene and `sim` has a passing test

## Milestone 1: single-player vertical slice (local only)
- **Progress:** in progress
1. **Hub plaza** in the ¾ view with a walkable area and depth scaling and sorting
2. **One bean** built as a parts rig with the five views plus mirroring and the 8-direction mapping
3. **Movement:** tap-to-move plus keyboard, walk, run, jump (tuning values in DESIGN.md §7)
4. **Animations:** idle, walk, run, jump, land; reduced-motion fallback
5. **Customization basics:** color, one pattern, three headwear pieces, one face variant
6. **Interactables:** cart on a rail (push, inertia, collisions between two carts) and a bench (sit)
7. **One expedition prototype** (after D9 is designed; the topic is open, not the projectile
   launch): predict → test → compare, result saved to a local notebook
- **Done when:** a student can walk the plaza, push the carts, sit on the bench, enter the
  expedition, make a prediction and see it logged. Sim behavior is covered by tests.

## Milestone 2: multiplayer hub
- **Progress:** planned
- Colyseus hub room keyed by class code; other players visible with name tags
- Preset pings and emotes; group formation with group scarf colors
- Authoritative sim on the server for expedition rooms

## Milestone 3: progress and persistence
- **Progress:** planned
- Event log with concept ids, per-student notebook, simple teacher view
- Choose hosting and database (D11)

## Milestone 4: teacher tools
- **Progress:** planned
- Broadcast, recall, freeze, lock regions, assign expeditions, class heatmap
