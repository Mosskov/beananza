# Art pipeline

Related decisions: D3 (bean rendering), D12 (rotation), D13 (art source and pipeline, partly
confirmed), D22 (anchors and pivots), D25 (customization).

## Principle

Draw every asset **once**, to fixed rules. Everything else (the game, the galleries, the review
sheets, the share site) is generated from those files. This fixes the prototype's biggest
problem: the same drawing existed in many copies, so every bug had to be fixed in all of them.

## 1. Who draws, and in what (D13, confirmed 2026-09-29)

Claude draws the art as **SVG text**, and the SVG files in `art/` are the source of truth. The
game loads them as they are, by part id (`packages/client/src/rig/bean-art-sources.ts`,
`rig/looks.ts`, `art/props.ts`), so there is no drawing tool, exporter or export step. A human
artist could take over later only if they keep to the same contract.

## 2. The art contract

`art/README.md` holds the full rules. In short:
- **Part ids:** flat top-level `<g id>` groups named after rig parts (`body`, `belly`,
  `arm-near`, `foot-far`, `eyes`, `scarf`, …), the same in every view.
- **Units match the physics:** 100 units = 1 m, and the origin (0, 0) is the ground point. Props
  drawn to the same scale fit without adjustment.
- **Views:** 5 drawn views, mirrored to 8 directions. Parts that are not symmetric get `-left`
  drawings, so cosmetics never jump from one side to the other.
- **Pivots and anchors (D22):**
  - `data-pivot="x y"` on parts that rotate;
  - named zero-size `anchor-…` points in one hidden `anchors` group per file (headwear, lean,
    cart floor and rim, bench seats).
  - Heights the sim uses live in sim data; a test fails if an anchor disagrees.
- **Key colours:** recolourable areas use orange key colours that the game swaps per palette
  colour before rasterizing. The palette is in `art/README.md`.
- **No rasters and no text** inside drawings. Text such as the doze "z" is drawn as a shape.

The contract is checked in tests, so a broken drawing fails `pnpm check` before anyone looks at
it:
- `packages/client/src/rig/bean-contract.ts` and `test/bean-art.test.ts`
- `test/looks.test.ts`
- `test/prop-art.test.ts`

## 3. Customization is composed at load time

- **Colours** are key-colour swaps in the SVG text.
- **Patterns** are drawn oversized and clipped to each view's `body` when rasterized.
- **Headwear** hangs from each view's headwear anchor.
- **Faces** draw after the eyes.

About 150 to 200 drawings then cover tens of thousands of combinations. Never build
per-combination sprite sheets.

## 4. Animation as data

Clips are keyframes per part, stored as data and played by the game's own rig player (D3: no
Spine). Timings are in `docs/DESIGN.md` and `docs/IMPLEMENTATION.md`.

## 5. Reviewing an art change

Every art change is shown to the user as a review sheet, **before, after and the difference**:

```sh
pnpm art:sheet               # the working tree's art against HEAD (--base <ref> for another)
```

It writes three kinds of output to `artifacts/art/`:
- `sheet.png`: the `bean` and `looks` galleries and the hub's props;
- `zoom.png`: the same, cropped to what changed;
- the changed pixel count and box for each scene.

Both sides are drawn by the current code, so the sheet shows only what the art change did.
Look at the sheet, and check that every magenta area was meant to change (for example, a change
to the front view must not touch side or back views), before showing it to the user and
committing.

## 6. Props that must rotate

Most props are single drawings that never turn (D12). For the few that turn in the hub
(catapult, carts on curves), the "paper 3D" prop kit is still a proposal
(`docs/IMPLEMENTATION.md` section 4): props as lists of simple shapes in local 3D, projected and
drawn flat. That part of D12 stays Open.

## 7. Next steps

1. **Clip the belly and scarf to the body outline** when rasterizing, as patterns already are.
   A new body shape is then the 5 outlines plus a few anchors per view, not about 10 hand-placed
   parts per view (`docs/TOPICS.md`, "Changing the bean's shape"; that choice is still Open).
2. **More automatic checks** for slips that were caught late in M1 session 3:
   - near and far parts on the correct side for each view (back ¾ had copied front ¾'s sides);
   - anchors and body-hugging parts inside the body outline.
3. **A generated body outline** (a few numbers projected to each view), as a small prototype
   when D7 (more body forms) comes up. Four forms × five views is where hand drawing gets
   expensive.
4. **Reference art not loaded yet:** migrate `art/bean/forms.svg` and `art/baron/` into the
   contract when they are needed. The Baron's known sash issue is in `art/README.md`.
