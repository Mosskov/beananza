# Status

## Current state

Updated in place by every pull request (CLAUDE.md, "How we work"). History is in git, the pull
requests, and `docs/archive/`.

**Last updated:** 2026-09-30, reaction faces and effects for Eureka! and Oops (branch `art/reaction-faces`).

**What works** (M1 so far):
- **The hub plaza:** walking and running, jumping, two carts on a rail (push, ride, the hop in
  and out), the bench with Priya, and customization by `?look=` (10 colours, spots, three
  headwear pieces, glasses). Test yards per interaction (`?layout=bench`, `?layout=carts`).
- **Reactions (D26), the model:** `bean.reaction` in the sim (Eureka!, Oops, Wave hi, dizzy),
  the `emote` command (Q, or a tap on your own bean: the bean waves; ignored mid-hop), the
  compatibility table per act, a reaction layer in the rig player with reduced motion, the
  `reactions` gallery scene and the `hub-wave` script. Eureka!, Oops and dizzy have no trigger
  in play until predictions (D9) and the catapult exist.
- **Reaction faces and effects:** Eureka! (happy eyes, open smile, a popping lightbulb) and Oops
  (squeezed eyes, wavy mouth, a sweat drop), shown by `REACTION_PARTS`
  (`packages/client/src/rig/reaction-parts.ts`) only for the groups the act allows, in the hub,
  the `reactions` gallery and the `anim` viewer; reduced motion holds the effects still.
- **Effect slots:** `fxHead`, `fxBrow`, `fxGround` with anchors in the bean views, effects as
  SVG files in `art/effects/` under their own contract (the doze "z", the lightbulb, the sweat
  drop).
- **Tool scenes:** `bean`, `looks` and `reactions` galleries, the `clip` sheet, the `anim`
  viewer (one clip live, any direction or a ring of 8, a reaction over it, scrub and frame
  steps), the `drop` test, and a dev-only options panel in `pnpm dev` (scene, layout, look,
  paused; the anim viewer's controls, live; `packages/client/src/dev-panel.ts`).
- **Workflow:** short sessions, one at a time, steered by the user (CLAUDE.md, "How we work").
  CI runs check and verify on every pull request and push to main (sessions don't wait for it); golden sim states in `tools/shot/golden/`;
  `art:check`, `art:part`, `art:sheet`, `clip:sheet`; skills for the technical recipes
  (`hub-interaction`, `draw-piece`, `add-clip`); the `reviewer` agent for sim and physics
  changes; the PR template and a guard hook.

**Open issues:**
- **New scripts and golden files:** `pnpm verify --update-golden --scripts <new script>` cannot
  write the first golden files: its `pnpm check` fails the golden completeness test until the
  files exist, and `--update-golden` refuses to write after a failed step. The reactions
  session called `writeGolden` directly for the new scripts.
- `pnpm art:sheet --base` cannot compare a change that adds a new art requirement (its "before"
  runs the current code on old art); use a scratch worktree of main for the before images.
- Reactions: the wave reads weakly in the side and back-¾ views (the arm art stays in front of
  the body). Not drawn yet: dizzy's stars, sparkles, dust, Thinking, the heavy-push effort face.
  The lightbulb sits on tall headwear (with the sprout it reads as the sprout's flower): lifting
  head effects above the headwear would be a new rule.
- The SessionStart hook is untested in a real cloud container (tested on Windows only).
- A flaky browser close during long runs (seen twice); no retry, note it if it recurs.
- From M1 session 3: the depth tie with Priya, the rim-line strip in mid-hop, the mask filter's
  cost, `Math.hypot` and trig for cross-engine determinism (M2), seat occupancy as layout data,
  no touch buttons, no in-game wardrobe, the other body forms (D7).
- PR #6 (a student's multiplayer hub, D2 and D5) is open and on hold.

**Next:** more reaction art: dizzy's stars (also for Oops, as in the prototype), sparkles for
Eureka! (placed by a hash of the start tick, D26), dust; then Thinking and the heavy-push effort
face and sweat. The first expedition moved later and will not be the projectile launch: D9 is
Open with its topic open (the old questions are in `docs/archive/D9-options-projectile.md`).
