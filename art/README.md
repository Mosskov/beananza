# Art

The game loads `bean/` and `props/` at runtime, by part id (D3, D12): these files are the
source of the bean and the props, drawn as SVG text (D13's leaning). Their look is still a first
pass and may change. `bean/forms.svg` and `baron/` are reference only (from the design
exploration) and are not loaded yet.

## Bean buddy (`bean/`)
- `front.svg`, `front-34.svg`, `side.svg`, `back-34.svg`, `back.svg`: the five drawn views.
  Mirror `front-34`, `side` and `back-34` horizontally for the other directions.
- Every group has an `id` naming the rig part (`body`, `belly`, `scarf`, `scarf-tail`, `eyes`,
  `cheeks`, `mouth`, `arm-near`, `arm-far`, `foot-near`, `foot-far`, `headwear-goggles`, …).
- Coordinate convention: origin (0, 0) is the ground point between the feet; the body is about
  114 units tall and 100 wide. Headwear anchors at the top of the body (y = −114 for the Bean form).
- `front-34-left.svg`, `side-left.svg`, `back-34-left.svg`: for the three mirrored directions,
  only the parts that are **not symmetric** (today the scarf tail and the eyes, whose highlights
  stay on the light side), drawn as seen on screen rather than mirrored. Cosmetics never jump
  from one side of the bean to the other (D12). A part is asymmetric if it has such a drawing,
  and then it needs one in every mirrored view that has it. `data-after="<part id>"` places
  it in the draw order (for example the scarf tail in front of the body when facing left).
- The game loads these files as they are, by part id (D3). Parts must be flat top-level
  `<g id>` groups (no nesting). The checks live in `packages/client/src/rig/bean-contract.ts`
  and `packages/client/test/bean-art.test.ts`.
- **Pivots (D22):** a part that rotates or scales about its own point carries
  `data-pivot="x y"` on its `<g>`: arms at the shoulder, feet and eyes at their centre, the
  scarf tail at the knot (and prop wheels at the hub, a portal's swirl at its centre). The
  contract requires it on `arm-…`, `foot-…`, `wheel-…`, `scarf-tail`, `eyes` and `swirl`; every
  other part pivots at (0, 0).
- **Anchors (D22):** named points the game places things at, in one reserved group per file
  that is never drawn: `<g id="anchors" display="none"><circle id="anchor-<name>" cx="…" cy="…" r="0"/></g>`.
  Every view has `anchor-headwear` (the top of the body, checked within 1 unit); the side view
  also has `anchor-lean` (the point whose forward tip the pushing stand-off adds). The `-left`
  files have no anchors: mirrored views mirror their base view's. Anchors must lie inside the
  viewBox.
- `front.svg` also has `eyes-sleep` (closed eyes) and `doze-z` (a drawn "z", not text), hidden
  unless the bean dozes on the bench; seated beans always face the camera, so only the front
  view needs them.
- **Customization (D25), composed at load time, never per combination:**
  - **Colours:** the bean is drawn in orange key colours (body `#E08A5B`, arm `#C96F42`, foot
    `#B8622F`, belly `#F2B48C`, and the side and ¾ views' far foot `#A3572A` and far arm
    `#B5633A`). The game swaps them for another palette colour before rasterizing; the far shades
    keep orange's per-channel ratio to the foot and arm. Anything else (scarf, eyes, cheeks) keeps
    its colour. Cream, the one very light colour, gets a soft outline on the body.
  - `patterns/spots.svg`: one flat group per view (`front`, `front-34`, `side`, `back-34`,
    `back`), in that view's frame, in the arm key colour. The game clips each group to that
    view's `body` when rasterizing, so spots may run over the edge.
  - `headwear/sprout.svg`, `bear-ears.svg`, `bow.svg`: one flat group per view, drawn with the
    origin at that view's `anchor-headwear`. `data-layer="behind"` puts a group behind the body.
    A piece that is not symmetric (the bow, on the bean's left) also has `front-34-left`,
    `side-left` and `back-34-left` groups, drawn as seen on screen with the origin at the
    mirrored anchor, so it never jumps sides. Bear ears use the body and belly key colours.
  - `faces/glasses.svg`: groups for the views that show the eyes (`front`, `front-34`, `side`),
    in the view's frame, drawn after the eyes.
  - Checks: `packages/client/src/rig/looks.ts` and `packages/client/test/looks.test.ts`.
- `forms.svg`: the four body forms (Bean, Mochi, Gumdrop, Pill) with each form's eye-line y.
  All forms are cosmetic and share one collider.

## Props (`props/`)
Props that never turn are drawn once, as seen in the hub's ¾ view (D12), by the same rules as the
bean: 100 units = 1 m, origin (0, 0) on the ground (under the middle of the prop's footprint),
flat top-level `<g id>` parts, soft shadows, and `data-pivot` and anchors as for the bean. Colours come from the palette below where it has them;
the tree's greens (`#5F9150`, `#6A9C5A`, `#86B874`) are new. The game loads them by part id
(`packages/client/src/art/props.ts`; checks in `packages/client/test/prop-art.test.ts`).
- `tree.svg`: `shadow`, `trunk`, `canopy`. The sim's footprint is 0.5 × 0.4 m.
- `cart.svg`: the mine cart, 0.8 m long, rim 0.48 m high. Its origin is the point on the near
  rail below the cart's centre (the game places it 0.1 m south of the rail's centre line). `shadow`; `back` and `rocks` (only
  the loaded 20 kg cart), drawn behind a rider; `front`, `wheel-west` and `wheel-east`, drawn in
  front of a rider. Wheels roll about their hub (`data-pivot`), radius 9. Anchors: `floor`
  (where a rider stands: the rail's centre line, 10 units north of the origin, plus the sim's
  cart floor height of 0.1 m; a test checks they agree) and `rim-west`, `rim-east`,
  `base-east`, `base-west` (the corners of the front: below the rim a rider only shows inside
  them).

- `bench.svg`: the plaza bench, 1.6 m long, seen from the south with its backrest on the north
  side; origin in the middle of its 1.6 × 0.45 m footprint. `shadow`, `back` (backrest and back
  legs), `seat` (seat top, front edge and front legs). A seated bean draws in front of all of it.
  Anchors `seat-west` and `seat-east`: where a seated bean's feet point sits, 0.30 m up and
  0.15 m south of the centre line, 0.4 m either side (the sim's bench layout; a test checks they
  agree).

- `portal.svg`: a region portal (D2), a stone ring standing on a plinth with a swirl inside,
  seen from the south; origin in the middle of its 1.3 × 0.4 m footprint (not solid in the sim).
  `shadow`, `base`, `swirl` (white and greys: the game tints it in the region's colour, and it
  turns about its centre, `data-pivot`), `ring`, and `lock` (crossed planks and a padlock, only on
  a locked portal). The game draws `shadow`, `base` and `swirl` behind a bean entering the portal
  and `ring` and `lock` in front. Anchor `swirl`: the swirl's centre, 0.86 m up.

## Boss (`baron/`), parked
- `heavy-baron.svg`: The Heavy Baron in his smug default expression.
- **Known issue:** the sash runs into the mouth and off the edge of the body, and the "1 t" medal sits on the mouth. A corrected version (sash lowered and clipped to the body, medal moved up onto the sash near the left shoulder) is in the "The Heavy Baron" section of `reference/showcase.html`. This SVG still has the original.

## Palette
New colours used by props and cosmetics (not in the tables below): the tree's greens, the
bench's wood uses the cart's browns, and the bow (`#D94F6B`, knot `#B23A55`).
UI and world:
| Use | Hex |
|---|---|
| Background cream | `#F4E9D4` |
| Panel / card | `#FFF8EC` |
| Card shadow | `#E2CFAE` |
| Ink (text, outlines) | `#3B2F2A` |
| Secondary text | `#5A4A40` |
| Label accent | `#8A4E2E` |
| Primary action (white text) | `#B8532F` (shadow `#7E3519`) |
| Highlight / gold | `#F6C66B` |
| Plaza stone | `#E9DCC0` |
| Grass | `#A9C98C` |
| Water | `#86BCCB` |
| Sky, top / horizon (hub island) | `#7FBDE6` / `#D6EEF8` |
| Cloud / cloud shade | `#FDFCF8` / `#E3EEF4` |
| Grass rim (island edge) | `#C4DCA8` |
| Cliff lit / mid / shaded | `#B58360` / `#9C6C4C` / `#7F563D` |
| Rock underside | `#6B4A36` |

Bean colors (body / arm / foot / belly):
| Name | Body | Arm | Foot | Belly |
|---|---|---|---|---|
| Orange | `#E08A5B` | `#C96F42` | `#B8622F` | `#F2B48C` |
| Blue | `#5B8FB9` | `#4A7CA5` | `#3F6B8F` | `#9FC3DD` |
| Green | `#7BAE6A` | `#6A9C5A` | `#5A8A4B` | `#B5D6A3` |
| Pink | `#C7849E` | `#B06F8A` | `#9C5F78` | `#E2B3C4` |
| Yellow | `#E3B04B` | `#C9973A` | `#B0822E` | `#F2D38E` |
| Violet | `#8C7BC0` | `#7867AB` | `#665797` | `#BDB2DE` |
| Teal | `#5FA3A0` | `#4E8D8A` | `#427A77` | `#A7D1CF` |
| Coral | `#E07A55` | `#C96247` | `#B0543B` | `#F2B09A` |
| Cream | `#EFE3CB` | `#D9C8A4` | `#C2AF8A` | `#FFF8EC` |
| Slate | `#6F7F96` | `#5C6B80` | `#4C596B` | `#A9B5C6` |

Group scarf colors: teal `#5FA3A0`, yellow `#F6C66B`, coral `#E07A55`, violet `#8C7BC0`.

## Fonts
Fredoka (display), Nunito (UI), Caveat (in-world hand-lettered signs and physics annotations). All on Google Fonts.

## Drawing conventions
- Flat fills, no outlines (except on very light shapes, which get a soft darker stroke).
- Soft shadows at 12–18% opacity of `#3B2F2A`.
- Animate with squash and stretch, pivoting at the feet (origin 50% 100%).
