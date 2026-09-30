---
name: draw-piece
description: Draw or change a piece of Beananza art as SVG text under art/ (a bean view, a -left drawing, a pattern, headwear, a face piece or a prop) and get it reviewed. Use this whenever a session creates or edits any file in art/bean/ or art/props/, adds a cosmetic, fixes a drawing slip, or is asked to "draw", "redraw", "add a hat/prop", or change how the bean looks, even for a one-line colour or coordinate change.
---

# Draw a piece

The SVG files in `art/` are the source of truth, loaded by part id (D3, D13). The full rules are
in `art/README.md`; this is the order to work in. Every art change ends with an `art:sheet`
shown to the user (D13), so plan for that from the start.

## 1. Before drawing
- [ ] Is the piece confirmed? D25 confirmed specific cosmetics (spots; sprout, bear ears, bow;
      glasses). A **new** cosmetic, prop or form is a design choice: check `docs/DECISIONS.md`
      and the prompt, and ask the user if neither names it. Redrawing an existing piece is fine.
- [ ] **Effects** (D26: `art/effects/<id>.svg`, placed on the effect slots at the `fx-head`,
      `fx-brow` and `fx-ground` anchors) have a folder, a loader and a contract
      (`packages/client/src/art/effect-contract.ts`; `art/README.md`, "Effects"): origin at the
      anchor, palette colours only, no text, registered in `EFFECTS` and `effect-sources.ts`.
      `pnpm art:part art/effects/<id>.svg` draws one as it is. What to draw is the art lane's
      call (D26).
- [ ] Read `art/README.md` (parts, units, key colours, anchors, palette) and
      `docs/ART_PIPELINE.md` §2.
- [ ] Render the nearest existing piece so you draw to the same scale and style:
      `pnpm art:part art/bean/headwear/sprout.svg` (or the view or prop you are changing), and
      look at the PNG in `artifacts/art/parts/`.
- [ ] Decide where the file goes: bean view `art/bean/<view>.svg` (plus `<view>-left.svg`),
      pattern `art/bean/patterns/<id>.svg`, headwear `art/bean/headwear/<id>.svg`, face
      `art/bean/faces/<id>.svg`, prop `art/props/<id>.svg`.

## 2. Draw to the contract
- [ ] **Part ids:** flat top-level `<g id="…">` groups, no nesting. Bean views use the rig's
      part ids (`body`, `belly`, `arm-near`, `foot-far`, …); a cosmetic has one group per view
      named after the view (`front`, `front-34`, `side`, `back-34`, `back`; faces only `front`,
      `front-34`, `side`); a prop names its parts (listed in `PROP_PARTS`).
- [ ] **Units and origin:** 100 units = 1 m; (0, 0) is the ground point (between the bean's
      feet, under the middle of a prop's footprint). y grows downwards, so up is negative. The
      Bean body is 114 units tall; headwear is drawn with its origin at the view's
      `anchor-headwear` (y = −114).
- [ ] **Key colours:** anything that must recolour per bean colour uses the orange keys
      (body `#E08A5B`, arm `#C96F42`, foot `#B8622F`, belly `#F2B48C`, far foot `#A3572A`,
      far arm `#B5633A`). Everything else uses the palette in `art/README.md`; a new colour is
      added to that palette list.
- [ ] **Symmetric or not:** a piece that is not left-right symmetric (like the bow, on the
      bean's left) needs `-left` drawings for the mirrored views (`front-34-left`, `side-left`,
      `back-34-left`), drawn as seen on screen, so it never jumps sides. For a bean part that is
      the `<view>-left.svg` file; for a cosmetic, extra groups in the same file.
- [ ] **Pivots and anchors (D22):** `data-pivot="x y"` on every part that rotates (`arm-…`,
      `foot-…`, `wheel-…`, `scarf-tail`, `eyes`). Anchors go in one hidden group:
      `<g id="anchors" display="none"><circle id="anchor-<name>" cx="…" cy="…" r="0"/></g>`.
      A height the sim uses stays in sim data, with a test that the anchor agrees.
- [ ] **Near and far (bean views):** front ¾ has its near arm and foot on screen left, back ¾
      on screen **right** (turned away, the bean's right side is nearer). In ¾ and side views
      the near arm is drawn after the body, the far arm before it.
- [ ] **The side view's belly** follows the body's front outline (a crescent on the front
      edge), not a circle inset from it; that read as a spot on the hip in M1 session 3.
- [ ] No rasters, no `<text>`: letters (the doze "z") are drawn shapes.
- [ ] **Register a new file by id** (existing files need nothing):
      - cosmetic: import it in `packages/client/src/rig/looks-sources.ts` and add its id to
        `HEADWEAR_IDS` / `PATTERN_IDS` / `FACE_IDS` in `packages/shared/src/look.ts`;
      - prop: import it in `packages/client/src/art/prop-sources.ts` and list its parts and
        anchors in `PROP_PARTS` / `PROP_ANCHORS` (`art/prop-contract.ts`);
      - bean view: `packages/client/src/rig/bean-art-sources.ts`.
      `pnpm art:check` reports a file on disk that is not registered (or not in a folder the
      game loads), and a registered id or prop with no file. Ids are lowercase letters, digits
      and `-` (`top-hat`, not `top_hat`).
- [ ] **Show a new cosmetic in the `looks` gallery** (`packages/client/src/scenes/LooksGalleryScene.ts`):
      add a `directionRow(...)` for it, so `looks.png`, verify and `art:sheet` keep showing it.
      The gallery's colour row picks pieces by index from `HEADWEAR_IDS` / `PATTERN_IDS`, so
      adding an id also changes which piece some colours wear: expect that magenta in the
      `art:sheet` and say so. A new prop goes where the scene that uses it draws it.

## 3. Check while drawing (seconds each, no game)
- [ ] `pnpm art:check <file>`: fix every finding; the command exits non-zero until there are none.
- [ ] `pnpm art:part <file>` (add `--look <colour>` and other pieces it must sit with): open the
      PNG and look at **every** direction. Check the two session 3 slips by eye too: the side
      belly on the front edge, and the back ¾ near arm and foot on screen right (NE) and left
      (NW).
- [ ] Also look at the piece in a light colour (`--look cream`) and a dark one (`--look slate`).
- [ ] Repeat until it looks right. `art:part` prints the anchors and pivots it found: check they
      are the ones you meant.

## 4. Tests and review
- [ ] `pnpm test` (the contract tests call the same checks as `art:check`). If the file is new,
      add it to the tests that list pieces (`looks.test.ts`, `prop-art.test.ts`).
- [ ] `pnpm art:sheet` (or `--base main` on a branch). Open `artifacts/art/sheet.png` and
      `zoom.png`.
- [ ] Check that **every magenta area was meant to change**: a change to one view must not
      touch another view, a cosmetic must not move the bean, and the hub must be unchanged
      unless the piece is in the plaza.
- [ ] Show the user the sheet (path and what changed) before committing. Commit the SVG, the
      registration and `art/README.md` (new parts, anchors, colours) together.
- [ ] Say in the PR which sheets you looked at (`pr-ready`).
