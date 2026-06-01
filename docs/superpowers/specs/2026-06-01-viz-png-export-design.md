# Visualization PNG Export — Design

**Date:** 2026-06-01
**Branch:** `feat/viz-png-export`
**Status:** Approved, pending implementation plan

## Goal

Let the user download the two working-palette visualizations — the **Lightness
Distribution** strip and the **Mosaic** — as flat-color PNG images. Each view
exports to its own PNG, rendered for the contrast style currently selected in
the *Visualize & Compare* section (`vizStyle`).

## Motivation

The palette already exports as `.txt` and GIMP `.gpl` (color values), and the
image-remap feature exports remapped PNGs. There is no way to export the
visualization views themselves as images. Users want the Lightness strip and
Mosaic as PNGs to drop into design docs, references, or other tools.

## Scope

**In scope**

- Export the **working palette** Lightness Distribution strip as PNG.
- Export the **working palette** Mosaic as PNG.
- Export mirrors the current on-screen `vizStyle` (Punchy / Balanced / Muted).
- Flat true-color blocks. No on-screen scanline/CRT overlay in the output.
- Two trigger locations (duplicate controls, same handlers):
  1. The *Visualize & Compare* section, near the Style selector.
  2. The *Export & Tools* card, alongside Download `.txt` / Copy.

**Out of scope (YAGNI)**

- Export buttons on the side-by-side **comparison slots** (A/B). Working
  palette only.
- Baked-in hex codes / slot labels / ramp names. Pure color blocks only.
- Replicating the scanline texture.
- A custom resolution / scale picker. Fixed export width.
- New unit tests on the canvas draw call (see Testing).

## Existing building blocks (reused, not rebuilt)

- `src/lib/save-file.ts` — `saveFile()` already supports `folderKey: 'png'`
  and `data: { bytes: Blob }`, with Tauri native Save-As + browser-anchor
  fallback and per-slot last-folder memory. No changes needed.
- The image-remap export (`App.tsx` ~2337) already proves the
  `canvas.toBlob('image/png')` → `saveFile({ folderKey: 'png' })` pattern.
- Per-style ramps already exist at component scope: `rampsPunchy`,
  `rampsBalanced`, `rampsMuted`, selected by the `vizStyle` ternary
  (as at ~1966 / ~4842).
- The viz data computation already lives inside the `renderSlotViz` closure
  (`App.tsx` ~6897–6916): cross-ramp dedupe → `allColors`, lightness sort →
  `sortedByL`, per-row + cross-ramp dedupe with empty-row filtering →
  `mosaicRamps` (each `{ hexes, originalIdx }`).

## Architecture

Three pieces.

### 1. New pure module `src/lib/strip-export.ts`

No React, no `@ts-nocheck`. Plain functions that draw flat rects to an
off-screen canvas and resolve a PNG `Blob`.

```
drawLightnessStripPng(sortedHexes: string[], opts?): Promise<Blob>
drawMosaicPng(rows: string[][], opts?): Promise<Blob>
```

- **Lightness strip:** one row. Equal-width blocks: each block width =
  `Math.floor(W / n)` with the remainder absorbed so the row fills exactly `W`
  (no sub-pixel gaps). Single fixed height.
- **Mosaic — faithful to screen:** one row per ramp. Each row fills the full
  width `W`; within a row, block width = `W / row.length` (remainder absorbed
  per row as above). Because dedupe yields different per-row counts, internal
  block boundaries do **not** align vertically across rows — this matches the
  on-screen `flex-1` behavior exactly (decision: "faithful to screen", not
  "uniform grid").
- Canvas setup: `imageSmoothingEnabled = false`; fill each block with
  `ctx.fillStyle = hex; ctx.fillRect(...)`; encode via
  `canvas.toBlob(resolve, 'image/png')`, rejecting if `toBlob` yields null.
- Fixed dimensions (tunable constants in the module):
  - Width `W` ≈ 1024px.
  - Lightness strip height ≈ 96px.
  - Mosaic row height ≈ 48px; total height = `rows.length * rowHeight`.
- Optional thin separators between mosaic rows are **out of scope** for v1;
  rows are drawn flush, matching the 1px flex gap loosely enough (revisit only
  if the user asks).

### 2. Extract shared viz-data helper (DRY, prevents drift)

Lift the computation at `App.tsx` ~6897–6916 **verbatim** out of the
`renderSlotViz` closure into a module-scope pure helper:

```
computeVizData(ramps: string[][]): {
  allColors: string[];
  sortedByL: string[];
  mosaicRamps: { hexes: string[]; originalIdx: number }[];
}
```

`renderSlotViz` then calls `computeVizData(ramps)` and destructures — **zero
behavior change** on screen. The export handlers call the same helper, so the
PNG and the on-screen view can never drift. This is the highest-risk edit:
`App.tsx` is `// @ts-nocheck`, so there is no tsc safety net on the extraction.
Mitigation: move the code unchanged, and lean on the existing snapshot/viz
test coverage (and the new `computeVizData` unit test) as the regression guard.

Placement: `computeVizData` can live in `strip-export.ts` (it is pure and viz-
specific) or beside the other pure helpers in `App.tsx`. Prefer
`strip-export.ts` so the module owns the full screen-to-PNG contract and the
unit test imports one place. It depends only on `dedupeHexes` and `hexToHsl`;
if those are not already importable from a lib module, pass them in or relocate
minimally — resolve during planning.

### 3. Two handlers + duplicated buttons in `App.tsx`

Component-scoped async handlers:

- `exportLightnessPng()` — pick current-style `ramps` via the `vizStyle`
  ternary → `computeVizData(ramps).sortedByL` → `drawLightnessStripPng` →
  `saveFile({ defaultName: 'pixel-pal-lightness.png', filters: [{ name: 'PNG
  image', extensions: ['png'] }], data: { bytes: blob }, folderKey: 'png' })`.
- `exportMosaicPng()` — same, using
  `computeVizData(ramps).mosaicRamps.map(r => r.hexes)` →
  `drawMosaicPng` → `saveFile({ defaultName: 'pixel-pal-mosaic.png', ... })`.

Both reuse the existing `exportFeedback` state for the transient
"Downloaded!" / "Save canceled" / "Failed" toast, matching `exportPalette`.

**Buttons (same two handlers wired in both places):**

1. *Visualize & Compare* section — add two buttons near the Style selector
   (the Style button row at ~7074–7079).
2. *Export & Tools* card — add two buttons in the Download/Copy row (~7540),
   styled to match the existing pill buttons (`Download` lucide icon, cyan/
   pink accent treatment).

Edge case: when the palette is empty / has no colors, `sortedByL` /
`mosaicRamps` are empty. Handlers guard on empty and show a feedback toast
("Nothing to export") rather than writing a 0-width PNG.

## Data flow

```
vizStyle ──► rampsPunchy|Balanced|Muted ──► computeVizData(ramps)
                                              │
                          sortedByL ──────────┼──► drawLightnessStripPng ─► Blob ─► saveFile(png)
                          mosaicRamps ────────┘──► drawMosaicPng ─────────► Blob ─► saveFile(png)
```

The same `computeVizData` output feeds `renderSlotViz`'s on-screen DOM, so
screen and PNG are guaranteed consistent for a given `vizStyle`.

## Error handling

- `canvas.toBlob` null → reject; handler catches and shows "Failed" feedback.
- Empty palette → guard before drawing, show "Nothing to export".
- `saveFile` canceled (Tauri dialog dismissed) → "Save canceled" feedback,
  no error (mirrors `exportPalette`).
- Browser fallback (non-Tauri / web build) uses the existing anchor-download
  path in `save-file.ts` — no extra handling needed.

## Testing

Canvas `getContext('2d')` / `toBlob` do not run under vitest/jsdom without a
canvas polyfill, so:

- **Unit tests (`tests/unit/strip-export.spec.ts`):** test the pure
  `computeVizData` helper — lightness sort order (darkest→lightest by HSL L),
  mosaic within-ramp + cross-ramp dedupe, empty-row filtering, and
  `originalIdx` preservation. These are the logic-bearing parts.
- **Pixel output:** verified manually and/or via Playwright e2e (trigger the
  button, assert a PNG download occurs). The draw functions themselves are
  thin and not unit-tested against rendered pixels.

The plan must not promise unit tests on the draw call.

## Filenames & persistence

- `pixel-pal-lightness.png`, `pixel-pal-mosaic.png`.
- Both share the existing `png` last-folder slot (`folderKey: 'png'`), so they
  remember the same folder as the remap export. Acceptable and expected.

## Risks

1. **`computeVizData` extraction in a `@ts-nocheck` file** — no compiler check.
   Mitigate by moving code verbatim and relying on tests + manual viz check.
2. **Mosaic faithfulness** — must replicate per-row full-width division, not a
   uniform grid. Encoded explicitly in `drawMosaicPng`.
3. **Canvas in test env** — addressed by testing the pure helper only.
