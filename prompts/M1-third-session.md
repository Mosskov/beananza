# M1 third-session prompt

How to use: open Claude Code in this repo and paste everything below the line. The session
starts by checking the baseline and asking you the open questions, then builds once you have
answered.

---

# Goal
Continue Milestone 1. This session: confirm that M1 session 2 still passes, settle the
decisions this work depends on, then build the next three slices proposed in
`docs/STATUS.md`, in this order:
1. interaction states (a refactor of pushing and riding, with no change to behaviour)
2. the bench and sitting
3. customization basics

Each slice builds on the one before. If the session runs long, finish and review what is done,
write up where the next slice got to, and stop. Don't leave two slices half done.

Read first:
- `CLAUDE.md`
- `docs/STATUS.md`: the "M1, session 2" section (results, open issues, next plan), then M0
- `docs/ASSUMPTIONS.md`: the M1 session 2 section above all
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/IMPLEMENTATION.md`: sections 3, 6 and 7
- `docs/DESIGN.md`: sections 4, 6 and 7 (customization layers, the sit animation, the bench)
- `docs/ART_PIPELINE.md`: sections 2 and 4 (pivot markers, palette swaps, masks, slots)
- `art/README.md`, `art/bean/*.svg`, `art/bean/forms.svg` and `art/props/*.svg`
- `README.md`

Nothing in docs/ is approved unless DECISIONS.md says so.

# Step 0: baseline (before changing anything)
- Run `pnpm install`, `pnpm check` and `pnpm shot --all`. All must pass with zero console errors.
- Run every script in `tools/shot/scripts/` (`pnpm shot --script <file>`), then
  `pnpm shot:check-carts`. All must pass.
- Look at `artifacts/shots/bean.png`, `artifacts/shots/hub-carts-push/at-cap.png` and
  `artifacts/shots/hub-carts-board-still/in-still-cart.png`.
- A dev server may already be running on port 5180. tools/shot reuses it; leave it running.
- If anything fails, report it as a failure and fix it first, in its own commit.

# Step 1: ask me, then wait
In your first message, after the baseline, ask these in one message. For each, give the
options, your recommendation and what it changes. Do not build anything that depends on an
answer until I have answered. After I answer, update `docs/DECISIONS.md` for the decisions I
confirmed, and only those.

1. **Interaction states:**
   - Proposed (STATUS M1 s2):
     - one interaction state on the bean (`free`, `pushing`, `boarding`, `riding`, `leaving`, `sitting`, …)
     - one sim module per interaction, each owning its input rules, timed transitions and facing rule
     - a client presentation table (state → clip, visible parts, where the bean draws relative to the prop)
   - Confirm the approach, or propose a better one.
   - Say how the state machine stays deterministic and ready for the M2 server.
2. **Anchor markers in the SVGs** (cart floor, seat, hand points, headwear anchor), replacing
   pivots by rule and constants in code:
   - Propose the markup (for example a named point or a `data-` attribute) and how the art contract checks it.
   - D13 stays Open.
3. **Getting into and out of a cart:**
   - Should the refactor add the hop (the prototype's ≈ 0.32 s plus a little per metre, arc about 0.3 m)?
   - Should the rider be clipped below the rim, which also hides that the bean is wider than the cart (STATUS open issue 2)?
4. **The bench:**
   - Where it goes in the placeholder plaza (D2 stays Open), and its size in metres.
   - Sit rules, with numbers for me to confirm:
     - tap it or press E nearby to walk over and sit
     - a 0.35 s hop onto the seat
     - the seat height
     - feet dangle and swing
     - the bean dozes after 5 s
     - any movement input stands it up
   - Whether Priya (the seated classmate who says "Hi!" and waves) comes this session. She needs a second colour, so she depends on customization.
5. **Customization basics** (ROADMAP M1 item 5: colour, one pattern, three headwear pieces,
   one face variant):
   - Which pattern, which three headwear pieces and which face, from DESIGN.md §6.
   - How colour works: palette swaps before rasterizing, one texture set per colour in use.
   - How patterns are masked to the body.
   - How headwear anchors on each of the 5 views, including pieces that aren't symmetrical.
   - How a player picks: no text in game scenes (D17). An in-game wardrobe needs design, so propose a first step, for example a gallery or URL parameter only.
   - Confirm that cosmetics never touch the sim, and how a test proves it.
6. **D7, body forms:** Bean only for now, or the other forms too. They share one collider.
7. **Footprint** (STATUS open issue 4, D18): keep 0.25 m, or widen it so the drawn body stops
   overlapping props.

Note as upcoming, and don't ask yet:
- D2 (hub layout)
- D9 (first expedition)
- the D12 prop part (paper 3D)
- on-screen touch buttons

# Scope for this session (after my answers)
1. **Interaction states**, sim first.
   - Move pushing and riding into the confirmed structure.
   - **No behaviour change**:
     - every existing test keeps its numbers (field names may change)
     - every script still passes
     - `pnpm shot:check-carts` passes unchanged
     - the sim states in the session 2 logs (`docs/status/m1-s2/`) match new runs of the same scripts, apart from renamed fields; say exactly which fields changed
   - Timed transitions (the hop, if confirmed) are sim states with a start time; their animation comes from sim time.
   - Facing is a rule per state, in the sim. The rider rule stays: toward the camera when still, the direction of travel when moving, with the 0.3/0.1 m/s hysteresis.
   - The client picks the clip, visible parts and draw placement from a table, not per-case code in `HubScene`.
   - Anchors come from the SVGs as confirmed in step 1.
2. **The bench and sitting.**
   - The bench is drawn once in `art/props/`, solid in the sim, with the sit rules confirmed in step 1.
   - Sit and doze clips in the rig. Under reduced motion there's no hop arc or swinging.
   - Tests lock the transitions (walk over, sit, stand up on any movement), the hop timing and determinism.
   - A gallery row and a script for sitting and dozing.
3. **Customization basics** as confirmed in step 1.
   - Colour swaps, one pattern, three headwear pieces and one face, on all 8 directions.
   - Pieces that aren't symmetrical never jump sides.
   - A gallery scene or row showing the combinations.
   - A test proves the collider and every sim number are identical for every cosmetic.
   - Silhouettes stay distinguishable without colour (DESIGN.md §6): check with a greyscale screenshot.

Housekeeping:
- Anything in the STATUS "Open issues" lists is optional. Note it if you skip it.

Out of scope:
- expeditions, the catapult, the pond, the U-Track
- Colyseus, a database, and teacher tools
- hopping over low objects
- on-screen touch buttons (unless trivial; note it)
- an art pipeline beyond what these slices need to load parts and anchors

# How to work (same rules as before)
- Small steps. Each ends with the app loadable, `pnpm check` green, and a commit with a clear message.
- Build sim behaviour in `packages/sim` with tests first. The client only renders sim state and
  turns input into commands. The boundary test must keep passing.
- Port behaviour and numbers from the prototypes (`reference/`, `docs/IMPLEMENTATION.md` §6),
  never their code.
- Draw new art as SVG in `art/`, following `art/README.md`, and load it by part id.
- Routine choices: decide, keep them reversible, and log them in `docs/ASSUMPTIONS.md` under an
  "M1 session 3" heading.
- Anything that would lock an Open decision beyond what I confirmed in step 1: stop and ask.
- Never claim something works or looks right without a screenshot or test you have actually
  checked in this session. Report failures as failures.
- Windows: keep clone paths short. pnpm fails beyond about 260 characters.

# Review gate
When the slices look done, run a separate reviewer subagent that writes no code. It works in a
fresh clone at a short path and uses its own port (for example `--port 5190`). It checks:
- install, build, typecheck, lint and tests pass from a clean clone
- `pnpm shot --all` gives zero console errors for every scene; the reviewer looks at every PNG
- every script in `tools/shot/scripts/` passes, `pnpm shot:check-carts` passes, and the earlier
  hub checks still hold:
  - 2.4 m in 1.0 s, and running is faster
  - a jump leaves the ground and lands
  - behind or in front of the tree matches both the log and the image
- the refactor changed no behaviour: the session 2 cart and hub numbers are identical, and
  session 2's scripts give the same sim states apart from the documented field renames
- interaction states: each transition and its facing rule. The rider still faces the camera
  when still and the direction of travel when moving; the hop, if built, is deterministic.
- the bench: sit, doze after 5 s, stand up on any movement; the draw order against the bench
  is right; reduced motion removes the hop arc and swinging
- customization:
  - every combination shows on all 8 directions without parts jumping sides
  - silhouettes are distinguishable in greyscale
  - the collider and sim numbers are unchanged for every cosmetic
- the drop scene still passes (both balls level at t = 1.0 s, both landed at t = 1.5 s)
- the sim boundary test passes. Units, timestep and coordinates match DECISIONS.md and
  `docs/ASSUMPTIONS.md`.
- the README and `art/README.md` explain the new scenes, scripts, art files and anchors

Fix what it finds, at most 3 rounds. Whatever still fails gets written up, not hidden.

# Finish
Add an "M1, session 3" section at the top of `docs/STATUS.md`. It should cover:
- what was built
- test and screenshot results, with file paths. Copy the evidence into `docs/status/m1-s3/`.
- fps as measured (informational), including `hub` with the bench and the customization gallery
- decisions confirmed
- open issues
- the proposed plan for the next session: what remains of M1 (ROADMAP "done when"), and the
  design pass D9 needs before the expedition prototype

Delete the reviewer's clones and any other temporary clones before you finish, and confirm
they are gone.

Then stop.
