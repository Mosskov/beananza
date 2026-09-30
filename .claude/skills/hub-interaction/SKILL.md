---
name: hub-interaction
description: Add or change a hub interaction in Beananza (something the bean does with a prop or place in the hub: carts, the bench, a catapult, a sign, a door, a seesaw) as a sim module with tests, a presentation row, a test yard and shot scripts. Use this whenever a session adds a new act kind, a new usable prop, new E/tap behaviour in the hub, or changes how an existing interaction behaves, even if the request only says "let the bean sit on / ride / use X".
---

# Add a hub interaction

The sim is the rulebook (D21): one state per bean (`bean.act`), one module per interaction,
tick-timed transitions, the client only draws. Build it in its own test yard so the plaza and
its golden states stay untouched until the finished thing moves in (D2).

## 1. Settle the rules first
- [ ] Read `docs/DECISIONS.md` for the interaction. If a behaviour or number it needs is Open,
      stop and ask the user (options plus one recommendation); don't pick numbers silently.
- [ ] Read an existing module end to end: `packages/sim/src/interactions/bench.ts` (walk over,
      hop, sit) or `cart.ts`, and `interactions/types.ts` (`HubInteraction`: `command`,
      `drive`, `place`, `facing`, `settle`).

## 2. Sim first, with tests (`packages/sim`)
- [ ] Create `packages/sim/src/interactions/<name>.ts`: its act type `<Name>Act` (plain JSON,
      tagged by `kind`), its rules per act kind (`walks`, `usesPlanck`) as `<NAME>_ACTS`, and
      its `HubInteraction` module. Timers are whole ticks fixed when a transition starts; hop
      positions are a pure function of the tick (`hop.ts`). SI units, 60 Hz, no randomness
      outside the seeded RNG.
- [ ] Add the act type to `HubAct` in `packages/sim/src/scenarios/hub-world.ts`, and the module
      and its rules to `INTERACTIONS` and `ACT_RULES` in `interactions/index.ts`. One line each;
      don't reorder or rewrite these shared lists.
- [ ] Write `packages/sim/test/hub-<name>.test.ts` **before** the client work: each transition
      step by step in ticks, input ignored where it must be, out-of-reach cases, a mid-hop
      snapshot restored into a fresh scenario, and 10,000-step determinism with scripted input.
- [ ] `pnpm test` and `pnpm typecheck` green. The boundary test (`boundary.test.ts`) must keep
      passing: no DOM, Phaser, `Date`, `Math.random` or look data in the sim.

## 3. Its own test yard and scripts
- [ ] Add one line to `HUB_LAYOUTS` in `packages/sim/src/scenarios/hub-layouts.ts`:
      `<name>: yard({ … })`, with the plaza's ground, start and camera and only this thing.
      `yard()` takes `props`, `benches`, `rail` and `start`. A usable prop needs nothing more.
      If the interaction needs new layout data, that is a new `PlazaLayout` field in
      `hub-world.ts` (a shared file: add the field only, optional so the plaza is unchanged),
      plus the key in `yard()`'s `Pick<…>` and its default in the object `yard()` returns. If
      the plaza's logged layout gains the field, every plaza golden file changes: update
      golden in its own commit and say why in its message.
- [ ] A prop it uses names its drawing (`art`) in the layout; `usable: true` sends taps on it as
      `use`. New art follows the `draw-piece` skill.
- [ ] Write scripts `tools/shot/scripts/hub-<name>*.json` with `"layout": "<name>"`, covering
      every act kind with a `shot` step at each state worth looking at.
- [ ] Do not change the plaza (`DEFAULT_PLAZA`) or its scripts. Moving the finished thing into
      the plaza is its own later step, with its own golden diff.

## 4. Presentation (`packages/client`)
- [ ] Add a row per new act kind in `packages/client/src/scenes/presentation/<name>.ts` (clip,
      part overrides, placement, shadow, stand-off, flat hop height for reduced motion), and
      spread it into `hub-presentation.ts` (one line). The compiler lists any act kind missing.
- [ ] Add rows to `hub-presentation.test.ts` for each new kind.
- [ ] A new clip follows the `add-clip` skill.
- [ ] Draw from sim state only; no timers or state in the client that another player would need
      to see (D26's rule).

## 5. Verify
- [ ] Between steps: `pnpm verify --no-check --scripts hub-<name>,hub-<name>-…` and look at the
      frames: `pnpm shot:sheet artifacts/shots/hub-<name>`.
- [ ] Check the logs agree with the images (`sceneState.state.bean.act`, positions, the `view`
      block's draw depth) for every shot.
- [ ] New scripts have no golden files yet: once the states are right, run
      `pnpm verify --update-golden --scripts <the new scripts>` and read the new files.
- [ ] At the end: the full `pnpm verify`. The plaza's golden states must show **no diff**; if one
      does, the interaction leaked into the plaza. Fix that rather than updating golden.
- [ ] Put routine choices in the commit message; describe the yard, scripts and tests in
      `README.md` (tests list, scripts). Finish as CLAUDE.md "How we work" says.
