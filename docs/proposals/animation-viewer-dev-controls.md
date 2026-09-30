# An animation viewer and clearer dev controls

> **STATUS: APPROVED AS AMENDED (2026-09-30), built on `art/anim-viewer`.** A dev tool: no sim
> change, no decision in `docs/DECISIONS.md` touched. Art lane (galleries and the clip sheet).

## Context
Only the hub animated, and only when the sim triggered a clip (the doze needs about 5 s on the
bench). Every other tool scene (`bean`, `clip`, `looks`, `reactions`) draws still frames once.
The dev panel reloaded the page on every change and had no clip, direction, speed, scrub or
reduced-motion control. Goal: see every clip and reaction in motion, from any direction, with
controls that explain themselves.

## Settled with the user
- **Live controls in the dev panel, plus keys.** Scene, layout and look still reload (the boot
  reads them once); the anim part (clip, reaction, direction, ring, speed, loop, reduced motion,
  a time slider, play/pause and one-frame steps) changes the running scene. The address follows
  with `history.replaceState`, with `t` while paused, so a link reproduces the frame.
- **One large bean, with a toggle for a ring of all 8** on the same clock.
- **The reaction layer follows the game's rules:** the act that plays the clip in the hub
  (idle: free and still; walk, run, jump, fall: free and moving; push: pushing; sit, doze and
  Priya's wave: sitting) picks the groups from `REACTION_RULES`, as `allowedGroups` does.

## Changed from the first draft
- Keys: Space play/pause, ← → direction, `,` `.` one frame (1/60 s), `[` `]` clip, 1–4 speed,
  R reduced motion, G ring.
- No "anim link" hints on `bean`, `clip` and `reactions`: they would change those shots; the
  panel's line per scene says what each is.
- One clock, as the hub's animation time: looping clips and blinking read it directly (tracks
  with their own period, such as the doze's 4 s breathing, never jump); one-shot clips and
  reactions play from the start of each pass and hold their end for 0.5 s before playing again.
- `rm=1` / `rm=0` overrides prefers-reduced-motion in this scene only.

## Where
`packages/client/src/scenes/AnimViewerScene.ts`, `scenes/anim-params.ts` (parsing, the address,
the groups, the pass length; tested in `test/anim-params.test.ts`), `rig/clip-parts.ts` (shared
with the clip sheet), `dev-panel.ts`.

## Not done (say if you want it)
- GIF or video export from `tools/shot`. A follow-up could shoot `anim` at several `t` and tile
  them with `pnpm shot:sheet`.
- A `pnpm shot` option for a scene's own URL options (today `--url` with the options in the
  query does it, against a running dev server).
- Triggering hub reactions by key (Eureka!, Oops and dizzy have no key in the hub; only Q waves).
