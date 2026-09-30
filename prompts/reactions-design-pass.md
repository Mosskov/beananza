# Reactions design pass (the reaction model)

How to use: open Claude Code in this repo and paste everything below the line. It is a
discussion, not a build session: nothing gets built, and no art or clip is chosen. When it
ends, the reaction model is recorded as a decision, and the first reactions build session can
run through without waiting for answers. It does not depend on the tools prep session
(`prompts/tools-prep-session.md`), but the build prompt it writes assumes that session has run.

---

# Goal
Settle how reactions work (Thinking, Eureka!, Oops, Wave hi, the effort face and sweat, dizzy
stars, the bandage, and the effects they need), with me, and record it. Which reactions get
drawn first, and what they look like, is not part of this pass. Do not write code or art.

Read first:
- `CLAUDE.md`
- `docs/DECISIONS.md`: D3 (clips as data), D17 (no text; readouts and the "Hi!" bubble are the
  exceptions), D21 (one `act` per bean, one module per interaction, timers in ticks, the
  client's one table per state), D24 (Priya's greeting), D5 and D8 (multiplayer, Open)
- `docs/DESIGN.md`: section 6 ("Animation states", above all "Reactions"), section 8 (predict,
  test, compare: where Thinking, Eureka! and Oops come from), section 10 (pings and emotes in
  M2)
- `docs/IMPLEMENTATION.md`: section 3, section 6 (the catapult's dizzy stars, bandage and
  goggles timings), section 7
- `docs/STATUS.md`: the "M1, session 3" open issues 5 (cross-engine determinism), 6 (occupancy
  is layout data, not state; the same question comes up for reactions) and 12 (no effort face,
  sweat or dust yet)
- `packages/sim/src/scenarios/hub-world.ts`: `HubBean`, `HubAct`, `HubCommand`
- `packages/sim/src/interactions/types.ts` and `bench.ts`: how an interaction owns its
  commands, timers and transitions
- `packages/client/src/rig/player.ts`: `chooseClip` picks exactly one clip; there is no
  layering today
- `packages/client/src/rig/clips.ts`: the clip format, `motion` and `still`
- `packages/client/src/scenes/hub-presentation.ts` and `presentation/`: one row per act kind
- `packages/client/src/scenes/classmates.ts`: Priya's wave is worked out from `sitting.since`,
  not stored; every client that draws the same state draws the same greeting
- `reference/showcase.html`, the "Reactions" strip and the catapult, for behaviour and
  timings only (Eureka 1.8 s with a jump, lightbulb and sparkles; Oops three 0.5 s shakes
  with dizzy stars; Hop 1.1 s; Wave hi one wave; sweat 1.1 s loop; dizzy 1.6 s after a hard
  landing; the bandage for a few seconds)

Nothing in docs/ is approved unless DECISIONS.md says so.

# The questions
Ask them in one message. For each, give:
- the options;
- your recommendation, with numbers where there are numbers, and the constant names it
  would introduce;
- what the choice changes, above all for M2 (a server running the same sim, other players
  seeing the reaction) and for determinism.

1. **Where a reaction lives.** Three options, and they can be mixed by a rule:
   - a sim field next to `act`, say `bean.reaction: { kind, since }`, tick-timed like an act,
     set by commands and by sim events, and cleared by the sim when its time is up;
   - derived in presentation from state the sim already logs, as Priya's greeting is
     (for example the effort face from `act.kind === 'pushing'` and the cart's mass, or dizzy
     stars from the last landing's speed if the sim logs it);
   - client-only, with the client deciding when a reaction starts.
   Recommend a rule, not a single option: a reaction is sim state exactly when it cannot be
   derived from state the sim already has, or when another player or the server must see it
   start (prediction outcomes, emotes). Everything else is derived, and nothing is
   client-only. Say which of the listed reactions falls on which side under that rule.
2. **Reaction against act.** A bean thinks while sitting and can be dizzy while free.
   - Options: a separate field that combines with any act; or reaction kinds inside the act
     union.
   - Recommend the separate field, with a small compatibility table: which reactions may
     start in which acts, and what a reaction with a body part (the Eureka jump, the Oops
     shake) does when the act has the body (riding, sitting): the body part is dropped, the
     face and the effect stay.
3. **Layering in the rig player.** Today one clip plays.
   - What a reaction is made of: a face override (eyes and mouth parts), an effect (a drawn
     overlay with its own clip), and optionally a body clip.
   - How the player combines them with the act's clip: a second clip layer on named slots, or
     part overrides only, with the body clip replacing the act's clip only when the bean is
     free and standing still.
   - Reduced motion: which parts of each reaction remain (recommend: the face and a still
     effect stay; the jump and the shake go, and the squash holds at its `still` value).
4. **Triggers, durations and cancelling.**
   - The triggers: a prediction pending (Thinking, until resolved), a prediction resolved
     (Eureka! or Oops), a reply to a ping (Wave hi; the ping itself is M2), a hard landing
     (dizzy), leaving the arena (bandage), a heavy push (effort face and sweat).
   - Durations in ticks from the prototype seconds, as named constants.
   - Whether a reaction ever blocks input. Recommend never: movement drops the body part of a
     reaction and keeps its face and effect, so a student is never held in place by a
     celebration. Say what happens to a reaction when an act starts (getting into a cart mid
     Eureka).
   - Whether a new reaction replaces a running one or waits (recommend: replaces, with the
     one exception you argue for).
5. **Effects as drawn parts.** Dust, sweat, sparkles, the lightbulb, dizzy stars, the
   thought mark, and the doze "z" that already exists as a drawn shape.
   - Options: SVG parts in `art/effects/` under the art contract, loaded by part id and
     animated as clips as data on effect slots; or Phaser particles for some of them (dust).
   - Recommend one mechanism, drawn parts with clips, so the reduced-motion rules, the
     contract checks and the review sheet cover effects too. Then say whether the "z" moves
     into it now or when the first new effect lands.
   - No text inside effects (D17): a lightbulb and a thought mark are shapes; a "?" is text
     and needs a ruling from me.
6. **Emotes as commands.** Wave hi is the first player-triggered reaction.
   - Whether an `emote` command exists in the sim now (recommend yes: it costs one command
     and one reaction kind, and M2 broadcasts it unchanged), and what triggers it in
     single-player (a key; on-screen buttons come later; no text hint beyond the controls
     hint).
   - Whether NPCs use the same model. Recommend: Priya's greeting stays derived until NPCs
     are server-driven in M2, and the compatibility table is written so it can move then.
7. **Determinism and M2.**
   - Timers in whole ticks, as D21; nothing in the sim samples randomness for a reaction.
   - Sparkle and star placement: from a hash of the tick in the client, so every client draws
     the same picture from the same state, and the sim stays free of it.
   - What the server must own in M2 for a reaction another player sees: the kind and the
     start tick, nothing else.

Note as upcoming, and don't ask yet:
- which reactions and effects get drawn first, and what they look like (an art lane decides
  that from the confirmed model)
- goggles and the bandage as catapult behaviour (D9 and the expedition)
- the in-game wardrobe, and the touch buttons that an emote would need on phones
- D7 body forms: a reaction's face parts must work on every form, which the art contract
  handles, not this decision

# When I have answered
- Add the reaction model to `docs/DECISIONS.md` as the next decision ID, in the table's
  style: the options, the leaning, and a status that names what I confirmed and what stays
  Open. Update D21's notes if the answer changes how an act and a reaction relate.
- Add the confirmed rules to `docs/DESIGN.md` section 6 under "Reactions", in a few lines,
  with timing constants named, not copied.
- Write `prompts/reactions-first-session.md`, in the style of `prompts/tools-prep-session.md`:
  the sim slice (the field, the commands, the timers, the compatibility table, tests, the
  boundary test), the player slice (layering, reduced motion, `clip:sheet` evidence), and the
  first effect slot as a mechanism with the existing "z" as its proof, so the art lane can
  draw effects against it. Its "how to work" section names the skills from the tools prep
  session (`add-clip`, `hub-interaction`, `pr-ready`) and says to stop if they do not exist
  yet. It chooses no reaction art.
- Commit only these files, on your own branch in your own worktree, and ask before merging.

Then stop.
