# Reference art

Exported from the design exploration. **Reference only, not final assets.** Shapes are simple
SVG paths so they can seed a parts-based rig (see `docs/DESIGN.md` §6).

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
  `<g id>` groups (no nesting). Pivots are derived by rule until the files carry pivot markers:
  arms and the scarf tail rotate about the first point of their path, feet about their ellipse
  centre, eyes about the mean eye centre, everything else about (0, 0). The checks live in
  `packages/client/src/rig/bean-contract.ts` and `packages/client/test/bean-art.test.ts`.
- `forms.svg`: the four body forms (Bean, Mochi, Gumdrop, Pill) with each form's eye-line y.
  All forms are cosmetic and share one collider.

## Boss (`baron/`), parked
- `heavy-baron.svg`: The Heavy Baron in his smug default expression.
- **Known issue:** the sash runs into the mouth and off the edge of the body, and the "1 t" medal sits on the mouth. A corrected version (sash lowered and clipped to the body, medal moved up onto the sash near the left shoulder) is in the "The Heavy Baron" section of `reference/showcase.html`. This SVG still has the original.

## Palette
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
