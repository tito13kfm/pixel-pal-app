# Design: Palette Interaction Visualizations

**Date:** 2026-06-01
**Branch:** `feat/palette-interaction-viz` (rebased onto `master` after PR #20 merged)
**Status:** Approved design. Next step: `writing-plans`.

Two new visualizations that show how palette colors interact, not just how they
distribute. Specced as **one feature, two components** — they share rendering
infrastructure (`computeVizData`, canvas draw pattern, `saveFile` PNG path) and
both slot into the same place in the UI.

---

## Goals

- **Adjacency matrix:** answer "do any two colors clash / is any color a
  perceptual oddball or a near-duplicate?" across the whole palette at a glance.
- **Dither-blend preview:** show the optical mix a pixel artist actually gets
  when dithering two adjacent ramp shades — the "free in-between shade."

Non-goals: cross-ramp dither combinatorics, multi-ratio dither gradients,
contrast-ratio matrix (WCAG contrast is already covered by the WCAG Check
feature elsewhere).

---

## Shared integration

- Both views render inside `renderSlotViz` in `src/App.tsx` (the "Visualize &
  Compare" section), placed **after the Mosaic** block.
- They appear in **all slots** `renderSlotViz` drives: the working palette and
  both side-by-side compare slots. No special-casing.
- Both respect the existing `vizStyle` toggle (punchy / balanced / muted) — they
  consume the `ramps` that `buildRampsForSnapshot(snap, vizStyle)` already produces.
- Both are driven by `computeVizData(ramps)` from `src/lib/strip-export.ts`,
  which returns `{ allColors, sortedByL, mosaicRamps }`.
- Both render on an HTML5 `<canvas>` (not DOM divs): scales to large palettes
  cheaply, and makes PNG export nearly free since the draw logic is shared
  between screen and export.
- PNG export for both, matching the PR #20 precedent: new `draw*Png` functions
  live in `src/lib/strip-export.ts` next to `drawLightnessStripPng` /
  `drawMosaicPng`; new `export*Png` handlers in `App.tsx` mirror
  `exportMosaicPng` and export the **Slot-A snapshot**
  (`getSnapshotForSlot(sbsLeft, sbsLeftPayload)`), as the existing viz PNG
  buttons do. Buttons sit in the same Style toolbar row.

---

## Component 1 — Adjacency Matrix

An N×N grid pairing every palette color with every other.

### Color set (toggle)
- **All unique colors (default):** `computeVizData().allColors` — every deduped
  shade. Dense (can be 30×30+), exhaustive; best for spotting oddballs.
- **Ramp bases:** `snap.baseColors` — one swatch per ramp. Small (4×4–8×8),
  legible; "how do the ramp families relate."

### Axis ordering — ramp-grouped, explicitly NOT lightness-sorted
Both axes use the **ramp-grouped order** (the natural order of `allColors`,
which preserves ramp adjacency), **not** `sortedByL`.

Rationale (load-bearing — do not "improve" this to a lightness sort): sorting
both axes by lightness turns the ΔE heatmap into a smooth corner-to-corner
gradient (dark near the diagonal, hot at the far corners) that looks *identical
for every palette* and conveys nothing. Ramp-grouped order preserves family
blocks, so an outlier or clash shows up as a **break in the block pattern** —
that visual break is the entire mechanism behind the "spot oddballs" goal.

### Grid shape
**Full grid** (not triangular). ΔE_OK is symmetric so the grid mirrors across
the diagonal, but keeping the full grid lets the user scan one color's entire
row of relationships at once. The diagonal is the identity pair (a color with
itself).

### View mode (toggle)
- **Pair split (default):** each off-diagonal cell is a 135° diagonal split,
  row color on one triangle, column color on the other. Diagonal cells are the
  solid color. This is the literal "these two together" view.
- **Heatmap:** each off-diagonal cell is colored by
  `deltaEOK(hexToOklch(rowHex), hexToOklch(colHex))`, normalized to a hot/cold
  ramp. Dark ≈ near-duplicate (perceptually redundant pair); hot = far apart.
  Diagonal cells render neutral (ΔE = 0). `hexToOklch` returns `Oklch | null`;
  a null on either color renders the cell as a neutral "n/a" fill (do not crash).

Both `hexToOklch` and `deltaEOK` live in `src/lib/oklch.ts`.

### Header strips
A top strip and a left strip of the actual color swatches border the grid, so
the colors stay identifiable in heatmap mode (where cell fill encodes the metric,
not the color).

### Compact-slot behavior
`renderSlotViz` runs at `compact=true` (~200px) in the side-by-side compare
slots, and 2–3 matrix canvases can coexist there. A 30×30 grid at 200px is
unreadable and per-cell hover is impractical at that size. Therefore:
- **Compact slots default to Heatmap mode** (the pattern reads without hover)
  and **skip the per-cell hover readout**.
- The **full-size working palette** view defaults to Pair mode and includes a
  hover readout.

### Hover readout (full-size only)
On `mousemove` over the canvas, map cursor → cell `(i, j)`, and render a small
text readout **below the canvas** showing both hexes and their ΔE_OK value
(e.g. `#C0392B ↔ #2980B9 · ΔE 0.21`). Hover state is **per matrix instance**
(each canvas owns its own readout target and state) so multiple matrices don't
collide.

### Known limitation (documented, not a bug)
ΔE_OK conflates lightness distance and hue distance. A hue-clash oddball at
normal lightness reads more subtly in the heatmap than a lightness outlier does.
Acceptable for v1; noted so it's not a surprise.

### PNG export
`drawAdjacencyMatrixPng(ramps, opts)` in `strip-export.ts`, where `opts` carries
the active `{ colorSet, viewMode }`. The PNG mirrors the on-screen Slot-A matrix.
Wired to a new toolbar button + `exportMatrixPng` handler.

### Size guard
No hard cap. Cell pixel size is adaptive with a minimum (e.g. floor of ~4px) so
large palettes stay bounded; the canvas grows but cells shrink to the floor.
If `allColors.length` exceeds a threshold (e.g. ~48) in a non-compact view,
show a small inline note that the all-unique grid is dense and the ramp-bases
toggle may read better. (Exact threshold finalized in the plan.)

---

## Component 2 — Dither-Blend Preview

Pixel-art-specific: shows the 2-color optical mix you get by dithering two
**consecutive shades within a ramp** — the intermediate shade dithering buys
without adding a palette entry.

### Layout — interleaved in-ramp strips
Per ramp row (from `computeVizData().mosaicRamps`):
`solid sᵢ · dither blend(sᵢ, sᵢ₊₁) · solid sᵢ₊₁ · dither blend(sᵢ₊₁, sᵢ₊₂) · …`

Blend cells are visually distinguished from solid shade cells (e.g. a thin inset
/ dashed outline) so it's clear which cells are derived. Scope is **in-ramp
consecutive pairs only** — no cross-ramp blends (combinatorial explosion, and
bases-only would not tell the whole shade story).

### Pattern (toggle)
- **2×2 checkerboard (default):** the classic hand-placed 8-bit dither.
- **4×4 Bayer (ordered):** finer grain.
PNG export honors whichever pattern is active.

### Render scale is semantic
The dither pattern must be drawn at a scale where individual pixels are visibly
distinct — **not** shrunk so small it reads as a solid interpolated block. If
it shrinks to a solid midpoint, the feature is indistinguishable from a plain
lerp and loses its reason to exist ("here's the actual dither you'd hand-place,"
not "here's the mathematical midpoint"). Use `image-rendering: pixelated` and a
cell scale that keeps the checker/Bayer texture legible.

### PNG export
`drawDitherBlendPng(ramps, opts)` in `strip-export.ts` (`opts` carries the
active `pattern`). New toolbar button + `exportDitherPng` handler, Slot-A.

---

## Reuse summary (do NOT rebuild)

| Need | Use |
|------|-----|
| Deduped colors / mosaic rows / L-sorted | `computeVizData(ramps)` — `src/lib/strip-export.ts` |
| Perceptual distance | `deltaEOK(a, b)` + `hexToOklch(hex)` — `src/lib/oklch.ts` |
| Canvas → PNG → save | `saveFile({ folderKey: 'png', ... })` — `src/lib/save-file.ts` |
| Style/vizStyle ramps | `buildRampsForSnapshot(snap, vizStyle)` — `App.tsx` |
| New canvas draws | add beside `drawLightnessStripPng` / `drawMosaicPng` in `strip-export.ts` |
| Export handlers | mirror `exportMosaicPng` in `App.tsx` |

New modules should be typed; `App.tsx` is `// @ts-nocheck` (intentional).

---

## Control inventory (scope, explicit)

- Adjacency matrix: **color-set toggle** (all-unique ⇄ ramp-bases) + **view
  toggle** (pair ⇄ heatmap).
- Dither preview: **pattern toggle** (2×2 checker ⇄ 4×4 Bayer).
- **2 PNG export buttons** (matrix, dither).
- Both views render in all slots.

Nothing else.

---

## Testing

- **Unit (`tests/unit/*.spec.ts`):** new draw functions and any pure helpers
  (cell-color/metric mapping, blend-pattern generation) get vitest coverage,
  following the `strip-export` test pattern from PR #20. Assert: ΔE normalization
  maps identical colors → diagonal/neutral; null-hex → neutral fill (no throw);
  checker vs Bayer produce the expected per-pixel pattern for a known pair;
  matrix axis order equals `allColors` order (guards against an accidental
  lightness sort).
- **Build:** `npm run build` (tsc --noEmit + vite) stays green.
- **Smoke:** `npm run dev` — both views render in working + compare slots; PNG
  buttons download; toggles flip the rendering.
