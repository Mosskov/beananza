# D9 design pass (the first expedition)

How to use: open Claude Code in this repo and paste everything below the line. It is a
discussion, not a build session: nothing gets built. When it ends, the decisions are recorded,
and `prompts/M1-fourth-session.md` can run through without waiting for answers.

---

# Goal
Settle D9 (the first expedition) and the questions it depends on, with me, and record them. Do
not write code or art.

Read first:
- `CLAUDE.md`
- `docs/DECISIONS.md`: above all D4 (the exact-integrator rule is still Open), D9, D2 and D17
- `docs/DESIGN.md`: sections 1, 2, 4, 7 and 8 (predict, test, compare; the first expedition;
  the field notebook)
- `docs/IMPLEMENTATION.md`: sections 3, 6 (the catapult numbers) and 7
- `docs/ROADMAP.md`: the M1 "done when"
- `docs/STATUS.md`: the latest session's "next plan"
- `reference/showcase.html`: the catapult, for behaviour only

Nothing in docs/ is approved unless DECISIONS.md says so.

# The questions
Ask them in one message. For each, give:
- the options;
- your recommendation, with numbers where there are numbers;
- what the choice changes.

Ground the options in DESIGN.md §8, the prototype catapult (IMPLEMENTATION.md §6) and the core
habit of predict, test, compare.

1. **The launcher:**
   - Options: a catapult with crank notches (the prototype), a launcher with angle and speed,
     or something else.
   - What the student sets, the ranges and steps, and whether the bean is the projectile.
   - What each choice teaches (range against launch speed, angle, independence of the
     horizontal and vertical motion).
2. **The prediction:**
   - How a student predicts without free text (no free text for minors, D17 and CLAUDE.md
     privacy), for example dragging a landing marker, choosing among markers, or picking a
     distance on a ruler.
   - Whether a prediction is required before every launch.
3. **Measuring and comparing:**
   - What the world measures and shows as readouts (D17 allows them): landing distance,
     flight time, apex height.
   - How the compare moment looks: the predicted and actual landing side by side, and a
     dashed arc (the field-notebook look, DESIGN.md §5).
   - What counts as success: a tolerance in metres or a percentage. A miss must feel funny,
     not punishing (DESIGN.md §1).
4. **Physics and units (touches D4 and D16):**
   - An exact integrator for the flight (the D4 leaning), with real gravity 9.81 m/s².
   - Launch height and scale in metres, and the typical range.
   - Whether air drag is off (recommend off: textbook numbers).
   - Tests that pin textbook values: R = v²·sin 2θ / g from ground level, and T and apex
     height from a launch height.
5. **Getting there and back (touches D2, which stays Open):**
   - How the bean enters from the hub: a gate or signpost placed in the placeholder plaza,
     used with E or a tap.
   - The side-view scene, how the student returns to the hub, and what carries over (the look).
6. **The notebook:**
   - What one entry holds: the inputs, the prediction, the result, the error, the time and a
     concept id (DESIGN.md §11).
   - Where it lives now: local storage only, no personal data, nothing sent anywhere.
   - How a student sees it without instructional text: an overlay of readouts and drawn marks.
7. **Optional slices after the expedition.** Which of these, if any, M1 session 4 includes, and
   in what order:
   - **On-screen touch buttons** (Action, Jump, Run), so phones can do everything. Needs icons
     rather than words (D17 allows the controls hint only).
   - **A sharp picture at full screen** (TOPICS.md "To return to": size the canvas to device
     pixels, `ART_RESOLUTION` 3, cap for Chromebooks).
   - **CI:** running `pnpm verify`, if there is a remote to run it on.

Note as upcoming, and don't ask yet:
- the D13 bean-shape approach (TOPICS.md)
- D7 (other body forms), and the D12 prop part (paper 3D)
- the in-game wardrobe design
- the M2 needs from STATUS: `Math.hypot` and cross-engine determinism, and seat occupancy in
  the state

# When I have answered
- Update `docs/DECISIONS.md` for the decisions I confirmed, and only those. D9 may be partly
  confirmed. Anything I leave open stays Open, with my notes.
- Write the optional slices I picked, in my order, into the "Optional slices" section of
  `prompts/M1-fourth-session.md`.
- If an answer changes the session 4 scope, adjust `prompts/M1-fourth-session.md` to match, and
  tell me what changed.
- Commit only these files, on your own branch in your own worktree, and ask before merging.

Then stop.
