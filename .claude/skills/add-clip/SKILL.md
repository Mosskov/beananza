---
name: add-clip
description: Add or change a bean animation clip in Beananza (keyframes as data in packages/client/src/rig/clips.ts, played by the rig player), with its reduced-motion handling, tests and a clip sheet. Use this whenever a session adds a pose or motion (wave, cheer, dizzy, swim, push, a reaction's body part), retimes or tunes an existing clip, or touches the motion/still flags, even if the request just says "make the bean do X".
---

# Add a clip

Clips are data (D3, IMPLEMENTATION.md §3): keyframes per rig slot, sampled by
`packages/client/src/rig/player.ts`. Nothing about a clip is claimed until a frame of it has
been looked at: the clip sheet is how.

## 1. The data (`packages/client/src/rig/clips.ts`)
- [ ] Add the name to `CLIP_NAMES` and the clip to `CLIPS`. A clip is one `Clip` per view family
      (`front` for front and back, `three-quarter`, `side`); `same(clip)` when all three agree.
- [ ] A `Clip` is `{ duration, loop, tracks }`. Each track: `slot` (`body`, `footA`, `footB`,
      `armA`, `armB`, `eyes`, `tail`, `fx`), `channel` (`x`, `y`, `rotation` in degrees
      clockwise, `scaleX`, `scaleY`), `keys` from 0 to 1, and optionally `ease: 'linear'`,
      `period` (own cycle in s), `offset` (share of a cycle).
- [ ] Use the builders already there (`body`, `pair`, `swing`, `flap`, `bob`, `waddle`,
      `lift`, `step`) rather than writing keys by hand; they carry the right defaults.
- [ ] Units: art units (100 = 1 m) and degrees. Prototype numbers come from `docs/DESIGN.md` §6
      and `docs/IMPLEMENTATION.md`; say in a comment where each number comes from.
- [ ] **Reduced motion:** mark body motion (bob, squash, stretch, breathing, waddle, shakes,
      floating effects) `motion: true`. If dropping it would leave a wrong pose (dangling feet,
      a raised arm), give `still: <value>` to hold instead. Poses themselves (a lean, raised
      arms) stay unmarked.
- [ ] If the clip needs parts shown or hidden (the pushing arm, closed eyes), that is the
      presentation table's job (`scenes/presentation/`), not the clip's. Add the same override
      to `CLIP_PARTS` in `scenes/ClipSheetScene.ts` so the sheet shows it.

## 2. Tests (`packages/client/test/player.test.ts`)
- [ ] One `it(…)` for the clip: its timing (duration, period), the value of each important
      track at a named phase (`samplePose({ clip, t, time: 0, view, reducedMotion: false })`),
      that it loops (t = 0 equals t = duration), and its reduced-motion pose (`motion` tracks
      gone, `still` values held).
- [ ] If the clip is picked from sim state, a `chooseClip` case for when it plays.
- [ ] `pnpm test`: the "every clip for every family, well-formed keys" test must pass too.

## 3. Look at it
- [ ] `pnpm clip:sheet <clip>` (8 phases × 8 directions) and open
      `artifacts/clips/<clip>.png`. Check every family: front and back, the ¾ views, the side
      view and its mirror.
- [ ] `pnpm clip:sheet <clip> --reduced-motion`: the motion is gone and nothing is left in an
      odd pose. Read the held values off `artifacts/clips/<clip>-reduced-motion.json`
      (`sceneState.cells[].pose`, per cell with its `direction` and `t`) rather than guessing
      from pixels.
- [ ] If the clip is worn with a cosmetic that moves with it, also `--look <pieces>`.
- [ ] Add a row (or cells) for the clip to the `bean` gallery (`scenes/BeanGalleryScene.ts`) at
      two or three telling phases, so `art:sheet` and verify keep an eye on it.
- [ ] If the clip is reachable in a scene, add or extend a shot script that reaches it, and
      look at that frame too (`pnpm verify --no-check --scripts <script>`).

## 4. Finish
- [ ] Tuning numbers named in `docs/ASSUMPTIONS.md` (constant and file, not copied values).
- [ ] `pnpm verify`; golden states should not change for a clip (clips are drawing only). If
      one does, something reached the sim.
- [ ] `pr-ready`, listing the clip sheets you looked at.
