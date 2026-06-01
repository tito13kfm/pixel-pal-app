# Visualization PNG Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add buttons to export the working palette's Lightness Distribution strip and Mosaic as flat-color PNGs, in both the Visualize & Compare section and the Export & Tools card.

**Architecture:** A new pure module `src/lib/strip-export.ts` computes the viz data (extracted verbatim from `renderSlotViz`) and draws flat-rect PNGs via an off-screen canvas. `App.tsx` gains two handlers that feed the current-`vizStyle` ramps through the shared helper and save via the existing `saveFile({folderKey:'png'})` path. The shared `computeVizData` helper guarantees the on-screen view and the PNG never drift.

**Tech Stack:** React + TypeScript, Vite, Vitest (unit), HTML Canvas 2D, Tauri plugin-fs/dialog (via existing `save-file.ts`).

---

## File Structure

- **Create** `src/lib/hex-utils.ts` — neutral home for `dedupeHexes` (currently inline in `App.tsx`) so a lib module can import it without depending on `App.tsx`.
- **Create** `src/lib/strip-export.ts` — `computeVizData` (pure viz-data derivation) + `drawLightnessStripPng` / `drawMosaicPng` (canvas → PNG Blob). NOT `@ts-nocheck`.
- **Create** `tests/unit/strip-export.spec.ts` — unit tests for `computeVizData` only.
- **Modify** `src/App.tsx`:
  - Remove inline `dedupeHexes` (lines ~198–215), import it from `./lib/hex-utils`.
  - Refactor the viz-data computation inside `renderSlotViz` (~6897–6916) to call `computeVizData`.
  - Add `exportLightnessPng` / `exportMosaicPng` handlers near `exportPalette` (~4795).
  - Add two buttons in the viz Style row (~7074) and two in the Export & Tools Download/Copy row (~7541).

---

## Task 1: Move `dedupeHexes` into a neutral lib module

**Files:**
- Create: `src/lib/hex-utils.ts`
- Test: `tests/unit/hex-utils.spec.ts`
- Modify: `src/App.tsx:198-215` (remove inline def), `src/App.tsx` import block (~line 1-30)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hex-utils.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dedupeHexes } from '../../src/lib/hex-utils';

describe('dedupeHexes', () => {
  it('collapses duplicates preserving first occurrence and casing', () => {
    expect(dedupeHexes(['#AABBCC', '#aabbcc', '#112233'])).toEqual(['#AABBCC', '#112233']);
  });

  it('is case-insensitive on the dedupe key', () => {
    expect(dedupeHexes(['#ABCDEF', '#abcdef'])).toEqual(['#ABCDEF']);
  });

  it('skips non-string entries', () => {
    // @ts-expect-error intentional: runtime guards non-strings
    expect(dedupeHexes(['#000000', null, undefined, '#000000'])).toEqual(['#000000']);
  });

  it('returns empty array for empty input', () => {
    expect(dedupeHexes([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/hex-utils.spec.ts`
Expected: FAIL — cannot resolve `../../src/lib/hex-utils`.

- [ ] **Step 3: Create the module**

Create `src/lib/hex-utils.ts` (move the body verbatim from `App.tsx:204-215`, add a type):

```ts
// dedupeHexes: collapse duplicate hex strings preserving first occurrence
// and original casing. Used for visualization, export, and copy where the
// hardware-locked ramp can produce repeats (e.g. an 8-shade Game Boy ramp
// collapses to 4 unique colors). The main per-ramp editor UI keeps duplicates
// visible so the user sees the full shadow->highlight sequence; only
// downstream consumers dedupe.
export const dedupeHexes = (hexes: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hex of hexes) {
    if (typeof hex !== 'string') continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
  }
  return out;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/hex-utils.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire App.tsx to the new module**

In `src/App.tsx`, delete the inline `dedupeHexes` block (the comment + `const dedupeHexes = (hexes) => { ... };`, lines ~198-215).

Add to the existing `./lib/*` import group near the top of `App.tsx` (e.g. after the `./lib/palette` import around line 24):

```ts
import { dedupeHexes } from './lib/hex-utils';
```

All existing call sites (`dedupeHexes(...)` at ~4789, ~6897, ~6908) are unchanged — same name, now imported.

- [ ] **Step 6: Verify build + full unit suite**

Run: `npm run build`
Expected: `tsc --noEmit` passes (App.tsx is `@ts-nocheck`; the new module is typed) and `vite build` succeeds.

Run: `npm test`
Expected: all existing tests + the new `hex-utils` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hex-utils.ts tests/unit/hex-utils.spec.ts src/App.tsx
git commit -m "refactor: extract dedupeHexes into src/lib/hex-utils"
```

---

## Task 2: Add `computeVizData` to `strip-export.ts` (pure, tested)

**Files:**
- Create: `src/lib/strip-export.ts`
- Test: `tests/unit/strip-export.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/strip-export.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeVizData } from '../../src/lib/strip-export';

// Three ramps. Ramp 0 has an internal duplicate (#000000 twice).
// Ramp 2 is fully contained in earlier ramps, so its mosaic row is empty
// and must be filtered out, while keeping originalIdx on surviving rows.
const RAMPS = [
  ['#000000', '#000000', '#404040'], // ramp 0 -> dedupes to [#000000, #404040]
  ['#808080', '#ffffff'],            // ramp 1
  ['#000000', '#ffffff'],            // ramp 2 -> all already seen -> empty row
];

describe('computeVizData', () => {
  it('allColors is cross-ramp deduped, first-occurrence order', () => {
    const { allColors } = computeVizData(RAMPS);
    expect(allColors).toEqual(['#000000', '#404040', '#808080', '#ffffff']);
  });

  it('sortedByL orders darkest to lightest by HSL lightness', () => {
    const { sortedByL } = computeVizData(RAMPS);
    expect(sortedByL).toEqual(['#000000', '#404040', '#808080', '#ffffff']);
  });

  it('mosaicRamps dedupes within and across rows, drops empty rows, keeps originalIdx', () => {
    const { mosaicRamps } = computeVizData(RAMPS);
    expect(mosaicRamps).toEqual([
      { hexes: ['#000000', '#404040'], originalIdx: 0 },
      { hexes: ['#808080', '#ffffff'], originalIdx: 1 },
    ]);
  });

  it('handles empty input', () => {
    expect(computeVizData([])).toEqual({ allColors: [], sortedByL: [], mosaicRamps: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/strip-export.spec.ts`
Expected: FAIL — cannot resolve `../../src/lib/strip-export`.

- [ ] **Step 3: Create the module with `computeVizData`**

Create `src/lib/strip-export.ts`:

```ts
// Visualization PNG export. Two responsibilities:
//   1. computeVizData: derive the lightness-sorted strip and the mosaic rows
//      from a style's ramps. Extracted verbatim from renderSlotViz so the
//      on-screen view and the exported PNG are computed from one source.
//   2. drawLightnessStripPng / drawMosaicPng: render flat color blocks to an
//      off-screen canvas and resolve a PNG Blob. (Added in a later task.)
import { hexToHsl } from './color';
import { dedupeHexes } from './hex-utils';

export interface MosaicRow {
  hexes: string[];
  originalIdx: number;
}

export interface VizData {
  allColors: string[];
  sortedByL: string[];
  mosaicRamps: MosaicRow[];
}

// `ramps` is an array of ramps, each a list of hex strings (the shape
// buildRampsForSnapshot returns: shades.map(s => s.hex), post pin/hardware/hidden).
export function computeVizData(ramps: string[][]): VizData {
  const allColors = dedupeHexes(ramps.flat());
  const sortedByL = [...allColors].sort((a, b) => hexToHsl(a).l - hexToHsl(b).l);

  const seen = new Set<string>();
  const mosaicRamps: MosaicRow[] = ramps
    .map((ramp, originalIdx) => ({
      hexes: dedupeHexes(ramp).filter((hex) => {
        const key = hex.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      originalIdx,
    }))
    .filter(({ hexes }) => hexes.length > 0);

  return { allColors, sortedByL, mosaicRamps };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/strip-export.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS. (`hexToHsl` comes from the `@ts-nocheck` `color.ts`, so `.l` resolves as `any` — no type error.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/strip-export.ts tests/unit/strip-export.spec.ts
git commit -m "feat: add computeVizData viz-data helper for PNG export"
```

---

## Task 3: Refactor `renderSlotViz` to use `computeVizData` (zero behavior change)

**Files:**
- Modify: `src/App.tsx:6897-6916` (the inline viz-data computation inside `renderSlotViz`)
- Modify: `src/App.tsx` import group (add `computeVizData`)

- [ ] **Step 1: Add the import**

In the `./lib/*` import group of `App.tsx`, add:

```ts
import { computeVizData } from './lib/strip-export';
```

- [ ] **Step 2: Replace the inline computation**

In `renderSlotViz`, after `const ramps = buildRampsForSnapshot(snap, vizStyle);` (~line 6893), replace the block that currently computes `allColors`, `sortedByL`, `_mosaicSeen`, and `mosaicRamps` (~lines 6894-6916) with:

```ts
            // Cross-ramp dedupe for visualization (hardware-locked palettes
            // repeat hexes); lightness sort for the strip; per-row + cross-ramp
            // dedupe with empty-row filtering for the mosaic. originalIdx is
            // preserved so name tooltips stay correct. Shared with PNG export.
            const { allColors, sortedByL, mosaicRamps } = computeVizData(ramps);
```

Leave everything downstream (`namesSource`, `plotSize`, the JSX using `sortedByL` / `mosaicRamps` / `allColors`) unchanged.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Verify no behavior drift**

Run: `npm test`
Expected: PASS — any existing viz/snapshot tests still pass (regression guard for the extraction).

Run: `npm run dev`, open the app, expand **Visualize & Compare**. Confirm the Lightness Distribution strip and Mosaic render exactly as before for Punchy/Balanced/Muted. Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: renderSlotViz uses shared computeVizData helper"
```

---

## Task 4: Add canvas PNG draw functions

**Files:**
- Modify: `src/lib/strip-export.ts` (append draw functions)

> Canvas `getContext('2d')` / `toBlob` do not run under vitest/jsdom without a polyfill, so these functions are NOT unit-tested. They are thin and verified manually / via e2e in Task 6. Do not add unit tests that call them.

- [ ] **Step 1: Append the draw functions and constants**

Add to the end of `src/lib/strip-export.ts`:

```ts
// --- PNG rendering ---------------------------------------------------------

const EXPORT_WIDTH = 1024;       // px, fixed output width for both views
const LIGHTNESS_HEIGHT = 96;     // px, single-row strip height
const MOSAIC_ROW_HEIGHT = 48;    // px, per-ramp row height

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}

// Integer block boundaries that tile [0, width) exactly with no gaps:
// block i spans [round(i*width/n), round((i+1)*width/n)).
function blockEdges(width: number, n: number, i: number): { x: number; w: number } {
  const x0 = Math.round((i * width) / n);
  const x1 = Math.round(((i + 1) * width) / n);
  return { x: x0, w: x1 - x0 };
}

// One row of equal-width blocks across the full width.
export function drawLightnessStripPng(
  sortedHexes: string[],
  opts: { width?: number; height?: number } = {},
): Promise<Blob> {
  const width = opts.width ?? EXPORT_WIDTH;
  const height = opts.height ?? LIGHTNESS_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.imageSmoothingEnabled = false;
  const n = sortedHexes.length;
  for (let i = 0; i < n; i++) {
    const { x, w } = blockEdges(width, n, i);
    ctx.fillStyle = sortedHexes[i];
    ctx.fillRect(x, 0, w, height);
  }
  return canvasToPngBlob(canvas);
}

// One row per ramp. Each row fills the full width; block width = width/row.length.
// Faithful to the on-screen flex-1 mosaic: internal boundaries do NOT align
// across rows when rows have different counts.
export function drawMosaicPng(
  rows: string[][],
  opts: { width?: number; rowHeight?: number } = {},
): Promise<Blob> {
  const width = opts.width ?? EXPORT_WIDTH;
  const rowHeight = opts.rowHeight ?? MOSAIC_ROW_HEIGHT;
  const height = Math.max(rowHeight, rows.length * rowHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.imageSmoothingEnabled = false;
  rows.forEach((row, r) => {
    const y = r * rowHeight;
    const n = row.length;
    for (let i = 0; i < n; i++) {
      const { x, w } = blockEdges(width, n, i);
      ctx.fillStyle = row[i];
      ctx.fillRect(x, y, w, rowHeight);
    }
  });
  return canvasToPngBlob(canvas);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Confirm unit suite still green (no canvas calls under test)**

Run: `npx vitest run tests/unit/strip-export.spec.ts`
Expected: PASS — still 4 `computeVizData` tests, draw functions untouched by tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/strip-export.ts
git commit -m "feat: add flat-color PNG renderers for lightness strip and mosaic"
```

---

## Task 5: Add export handlers and buttons in App.tsx

**Files:**
- Modify: `src/App.tsx` import group (add the two draw fns)
- Modify: `src/App.tsx` near `exportPalette` (~4795) — add two handlers
- Modify: `src/App.tsx:~7074` (viz Style row) and `~7541` (Export & Tools row) — add buttons

- [ ] **Step 1: Add the draw-function import**

Update the `strip-export` import added in Task 3:

```ts
import { computeVizData, drawLightnessStripPng, drawMosaicPng } from './lib/strip-export';
```

- [ ] **Step 2: Add the two handlers**

Immediately after the `exportPalette` function (ends ~line 4816), add:

```ts
  // Export the working palette's Lightness Distribution strip as a flat-color
  // PNG. Mirrors the on-screen view: same slot snapshot (sbsLeft) and current
  // vizStyle, same computeVizData derivation.
  const exportLightnessPng = async () => {
    try {
      const snap = getSnapshotForSlot(sbsLeft, sbsLeftPayload);
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { sortedByL } = computeVizData(ramps);
      if (sortedByL.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawLightnessStripPng(sortedByL);
      const result = await saveFile({
        defaultName: 'pixel-pal-lightness.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) setExportFeedback('Save canceled');
      else if (!result.ok) setExportFeedback('Failed to save PNG');
      else setExportFeedback('Downloaded!');
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed to export PNG');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  // Export the working palette's Mosaic as a flat-color PNG. Faithful to the
  // on-screen layout: one row per (deduped, non-empty) ramp, each row full width.
  const exportMosaicPng = async () => {
    try {
      const snap = getSnapshotForSlot(sbsLeft, sbsLeftPayload);
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r) => r.hexes);
      if (rows.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawMosaicPng(rows);
      const result = await saveFile({
        defaultName: 'pixel-pal-mosaic.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) setExportFeedback('Save canceled');
      else if (!result.ok) setExportFeedback('Failed to save PNG');
      else setExportFeedback('Downloaded!');
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed to export PNG');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };
```

Note: `getSnapshotForSlot`, `sbsLeft`, `sbsLeftPayload`, `buildRampsForSnapshot`, `vizStyle`, `saveFile`, and `setExportFeedback` are all already in component scope (see `leftSnapForRemap = getSnapshotForSlot(sbsLeft, sbsLeftPayload)` at ~3757 and the existing `exportPalette`). `getSnapshotForSlot(sbsLeft, sbsLeftPayload)` is the exact expression that produces `leftSnap` for the on-screen view (~6865).

- [ ] **Step 3: Add buttons in the viz Style row**

In the viz Style selector container (the `flex ... justify-center` div around line 7074, after the Muted button at ~7078), add before the closing `</div>`:

```tsx
                    <span className="mx-1 h-5 w-px bg-cyan-500/40" aria-hidden="true" />
                    <button onClick={exportLightnessPng} title="Download the Lightness Distribution strip as a PNG (current style)" className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 hover:scale-105 flex items-center gap-2" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Lightness PNG</button>
                    <button onClick={exportMosaicPng} title="Download the Mosaic as a PNG (current style)" className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 hover:scale-105 flex items-center gap-2" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Mosaic PNG</button>
```

(`Download` is already imported from `lucide-react` at line 3.)

- [ ] **Step 4: Add duplicate buttons in the Export & Tools row**

In the Export & Tools Download/Copy row (after the Copy button at ~7542), add:

```tsx
                  <button onClick={exportLightnessPng} title="Download the Lightness Distribution strip as a PNG (current style)" className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Lightness PNG</button>
                  <button onClick={exportMosaicPng} title="Download the Mosaic as a PNG (current style)" className="px-4 py-1.5 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-100 hover:bg-pink-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ff00ff' }}><Download size={14} />Mosaic PNG</button>
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire Lightness/Mosaic PNG export buttons (viz + export panel)"
```

---

## Task 6: Manual / e2e verification

**Files:**
- (No source changes unless verification surfaces a bug.)

- [ ] **Step 1: Run the app and exercise both buttons**

Run: `npm run dev` (plain browser) and/or `npm run tauri:dev` (desktop).

Verify, for each of Punchy / Balanced / Muted `vizStyle`:
1. **Visualize & Compare** section shows **Lightness PNG** and **Mosaic PNG** buttons next to the Style selector.
2. **Export & Tools** card shows the same two buttons by Download .txt / Copy.
3. Clicking **Lightness PNG** downloads `pixel-pal-lightness.png` — a single horizontal strip, colors darkest→lightest, matching the on-screen strip (flat colors, no scanlines).
4. Clicking **Mosaic PNG** downloads `pixel-pal-mosaic.png` — one row per ramp, each row full width, matching the on-screen mosaic.
5. Switching `vizStyle` and re-exporting produces a PNG for that style.
6. In Tauri: the native Save-As dialog appears and remembers the folder; in browser: the file lands in Downloads.

- [ ] **Step 2: Edge case — empty palette**

Clear the palette (or a state with no colors) and click each button.
Expected: "Nothing to export" feedback toast, no file written, no console error.

- [ ] **Step 3: Optional e2e (if adding to the Playwright suite)**

If the project wants automated coverage, add a desktop e2e spec that clicks the Export & Tools **Lightness PNG** button and asserts a download event fires. Follow the patterns in `tests/e2e/app.spec.ts`. This is optional; the unit tests on `computeVizData` are the required automated coverage.

- [ ] **Step 4: Full suite + build before wrap-up**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to decide merge / PR / cleanup.

---

## Self-Review Notes

- **Spec coverage:** working-palette Lightness PNG (Tasks 4-5), Mosaic PNG faithful-to-screen (Task 4 `drawMosaicPng`), current-`vizStyle` mirroring (Task 5 handlers), flat color / no scanlines (Task 4 draws raw hexes), buttons in both locations (Task 5 Steps 3-4), shared `computeVizData` to prevent drift (Tasks 2-3), `folderKey:'png'` + filenames (Task 5 handlers), unit-test-the-pure-helper-not-the-canvas (Tasks 2 & 4 notes), empty-palette guard (Task 5 + Task 6 Step 2). All covered.
- **Type consistency:** `computeVizData(ramps: string[][]) -> { allColors, sortedByL, mosaicRamps }`; `MosaicRow = { hexes: string[]; originalIdx: number }`; `drawLightnessStripPng(sortedHexes)`, `drawMosaicPng(rows)` — names identical across Tasks 2, 4, 5.
- **Out of scope (unchanged):** comparison-slot exports, baked labels, custom resolution.
