# Status

## Current state

Updated in place by every session's branch (CLAUDE.md, "How we work"). History is in git, the
pull requests, and `docs/archive/`.

**Last updated:** 2026-09-30, the animation viewer (branch `art/anim-viewer`).

**What works** (M1 so far):
- **The hub plaza:** walking and running, jumping, two carts on a rail (push, ride, the hop in
  and out), the bench with Priya, and customization by `?look=` (10 colours, spots, three
  headwear pieces, glasses). Test yards per interaction (`?layout=bench`, `?layout=carts`).
- **Reactions (D26), the model:** `bean.reaction` in the sim (Eureka!, Oops, Wave hi, dizzy),
  the `emote` command (Q, or a tap on your own bean: the bean waves; ignored mid-hop), the
  compatibility table per act, a reaction layer in the rig player with reduced motion, the
  `reactions` gallery scene and the `hub-wave` script. Eureka!, Oops and dizzy have no trigger
  in play until predictions (D9) and the catapult exist.
- **Effect slots:** `fxHead`, `fxBrow`, `fxGround` with anchors in the bean views, effects as
  SVG files in `art/effects/` under their own contract (only the doze "z" so far).
- **Tool scenes:** `bean`, `looks` and `reactions` galleries, the `clip` sheet, the `anim`
  viewer (one clip live, any direction or a ring of 8, a reaction over it, scrub and frame
  steps), the `drop` test, and a dev-only options panel in `pnpm dev` (scene, layout, look,
  paused; the anim viewer's controls, live; `packages/client/src/dev-panel.ts`).
- **Workflow:** short sessions, one at a time, steered by the user (CLAUDE.md, "How we work").
  The user creates branches; a session commits and pushes, with no pull request unless asked.
  GitHub deletes merged branches, and a SessionStart hook (`.claude/hooks/sync-branches.sh`)
  fast-forwards local `main` and deletes merged local branches. CI runs check and verify on
  every push (sessions don't wait for it); golden sim states in `tools/shot/golden/`;
  `art:check`, `art:part`, `art:sheet`, `clip:sheet`; skills for the technical recipes
  (`hub-interaction`, `draw-piece`, `add-clip`); the `reviewer` agent for sim and physics
  changes; the PR template (when asked) and a guard hook.

**Open issues:**
- **New scripts and golden files:** `pnpm verify --update-golden --scripts <new script>` cannot
  write the first golden files: its `pnpm check` fails the golden completeness test until the
  files exist, and `--update-golden` refuses to write after a failed step. The reactions
  session called `writeGolden` directly for the new scripts.
- `pnpm art:sheet --base` cannot compare a change that adds a new art requirement (its "before"
  runs the current code on old art); use a scratch worktree of main for the before images.
- Reactions: the wave reads weakly in the side and back-¾ views (the arm art stays in front of
  the body); no face or effect art yet (the `face` and `effect` groups and the three effect
  slots are ready for it).
- The SessionStart hook is untested in a real cloud container (tested on Windows only).
- A flaky browser close during long runs (seen twice); no retry, note it if it recurs.
- From M1 session 3: the depth tie with Priya, the rim-line strip in mid-hop, the mask filter's
  cost, `Math.hypot` and trig for cross-engine determinism (M2), seat occupancy as layout data,
  no touch buttons, no in-game wardrobe, the other body forms (D7).
- PR #6 (a student's multiplayer hub, D2 and D5) is open and on hold.

**Next:** the first expedition (ROADMAP M1 item 7). D9 is Open: its prepared options are in
`docs/D9-options.md` and get asked at the start of that session. Art that can come any time:
the reaction faces and effects (the lightbulb, sparkles, stars, sweat, dust, a side-view wave).
