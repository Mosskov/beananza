# D9 options: the first expedition

The questions D9 (Open) depends on. The session that builds the first expedition asks the ones
its slice needs at the start (options plus one recommendation each, CLAUDE.md "How we work"),
records what the user confirms in `docs/DECISIONS.md`, and leaves the rest Open.

Read with: `docs/DECISIONS.md` (D4, D9, D2, D16, D17), `docs/DESIGN.md` §1, 2, 4, 7 and 8,
`docs/IMPLEMENTATION.md` §6 (the catapult numbers), and `reference/showcase.html` (the catapult,
behaviour only). For each question give the options, a recommendation with numbers where there
are numbers, and what the choice changes.

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

Later, not part of D9: on-screen touch buttons (Action, Jump, Run, as icons; D17), the D13
bean-shape approach, D7 (other body forms), the D12 paper-3D props, the in-game wardrobe, and
the M2 needs (`Math.hypot` and cross-engine determinism, seat occupancy in the state).
