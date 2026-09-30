# Reactions, first build session (the model, no reaction art)

How to use: open Claude Code in this repo and paste everything below the line. It builds the
reaction model confirmed as D26 in the reactions design pass of 2026-09-30. It draws no
reaction art and picks no look for any reaction: an art lane draws the faces and effects
later, against the slots this session builds. It assumes the tools prep session
(`prompts/tools-prep-session.md`) has run.

---

# Goal
Build the reaction model (D26) as three slices, in this order. Each is its own commit series
and ends with `pnpm check` green:
1. the sim: the `reaction` field, the `emote` command, the timers, the compatibility table,
   tests and the boundary test;
2. the rig player: a reaction layer over the act's clip, reduced motion, and `clip:sheet`
   evidence;
3. effect slots as a mechanism, with the existing doze "z" moved onto one as the proof.

Wave hi is the only reaction with a real trigger today, so it runs end to end: Q, or a tap on
your own bean, makes the bean wave in the hub. Eureka!, Oops and dizzy are built and tested
through the sim's internal `startReaction`. Nothing triggers them in play until predictions
(D9) and the catapult exist. If the session runs long, finish and review what is done, write
up where the next slice got to, and stop. Don't leave two slices half done.

Read first:
- `CLAUDE.md`
- `docs/DECISIONS.md`: D26 (this session's scope; its notes are the spec), D21 and its D26
  note, D17, D22, D23, D24
- `docs/DESIGN.md` section 6, "Reactions" and "The model"
- `packages/sim/src/scenarios/hub-world.ts` (`HubBean`, `HubCommand`), `hub.ts`,
  `interactions/types.ts`, `interactions/bench.ts`, `interactions/hop.ts` (`ticksFor`)
- `packages/client/src/rig/player.ts`, `clips.ts`, `views.ts` (`SLOTS`, `SLOT_PARTS`, the one
  `fx` slot), `BeanRig.ts`
- `packages/client/src/scenes/hub-presentation.ts`, `presentation/`, `classmates.ts`
- `reference/showcase.html`, the "Reactions" strip, for behaviour and timings only (never
  port its code): `eureka` 1.8 s (jump about 46 units with squash), `youshake` three 0.5 s
  shakes (±8°), `wave` 1.8 s (two flaps of −28° in the first 60 %), `zfloat` 2 s

Nothing in docs/ is approved unless DECISIONS.md says so. Nothing here locks an Open decision
(D5, D8 and D9 stay Open; Thinking waits for D9's prediction state).

# Step 0: set up and check the baseline (before changing anything)
- **Skill `session-start`:** branch `feat/reactions`, worktree `C:/bz-react`, and the baseline
  (`pnpm verify` green against `tools/shot/golden/`, zero console errors, `hub.png` looked at).
  A failing baseline is fixed first, in its own commit.

# Slice 1: the sim
1. **`packages/sim/src/reactions.ts`:**
   - `ReactionKind = 'eureka' | 'oops' | 'waveHi' | 'dizzy'`, and `HubReaction = { kind; since }`
     with `since` a tick.
   - `EUREKA_S = 1.8`, `OOPS_S = 1.5`, `WAVE_HI_S = 1.8`, `DIZZY_S = 1.6`, and
     `REACTION_TICKS: Record<ReactionKind, number>` from them with `ticksFor`.
   - `startReaction(state, kind)` applies the replace rule: a new reaction replaces a running
     one, except that `waveHi` is dropped while `eureka` or `oops` runs. Everything goes
     through it; tests and, later, the prediction and catapult code call it.
   - `reactionEnd(r)` returns `r.since + REACTION_TICKS[r.kind]`. The hub clears the reaction
     on the step where the tick reaches its end.
   - No randomness, only whole ticks and exact operations (STATUS open issue 5).
2. **`HubBean.reaction: HubReaction | null`,** beside `act`, starting as null. Acts never read
   it (D21 note). The hub updates it at one fixed point in the step, after the interaction
   modules, so that an act starting mid-reaction leaves its timer alone.
3. **The `emote` command:** `{ type: 'emote'; kind: 'waveHi' }` in `HubCommand`. It is
   ignored in the hop acts (`boarding`, `seating`, `standing`, `leaving`, as other input is,
   D23) and accepted in every other act. It never changes the act, the position or the
   velocity.
4. **The compatibility table** in `reactions.ts`, typed by `HubActKind` so that a new act kind
   without a row does not compile. For each act kind and reaction kind it says which track
   groups may play: `face`, `effect`, `arms`, `body`.
   - `body` plays only in `free`, and only while the bean is standing still on the ground.
     That check is a pure function of the bean the client also calls, not a stored flag.
   - `arms` for `waveHi` is off in `pushing` and in the hop acts.
   - `face` and `effect` are on everywhere.
   - The table is data the client reads. The sim uses it only to reject `emote` mid-hop.
5. **Tests** (Vitest, `packages/sim/test/reactions.test.ts`):
   - each duration in ticks;
   - the reaction clears exactly at its end tick;
   - the replace rule, including the exception;
   - `emote` ignored mid-hop and accepted while riding and sitting;
   - a reaction never changes movement: replay one input script with and without an
     `emote`, and the bean's position, velocity and act agree at every tick;
   - getting into a cart mid-Eureka keeps the reaction's `since`;
   - the table has a row for every act kind;
   - the state stays plain JSON.
6. **Boundary test:** `packages/sim` names no clip, slot, part or art id for reactions, and
   imports nothing from the client (extend the existing boundary test).
7. **Golden states:** the new field changes every golden file (`reaction: null`). Update them
   with `pnpm verify --update-golden` in a commit of its own, and say in the PR that this is
   the only change in them.

# Slice 2: the rig player
Use the `add-clip` skill for every clip.
1. **Track groups:** `Track` gains `group?: 'face' | 'effect' | 'arms' | 'body'`. Only
   reaction clips set it.
2. **Reaction clips** in `clips.ts`, ported from the prototype timings above:
   - `eureka`: the jump and squash (`body`);
   - `oops`: three shakes (`body`) and a squish at the end (`body`, with a `still`);
   - `waveHi`: the screen-right arm, two flaps (`arms`); a seated and a riding variant if the
     arm needs a different rest angle there (see the `wave` clip Priya uses);
   - `dizzy`: no body tracks yet.
   There are no face or effect tracks for undrawn parts. Those come with the art lane, on the
   slots from slice 3.
3. **Layering:** `samplePose` takes an optional reaction `{ kind, t, groups }`. It applies the
   act's clip and the blink, then the reaction clip, whose tracks replace only the channels
   they name and only when their group is allowed. `chooseClip` stays as it is. A new
   `chooseReaction(state, time)` in the client reads `bean.reaction`, the compatibility table
   and the "standing still" function. It returns null when there is no reaction.
4. **Reduced motion:** the existing `motion` and `still` rules apply to reaction tracks. The
   Eureka jump and the Oops shake are `motion` and go; the squash holds at its `still` value;
   the wave keeps a raised arm (`still`, as Priya's wave does). Add `player.test.ts` cases for
   each.
5. **Input:** Q sends `emote`, and a tap or click on your own bean sends `emote` instead of a
   `moveTo`. Add "Wave (Q)" to the controls hint (D17 allows controls hints). No other text.
6. **A `reactions` gallery scene** (register it in `registry.ts`): every reaction kind in
   each act the table allows (free standing, free walking, pushing, riding, sitting). It is
   built from constructed sim states, like `looks`, with `&paused=1` support.
7. **Evidence:**
   - `pnpm clip:sheet eureka|oops|waveHi` in all views, and again with `--reduced-motion`;
   - a hub shot script `hub-wave` (walk, press Q mid-walk, stop, press Q again, get into the
     cart, press Q) with frames at each press;
   - a `reactions` scene shot.
   Look at every frame and sheet before claiming anything.

# Slice 3: effect slots, with the "z" as the proof
1. **Slots:** replace the single `fx` slot with `fxHead`, `fxBrow` and `fxGround`. Each is
   placed at a D22 anchor per view (`anchor-fx-head`, `anchor-fx-brow`, `anchor-fx-ground`) in
   the bean view SVGs. Put each anchor where the prototype draws that effect: the "z"'s current
   spot for the head, the sweat drop's for the brow, between the feet for the ground. This is an
   art change to anchors only, shown with `pnpm art:sheet`, which must show no pixel
   difference.
2. **`art/effects/`:** effects are their own SVG files under the art contract (part ids, 100
   units = 1 m, origin at the effect's anchor, key colours where they apply), loaded by part
   id. Add the contract checks to `art:check` and its tests, and a line in `art/README.md`.
   No particles.
3. **The proof:** move the doze "z" out of the five bean view SVGs into
   `art/effects/doze-z.svg`, on `fxHead`, with the `doze` clip's `fx` tracks moved to it
   unchanged.
   - The `dozing` frames of the existing bench scripts must look the same: compare them with
     `pnpm shot:sheet` before and after.
   - `art:sheet` shows the "z" gone from the bean views and present in `art/effects/`.
   - `PART_DEFAULTS` and `HIDDEN_BY_DEFAULT` follow the move.
4. **Placement rule for later effects:** `effectSeed(since, index)` in the client is a small
   integer hash of the reaction's start tick and the particle's index, never of the current
   tick or `Math.random`. Add a test that it is stable across frames and the same for the
   same state. No effect uses it yet.
5. **Derived effects stay derived:** effort face, sweat, dust and Thinking get no sim field.
   Leave a comment where each will read its state (the `pushing` row and `HEAVY_PUSH_KG`;
   `lastJump.landedAt`; the pending prediction, once D9 exists). Their art is not this
   session's.

# How to work
- **Skills:** use `hub-interaction` for the sim slice and the shot script, `add-clip` for
  every clip, and `pr-ready` to finish. **If any of these skills does not exist yet, stop and
  tell me:** the tools prep session has not run, and this prompt assumes it has.
- Small steps. Each ends with `pnpm check` green and a commit with a clear message. Between
  steps, `pnpm verify --no-check --scripts <names>`; at the end, the full `pnpm verify`.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under a
  "Reactions, first session" heading.
- Anything that would lock an Open decision, or change a D26 rule: stop and ask.
- Choose no reaction art: no faces, lightbulb, sparkles, stars, sweat or dust drawings. The
  only art change is the anchors and the moved "z".
- Never claim a result you haven't looked at. Report failures as failures.
- Windows: keep clone and worktree paths short. In the Bash tool, use the Write and Edit tools
  for code with backslashes.
- Commit your own files by path, on your branch. Ask me before merging into main.
- **Never run `pnpm share:deploy` or `pnpm share:password`.**

# Review gate
Push the branch, confirm CI is green on it, open the pull request with the template, and run
the reviewer agent on it. It checks:
- the replay test (a reaction never changes movement) and the boundary test pass, and the
  golden diff is `reaction: null` only;
- the `hub-wave` frames show the wave while standing, the arm only (no body part) while
  walking, and the wave in the cart; Q during a hop does nothing;
- the `clip:sheet` strips read right in all views, and the reduced-motion strips hold the
  squash and the raised arm at their `still` values with no jump or shake;
- the doze frames are unchanged after the "z" moved, and `art:sheet` shows no other pixel
  change;
- the compatibility table has a row for every act kind, and removing one fails to compile;
- nothing in the sim samples randomness or reads the reaction from an act.

Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Follow `pr-ready`: update the "Current state" section of `docs/STATUS.md`, note what the art
lane can now draw against (the three effect slots, the `face` and `effect` groups), and fill
in the PR description. Then stop, leaving the branch and the PR for me to merge.
