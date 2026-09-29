# Art pipeline (proposal, open until a drawing tool is chosen)

Related decisions: D3 (bean rendering), D13 (art source and pipeline).

## Principle

Draw every asset **once**, to fixed rules. Everything else (the game, the gallery, documentation,
showcase pages) is generated from those files. This is the fix for the prototype's biggest
problem: the same drawing existed in many copies and bugs had to be fixed in all of them.

## 1. Source files

One file per asset family (bean body forms, headwear, faces, props, bosses) in a vector tool.
Figma is suggested: reusable components, collaboration, and an API a script can export from.
Illustrator or Affinity also work if artists prefer them, as long as they export clean SVG.

Each family has a template with the five view frames already laid out (front, front ¾, side,
back ¾, back), a grid, the ground point and pre-named layers.

## 2. The art contract

Rules every drawing follows:
- **Layer names are part ids** (`body`, `belly`, `arm-near`, `arm-far`, `foot-near`, `foot-far`,
  `eyes`, `cheeks`, `mouth`, `scarf`, `headwear`, ...), identical in every view, so the game
  knows what to animate. The reference SVGs in `art/bean/` already follow this.
- **Pivot markers:** small named points for where each arm rotates, where headwear anchors, and
  so on.
- **Units match the physics.** 100 units = 1 m. The bean's feet sit at the origin (0, 0). Props
  drawn to the same scale simply fit.
- **Palette swatches only.** Recolorable areas use key colors ("body base", "body shade", "belly")
  that the game swaps at runtime. Palette values are in `art/README.md`.
- **Customization slots and masks:** a headwear anchor per view, and a body silhouette per form
  and view so patterns can be clipped to the body.
- **No rasters, no text** inside drawings (in-world text is added by the game).

## 3. The build step

A script runs on every change and:
1. **Exports and cleans** the SVGs (compacts them and normalizes coordinates).
2. **Validates** them: every view has every required part and pivot, only palette colors are
   used, no embedded images, sizes stay within budget. Mistakes are caught before the game.
3. **Generates runtime files:** a rig description (parts, pivots, layer order per view, slots)
   and texture atlases for performance.
4. **Builds a preview gallery:** every view, sample customization combinations, and animations
   playing. Screenshot comparison flags any accidental visual change for review.

## 4. Customization is composed at runtime

Four forms × ten colors × six patterns × eight headwear pieces × eight faces is tens of
thousands of combinations. Drawn as parts it is roughly 150 to 200 drawings in total: colors are
swaps, patterns are masked overlays, and mirroring halves the side views. Never build
per-combination sprite sheets.

## 5. Animation as data

Clips are keyframes per part, stored as data and played by the game. The prototype's CSS
animations (idle breathing, walk waddle, run lean, jump squash, push strain, reactions) convert
almost directly; timings are in `docs/DESIGN.md` and `docs/IMPLEMENTATION.md`. Start with a small
in-house timeline editor that reads the rig files. Spine is worth considering only if rigs get
much more complex.

## 6. Props that must rotate

Most props are single drawings. For the few that turn in the hub (catapult, carts on curves),
use the "paper 3D" prop kit described in `docs/IMPLEMENTATION.md` section 4: props are lists of
simple shapes in local 3D, projected and drawn flat. The prototype catapult is the worked
example.

## 7. First steps

1. Write the art contract using the bean as the worked example.
2. Build the template, exporter, validator and gallery.
3. Migrate the bean, the customization kit and the Heavy Baron into the pipeline.
4. Retire the duplicated copies in the design canvas.

## 8. Open questions

- **Which drawing tool will the artists use?** This decides how the export step is built.
- Who draws final art, and who reviews it? Claude Code can write the validator, exporter, rig
  generator and gallery, and can draft assets that follow the contract, but final art should be
  hand-finished.
