# Cross-palette adjacency check (#134)

**Date:** 2026-07-15
**Issue:** #134 — Cross-palette adjacency check: catch clashes between two saved
palettes, not just within one
**Approach:** Rectangular ΔE_OK heatmap section inside the existing
Visualize & Compare two-column mode. No new palette picker — Slot B *is* the
second-palette picker.

This spec is written to be executed end-to-end by a smaller model. Every step
names exact files, symbols, and insertion points, and includes code sketches
that are meant to be used nearly verbatim. Decisions on the issue's open
questions are already made below — do not re-litigate them.

---

## Problem

`AdjacencyMatrix.tsx` computes pairwise ΔE_OK only *within* one palette. Two
palettes that are each internally clean (character vs. background) can still
clash when composited on screen — e.g. a character outline shade nearly
identical to a background midtone. There is no way to check cross-palette
pairs today.

## Resolved open questions (from the issue)

1. **UI placement:** a new full-width sub-section inside
   `VizComparePanel.tsx`, rendered **only when two-column compare is active**
   (`sbsRight !== null`). The existing Slot A / Slot B dropdowns already offer
   the working palette, classic presets, and saved palettes — they become the
   two inputs for free. No mode toggle on the square matrix, no new panel.
2. **Second palette context:** identical to the existing compare columns —
   `getSnapshotForSlot(slot, payload)` → `buildRampsForSnapshot(snap, vizStyle)`.
   The saved payload's own ramp settings (its own hardware lock, overrides,
   hidden shades) apply, with the shared `vizStyle` selector, exactly like the
   per-slot views above it. Hidden shades are already filtered by
   `buildRampsForSnapshot`, satisfying the issue's "visible shades" wording.
3. **Export:** on-screen only for v1. The `useExport` PNG pattern takes one
   snapshot; a cross export needs two, so it's deferred (listed under
   Follow-ups). Hover readout + closest-pair line cover the reporting need.

Two further scope decisions:

- **Heatmap only** (no pair-split view). The rectangular shape plus
  heatmap-only rendering keeps it visually distinct from the square matrix,
  as the issue requests.
- **Always all unique visible shades** (`computeVizData(...).allColors`) on
  both axes. The `matrixColorSet` (All colors/Bases) and `matrixView`
  (Pair/Heatmap) toggles deliberately do NOT apply here — silhouette clash is
  a shade-level problem, and bases-only would hide exactly the near-duplicate
  midtones this view exists to catch.

Only **cross-set** pairs are shown by construction: rows come from palette A,
columns from palette B, so within-A and within-B pairs (already covered by
each slot's own compact adjacency matrix) never appear — no double-reporting.

## What already exists (verified 2026-07-15)

- `src/components/panels/VizComparePanel.tsx` already computes
  `leftSnap`/`rightSnap` (lines ~161-162) via `getSnapshotForSlot`, has
  `isTwoColumn = sbsRight !== null` (line ~163), and already imports
  `computeVizData` (`../../lib/strip-export`) and `buildRampsForSnapshot`
  (`../../lib/snapshot-ramps`). It also defines a `vizSub(subKey, title,
  controls, compact, body)` helper (line ~165) that renders a collapsible
  bordered card when `compact=false`, persisted via `vizSubOpen`/`toggleVizSub`
  (arbitrary string keys are fine — it's a plain record in `usePanelLayout`).
- `src/lib/strip-export.ts` has `drawAdjacencyMatrix` (square; the model for
  the new rectangular function) plus the private constants `MATRIX_NA` and
  `MATRIX_DIAG` the new function reuses.
- `src/lib/viz-interaction.ts` has `adjacencyDeltaE`, `normalizeDeltaE`,
  `heatColor` — all reused unchanged.
- `src/components/AdjacencyMatrix.tsx` is the model for the new component
  (canvas sizing, hover readout, `imageRendering: 'pixelated'`).
- Tests: `tests/unit/viz-interaction.spec.ts`, `tests/unit/strip-export.spec.ts`,
  and `tests/unit/VizComparePanel.spec.tsx` all exist. The panel spec already
  has a two-column fixture: `{ sbsRight: 'working', getSnapshotForSlot: () =>
  ({ baseColors: ['#ff0000'], aiColorNames: [] }) }` (line ~176) — reuse it.
- `src/lib/snapshot-ramps.ts` — `buildRampsForSnapshot(snapshot, style)` is
  pure and works in jsdom; a snapshot only *requires* `baseColors`.

## Execution notes (read before editing)

- **Editing tools:** a `PreToolUse` hook hard-blocks the built-in Edit tool on
  `src/**/*.ts(x)`. Create the NEW file with Write; edit the three EXISTING
  `src/` files with Serena (`insert_after_symbol` / `replace_content`), per
  CLAUDE.md. Test files under `tests/` and docs are not blocked.
- **Verification gates, run after each step:** `npm test` (vitest) and
  `npm run build` (tsc + vite). jsdom has no 2D canvas context —
  `getContext('2d')` returns null — so tests must only assert on pure
  functions and DOM text, never on canvas pixels (the components already
  guard `if (!ctx) return;`).
- **Commits:** three commits in the order of the steps below, messages
  suggested per step. Do not bump any version (see Versioning at the end).

---

## Step 1 — lib: metric helper + rectangular draw function

**Commit:** `feat: cross-palette adjacency lib (closestCrossPair + drawCrossAdjacencyMatrix) (#134)`

### 1a. `src/lib/viz-interaction.ts` — add after `adjacencyDeltaE`

```ts
// Closest (most similar) cross-set pair between two hex lists — the headline
// clash readout for the cross-palette adjacency view. Row-major first
// occurrence wins ties (deterministic). Unparseable hexes are skipped; null
// when either list is empty or no pair parses.
export interface CrossPair { a: string; b: string; dE: number }
export function closestCrossPair(as: string[], bs: string[]): CrossPair | null {
  let best: CrossPair | null = null;
  for (const a of as) {
    for (const b of bs) {
      const dE = adjacencyDeltaE(a, b);
      if (dE === null) continue;
      if (best === null || dE < best.dE) best = { a, b, dE };
    }
  }
  return best;
}
```

### 1b. `src/lib/strip-export.ts` — add after `drawAdjacencyMatrix`

Mirrors `drawAdjacencyMatrix`'s style (two ΔE passes, header swatch strips,
`MATRIX_NA`/`MATRIX_DIAG` constants already defined in this file), but
rectangular and heatmap-only. Rows = palette A shades, columns = palette B
shades; every cell is a cross-set pair, so there is no diagonal case.

```ts
// Rectangular cross-palette adjacency grid: rows = rowColors (palette A),
// columns = colColors (palette B). Heatmap only — every cell is a cross-set
// pair (no diagonal), shaded by ΔE_OK normalized to this grid's max: dark =
// near-duplicate across the two palettes (the clash signal), bright = far
// apart. Header strips show the actual swatches (top = B, left = A).
export function drawCrossAdjacencyMatrix(
  ctx: CanvasRenderingContext2D,
  rowColors: string[],
  colColors: string[],
  opts: { cell: number; header?: number },
): void {
  const nRows = rowColors.length;
  const nCols = colColors.length;
  const cell = opts.cell;
  const header = opts.header ?? 0;
  ctx.imageSmoothingEnabled = false;

  if (header > 0) {
    ctx.fillStyle = MATRIX_DIAG; // neutral top-left corner
    ctx.fillRect(0, 0, header, header);
    for (let j = 0; j < nCols; j++) {
      ctx.fillStyle = colColors[j];
      ctx.fillRect(header + j * cell, 0, cell, header); // top strip = B
    }
    for (let i = 0; i < nRows; i++) {
      ctx.fillStyle = rowColors[i];
      ctx.fillRect(0, header + i * cell, header, cell); // left strip = A
    }
  }

  // Same two-pass shape as drawAdjacencyMatrix: max pass, then fill pass.
  let maxDE = 0;
  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) {
      const d = adjacencyDeltaE(rowColors[i], colColors[j]);
      if (d !== null && d > maxDE) maxDE = d;
    }
  }

  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) {
      const d = adjacencyDeltaE(rowColors[i], colColors[j]);
      ctx.fillStyle = d === null ? MATRIX_NA : heatColor(normalizeDeltaE(d, maxDE));
      ctx.fillRect(header + j * cell, header + i * cell, cell, cell);
    }
  }
}
```

(`adjacencyDeltaE`, `normalizeDeltaE`, `heatColor` are already imported at the
top of `strip-export.ts` — no import changes needed.)

### 1c. Tests

Append to `tests/unit/viz-interaction.spec.ts`:

- `closestCrossPair` picks the minimum-ΔE cross pair:
  `closestCrossPair(['#000000', '#ff0000'], ['#fe0000', '#ffffff'])` →
  `a === '#ff0000'`, `b === '#fe0000'`, `dE` close to 0 (`toBeLessThan(0.01)`).
- Identical color across sets → `dE === 0`
  (`closestCrossPair(['#123456'], ['#123456'])`).
- Tie determinism: with two equally distant pairs, row-major first wins
  (e.g. `closestCrossPair(['#000000', '#000000'], ['#ffffff'])` returns the
  first `a`); simplest robust assertion: result is not null and `dE` equals
  `adjacencyDeltaE('#000000', '#ffffff')`.
- Unparseable hexes skipped: `closestCrossPair(['nope', '#000000'], ['#000000'])`
  → `{ a: '#000000', b: '#000000', dE: 0 }`.
- Empty either side → null. All-invalid → null.

Do NOT add canvas tests for `drawCrossAdjacencyMatrix` (jsdom has no 2D
context; the existing `drawAdjacencyMatrix` is likewise untested directly).

---

## Step 2 — component: `src/components/CrossAdjacencyMatrix.tsx` (new file)

**Commit:** `feat: CrossAdjacencyMatrix component (#134)`

Modeled directly on `AdjacencyMatrix.tsx` (same canvas/effect/hover pattern),
rectangular, with a closest-pair summary line under the readout. Create with
Write:

```tsx
// src/components/CrossAdjacencyMatrix.tsx
import React, { useEffect, useRef, useState } from 'react';
import { drawCrossAdjacencyMatrix } from '../lib/strip-export';
import { adjacencyDeltaE, closestCrossPair } from '../lib/viz-interaction';

interface CrossAdjacencyMatrixProps {
  rowColors: string[];   // palette A visible shades (rows)
  colColors: string[];   // palette B visible shades (columns)
  borderColor?: string;
}

// Rectangular cross-palette ΔE_OK heatmap: rows = slot A, columns = slot B.
// Only cross-set pairs are shown (within-palette pairs live in each slot's
// own square adjacency matrix). Dark cells = near-duplicates across the two
// palettes — the silhouette-loss clash signal.
export function CrossAdjacencyMatrix({ rowColors, colColors, borderColor }: CrossAdjacencyMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [readout, setReadout] = useState('');
  const nRows = rowColors.length;
  const nCols = colColors.length;
  const maxW = 340;
  const nMax = Math.max(nRows, nCols);
  const cell = nMax > 0 ? Math.max(4, Math.min(20, Math.floor(maxW / nMax))) : 8;
  const header = Math.max(6, Math.round(cell * 0.5));
  const width = header + nCols * cell;
  const height = header + nRows * cell;
  const colorKey = `${rowColors.join(',')}|${colColors.join(',')}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (nRows > 0 && nCols > 0) drawCrossAdjacencyMatrix(ctx, rowColors, colColors, { cell, header });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on colorKey like AdjacencyMatrix
  }, [colorKey, cell, header, width, height, nRows, nCols]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (nRows === 0 || nCols === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx - header;
    const cy = (e.clientY - rect.top) * sy - header;
    if (cx < 0 || cy < 0) { setReadout(''); return; }
    const j = Math.floor(cx / cell);
    const i = Math.floor(cy / cell);
    if (i < 0 || j < 0 || i >= nRows || j >= nCols) { setReadout(''); return; }
    const d = adjacencyDeltaE(rowColors[i], colColors[j]);
    setReadout(`A ${rowColors[i].toUpperCase()} ↔ B ${colColors[j].toUpperCase()} · ΔE ${d === null ? 'n/a' : d.toFixed(3)}`);
  };

  if (nRows === 0 || nCols === 0) return null;
  const closest = closestCrossPair(rowColors, colColors);
  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setReadout('')}
        style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto', display: 'block', border: `1px solid ${borderColor ?? '#444'}` }}
      />
      <div className="text-[10px] text-cyan-100/70 font-mono mt-1 h-4" aria-live="polite">{readout || ' '}</div>
      {closest && (
        <div className="text-[10px] text-cyan-100/60 font-mono mt-0.5">
          Closest cross-pair: A {closest.a.toUpperCase()} ↔ B {closest.b.toUpperCase()} · ΔE {closest.dE.toFixed(3)}
        </div>
      )}
    </div>
  );
}
```

### Tests — new file `tests/unit/CrossAdjacencyMatrix.spec.tsx`

jsdom-safe (asserts DOM text, never canvas pixels):

- Renders a `canvas` and the closest-pair line for
  `rowColors={['#000000', '#ff0000']} colColors={['#fe0000', '#ffffff']}` —
  assert text matches `/Closest cross-pair: A #FF0000 ↔ B #FE0000/`.
- Returns null (empty container, `container.firstChild === null`) when
  `rowColors` is empty; same when `colColors` is empty.

Use `render` from `@testing-library/react` directly — the component has no
context dependencies.

---

## Step 3 — wiring, docs, changelog

**Commit:** `feat: cross-palette adjacency section in Visualize & Compare (#134)`

### 3a. `src/components/panels/VizComparePanel.tsx`

1. Add import (with the other component imports near the top):
   `import { CrossAdjacencyMatrix } from '../CrossAdjacencyMatrix';`
2. In the returned JSX, the two-column branch currently ends like this
   (immediately before the final `<p className="text-[10px] ... >Style applies
   to all views...` note):

```tsx
        ) : (
          <div>
            {renderSlotViz(leftSnap, 'Slot A', 'left', false)}
          </div>
        )}
```

   Insert AFTER that closing `)}` and BEFORE the final `<p ...>` note:

```tsx
        {isTwoColumn && (() => {
          const okA = leftSnap && Array.isArray(leftSnap.baseColors) && leftSnap.baseColors.length > 0;
          const okB = rightSnap && Array.isArray(rightSnap.baseColors) && rightSnap.baseColors.length > 0;
          if (!okA || !okB) return null;
          const colorsA = computeVizData(buildRampsForSnapshot(leftSnap, vizStyle)).allColors;
          const colorsB = computeVizData(buildRampsForSnapshot(rightSnap, vizStyle)).allColors;
          if (colorsA.length === 0 || colorsB.length === 0) return null;
          return vizSub('crossAdjacency', 'Cross-Palette Adjacency (A × B)', null, false, (
            <>
              <p className="text-[11px] text-cyan-100/70 italic mb-2">Every slot-A shade paired with every slot-B shade (rows = A, columns = B). Dark cells are near-duplicates ACROSS the two palettes — e.g. a character outline melting into a background midtone. Within-palette pairs live in each slot&apos;s own Adjacency view. Hover for the exact pair.</p>
              <div className="flex justify-center overflow-x-auto">
                <CrossAdjacencyMatrix rowColors={colorsA} colColors={colorsB} borderColor={t.vizDataBorder} />
              </div>
              <div className="text-[10px] text-cyan-100/50 text-center font-mono mt-2 bg-black/60 rounded px-1">
                A: {getSlotLabel(sbsLeft, sbsLeftPayload)} · B: {getSlotLabel(sbsRight, sbsRightPayload)}
              </div>
            </>
          ));
        })()}
```

   Notes: `vizSub`, `leftSnap`, `rightSnap`, `isTwoColumn`, `getSlotLabel`,
   `t`, and both imports are already in scope. `buildRampsForSnapshot` is
   re-run here for both slots (also run inside `renderSlotViz`); that matches
   the panel's existing recompute-per-render pattern and is cheap at these
   sizes. The `vizSub` card gives collapse/expand for free (persisted under
   the `crossAdjacency` key).

### 3b. Tests — append to `tests/unit/VizComparePanel.spec.tsx`

Reuse the existing fixture pattern (see the two-column tests around line 176).
The section title contains `×` (U+00D7) — match with a regex or the exact
string `'Cross-Palette Adjacency (A × B)'`.

```tsx
test('two-column mode shows the cross-palette adjacency section', () => {
  const snap = { baseColors: ['#ff0000'], aiColorNames: [] };
  wrap({ sbsRight: 'working', getSnapshotForSlot: () => snap });
  expect(screen.getByText('Cross-Palette Adjacency (A × B)')).toBeInTheDocument();
});

test('single-column mode has no cross-palette adjacency section', () => {
  const snap = { baseColors: ['#ff0000'], aiColorNames: [] };
  wrap({ getSnapshotForSlot: () => snap });
  expect(screen.queryByText('Cross-Palette Adjacency (A × B)')).toBeNull();
});

test('cross-palette section absent when a slot has no snapshot', () => {
  wrap({ sbsRight: 'working', getSnapshotForSlot: () => null });
  expect(screen.queryByText('Cross-Palette Adjacency (A × B)')).toBeNull();
});
```

### 3c. Docs + changelog (plain Edit is fine here)

- `docs/ARCHITECTURE.md`: in the `src/components` file map (near the
  `AdjacencyMatrix.tsx` line, ~19), add:
  `CrossAdjacencyMatrix.tsx  viz: rectangular cross-palette ΔE_OK heatmap (A rows × B cols)`.
  In the viz/strip-export section (~333), mention `drawCrossAdjacencyMatrix`
  alongside the other draw functions.
- `CHANGELOG.md`: under `## [Unreleased]` → `### Added`:
  `Cross-palette adjacency check: with two compare slots active, a rectangular ΔE_OK heatmap flags near-duplicate shades ACROSS slot A and slot B (rows = A, columns = B), with hover readout and closest-pair summary (#134).`

### 3d. Final verification

1. `npm test` — full suite green.
2. `npm run build` — tsc + vite green.
3. Grep gate (no dangling refs risk here since nothing is removed, but
   confirm): `grep -rn "CrossAdjacencyMatrix\|drawCrossAdjacencyMatrix\|closestCrossPair" src tests`
   — every definition has at least one consumer.
4. Manual smoke (if an interactive environment is available): `npm run dev`,
   open Visualize & Compare, set Slot B to a classic palette, confirm the
   Cross-Palette Adjacency card renders below the two columns, hover updates
   the readout, and clearing Slot B removes the card. Skip if headless.

---

## Versioning

New user-facing feature → propose **MINOR** (per CLAUDE.md pre-1.0 rules).
Do NOT run `npm version`, touch `tauri.conf.json`/`Cargo.toml`, or tag —
state "proposing vX.Y.0 because this adds the cross-palette adjacency view
(#134)" and wait for the user's explicit OK. The CHANGELOG entry stays under
`[Unreleased]` until then.

## Follow-ups (out of scope, do not implement)

- PNG export of the cross matrix (needs a two-snapshot variant of the
  `useExport` pattern; issue open question 3 answered as on-screen-only v1).
- Optional Bases-only axis toggle for very large palettes.
- Absolute ΔE clash threshold (e.g. flag pairs below a fixed ΔE) instead of
  per-grid relative normalization.
- Playwright e2e for the compare flow.
