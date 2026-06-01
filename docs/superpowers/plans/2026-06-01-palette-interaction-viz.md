# Palette Interaction Visualizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two canvas-rendered palette-interaction views — an adjacency matrix (pair / ΔE_OK heatmap) and a dither-blend preview — into the Visualize & Compare section, with PNG export for both.

**Architecture:** Pure logic (metric, heat color, dither pattern, axis-color selection) lives in a new `src/lib/viz-interaction.ts` and is fully unit-tested. Canvas draw functions + PNG wrappers live in `src/lib/strip-export.ts` beside the existing `drawLightnessStripPng`/`drawMosaicPng`. Two small React components (`AdjacencyMatrix`, `DitherBlend`) own a `<canvas>` + draw effect and are wired into `renderSlotViz` so they appear in the working palette and both compare slots. Three app-level toggles (matrix color-set, matrix view, dither pattern) live in the Style toolbar next to the new export buttons, mirroring how `vizStyle` already drives all slots.

**Tech Stack:** Vite + React 19 + TS, vitest unit tests. Reuses `computeVizData`, `hexToOklch`/`deltaEOK` (oklch.ts), `saveFile` PNG path, `buildRampsForSnapshot`.

**Spec:** `docs/superpowers/specs/2026-06-01-palette-interaction-viz-design.md`

**Testing note (read before starting):** jsdom has no real canvas 2D raster, so — exactly as the existing `drawLightnessStripPng`/`drawMosaicPng` have **no** unit tests — Tasks 3–8 (canvas draws, React components, App wiring) are verified by `npm run build` + manual `npm run dev` smoke, **not** by unit tests. Unit tests cover the pure logic in Tasks 1–2 only. Do not attempt to assert rendered pixels in vitest.

---

## File Structure

- **Create** `src/lib/viz-interaction.ts` — pure helpers: types, `BAYER_4X4`, `adjacencyDeltaE`, `normalizeDeltaE`, `heatColor`, `ditherPixelIsB`, `matrixColors`.
- **Create** `tests/unit/viz-interaction.spec.ts` — unit tests for the above.
- **Modify** `src/lib/strip-export.ts` — add `drawAdjacencyMatrix` + `drawAdjacencyMatrixPng`, `drawDitherBlend` + `drawDitherBlendPng` (consume viz-interaction; reuse the existing private `canvasToPngBlob`).
- **Create** `src/components/AdjacencyMatrix.tsx` — canvas + draw effect + hover readout (full-size only).
- **Create** `src/components/DitherBlend.tsx` — canvas + draw effect.
- **Modify** `src/App.tsx` — toggle state, toolbar toggle buttons, two export buttons, two export handlers, and wiring both components into `renderSlotViz` after the Mosaic block.

---

### Task 1: viz-interaction.ts — matrix metric + color selection (pure, TDD)

**Files:**
- Create: `src/lib/viz-interaction.ts`
- Test: `tests/unit/viz-interaction.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/viz-interaction.spec.ts
import { describe, it, expect } from 'vitest';
import {
  adjacencyDeltaE, normalizeDeltaE, heatColor, matrixColors,
} from '../../src/lib/viz-interaction';

describe('adjacencyDeltaE', () => {
  it('is 0 for identical colors', () => {
    expect(adjacencyDeltaE('#3366cc', '#3366cc')).toBeCloseTo(0, 6);
  });
  it('is positive and symmetric for distinct colors', () => {
    const d1 = adjacencyDeltaE('#c0392b', '#2980b9');
    const d2 = adjacencyDeltaE('#2980b9', '#c0392b');
    expect(d1).toBeGreaterThan(0);
    expect(d1).toBeCloseTo(d2 as number, 6);
  });
  it('returns null when either hex is invalid', () => {
    expect(adjacencyDeltaE('not-a-hex', '#000000')).toBeNull();
    expect(adjacencyDeltaE('#000000', 'nope')).toBeNull();
  });
});

describe('normalizeDeltaE', () => {
  it('maps to 0..1 and clamps', () => {
    expect(normalizeDeltaE(0, 0.4)).toBe(0);
    expect(normalizeDeltaE(0.4, 0.4)).toBe(1);
    expect(normalizeDeltaE(0.8, 0.4)).toBe(1); // clamp high
    expect(normalizeDeltaE(-1, 0.4)).toBe(0);  // clamp low
  });
  it('returns 0 when max <= 0 (no divide-by-zero)', () => {
    expect(normalizeDeltaE(0, 0)).toBe(0);
  });
});

describe('heatColor', () => {
  it('is dark at 0 and hot at 1', () => {
    expect(heatColor(0)).toBe('rgb(25,25,30)');
    expect(heatColor(1)).toBe('rgb(220,50,45)');
  });
  it('red channel increases with t', () => {
    const r = (s: string) => Number(s.slice(4, s.indexOf(',')));
    expect(r(heatColor(0.8))).toBeGreaterThan(r(heatColor(0.2)));
  });
});

describe('matrixColors', () => {
  it('selects allColors or bases by colorSet', () => {
    const all = ['#000', '#111', '#222'];
    const bases = ['#abc'];
    expect(matrixColors('unique', all, bases)).toBe(all);
    expect(matrixColors('bases', all, bases)).toBe(bases);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/viz-interaction.spec.ts`
Expected: FAIL — cannot resolve `../../src/lib/viz-interaction`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/viz-interaction.ts
import { hexToOklch, deltaEOK } from './oklch';

export type MatrixColorSet = 'unique' | 'bases';
export type MatrixView = 'pair' | 'heatmap';
export type DitherPattern = 'checker' | 'bayer';

// Perceptual distance between two hex colors; null if either hex is invalid.
export function adjacencyDeltaE(aHex: string, bHex: string): number | null {
  const a = hexToOklch(aHex);
  const b = hexToOklch(bHex);
  if (!a || !b) return null;
  return deltaEOK(a, b);
}

// Normalize a ΔE into 0..1 against a reference max (clamped; safe when max<=0).
export function normalizeDeltaE(dE: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, dE / max));
}

// Hot/cold heat color for normalized 0..1. 0 = dark (near-duplicate), 1 = hot.
export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const r = Math.round(25 + (220 - 25) * x);
  const g = Math.round(25 + (50 - 25) * x);
  const b = Math.round(30 + (45 - 30) * x);
  return `rgb(${r},${g},${b})`;
}

// Axis color list for the matrix given the active color set.
export function matrixColors(
  colorSet: MatrixColorSet, allColors: string[], bases: string[],
): string[] {
  return colorSet === 'bases' ? bases : allColors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/viz-interaction.spec.ts`
Expected: PASS (matrix metric + color selection suites green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/viz-interaction.ts tests/unit/viz-interaction.spec.ts
git commit -m "feat: viz-interaction matrix metric + color-set helpers"
```

---

### Task 2: viz-interaction.ts — dither pattern logic (pure, TDD)

**Files:**
- Modify: `src/lib/viz-interaction.ts`
- Test: `tests/unit/viz-interaction.spec.ts`

- [ ] **Step 1: Write the failing test** (append to the existing spec file)

```ts
// append to tests/unit/viz-interaction.spec.ts
import { BAYER_4X4, ditherPixelIsB } from '../../src/lib/viz-interaction';

describe('BAYER_4X4', () => {
  it('is a 4x4 matrix of the 16 distinct values 0..15', () => {
    expect(BAYER_4X4.length).toBe(4);
    BAYER_4X4.forEach(row => expect(row.length).toBe(4));
    const flat = BAYER_4X4.flat().sort((a, b) => a - b);
    expect(flat).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});

describe('ditherPixelIsB', () => {
  it('checker uses (x+y) parity', () => {
    expect(ditherPixelIsB('checker', 0, 0)).toBe(false);
    expect(ditherPixelIsB('checker', 1, 0)).toBe(true);
    expect(ditherPixelIsB('checker', 0, 1)).toBe(true);
    expect(ditherPixelIsB('checker', 1, 1)).toBe(false);
  });
  it('bayer thresholds at the matrix midpoint (>=8 -> B)', () => {
    // BAYER_4X4[0][0] = 0  -> A ; BAYER_4X4[0][1] = 8 -> B
    expect(ditherPixelIsB('bayer', 0, 0)).toBe(false);
    expect(ditherPixelIsB('bayer', 1, 0)).toBe(true);
    // wraps every 4 px
    expect(ditherPixelIsB('bayer', 4, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/viz-interaction.spec.ts`
Expected: FAIL — `BAYER_4X4`/`ditherPixelIsB` are not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/lib/viz-interaction.ts`)

```ts
// 4x4 Bayer ordered-dither threshold matrix, values 0..15.
export const BAYER_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Which of the two source colors a dither pixel takes (true = colorB) for a
// 50/50 blend. Checker = (x+y) parity; Bayer = threshold vs the matrix mid (8).
export function ditherPixelIsB(pattern: DitherPattern, x: number, y: number): boolean {
  if (pattern === 'checker') return (x + y) % 2 === 1;
  return BAYER_4X4[y % 4][x % 4] >= 8;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/viz-interaction.spec.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/viz-interaction.ts tests/unit/viz-interaction.spec.ts
git commit -m "feat: viz-interaction dither pattern logic (checker + bayer)"
```

---

### Task 3: strip-export.ts — adjacency matrix canvas draw + PNG wrapper

**Files:**
- Modify: `src/lib/strip-export.ts`

No unit test (canvas raster; see Testing note). Verified by build + later smoke.

- [ ] **Step 1: Add the imports** at the top of `src/lib/strip-export.ts`, after the existing `import { dedupeHexes } from './hex-utils';` line:

```ts
import {
  adjacencyDeltaE, normalizeDeltaE, heatColor, ditherPixelIsB,
  type MatrixView, type DitherPattern,
} from './viz-interaction';
```

- [ ] **Step 2: Append the matrix draw + PNG wrapper** at the end of `src/lib/strip-export.ts`:

```ts
// --- Adjacency matrix ------------------------------------------------------

const MATRIX_NA = '#3a3a3a';        // cell fill when a hex fails to parse
const MATRIX_DIAG = '#111111';      // diagonal (identity) fill in heatmap mode

// Draw an N×N adjacency grid onto a provided context. Axes use `colors` order
// as-is (caller passes ramp-grouped order — never lightness-sorted; a sorted
// heatmap degenerates into the same corner gradient for every palette).
// `header` (px) reserves a top + left strip of the actual color swatches.
export function drawAdjacencyMatrix(
  ctx: CanvasRenderingContext2D,
  colors: string[],
  opts: { cell: number; view: MatrixView; header?: number },
): void {
  const n = colors.length;
  const cell = opts.cell;
  const header = opts.header ?? 0;
  ctx.imageSmoothingEnabled = false;

  if (header > 0) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(header + i * cell, 0, cell, header); // top strip
      ctx.fillRect(0, header + i * cell, header, cell); // left strip
    }
  }

  let maxDE = 0;
  if (opts.view === 'heatmap') {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = adjacencyDeltaE(colors[i], colors[j]);
        if (d !== null && d > maxDE) maxDE = d;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = header + j * cell;
      const y = header + i * cell;
      if (opts.view === 'heatmap') {
        if (i === j) { ctx.fillStyle = MATRIX_DIAG; ctx.fillRect(x, y, cell, cell); continue; }
        const d = adjacencyDeltaE(colors[i], colors[j]);
        ctx.fillStyle = d === null ? MATRIX_NA : heatColor(normalizeDeltaE(d, maxDE));
        ctx.fillRect(x, y, cell, cell);
      } else {
        // Pair split: row color (colors[i]) fills the cell; column color
        // (colors[j]) overlays the lower-right triangle. Diagonal = solid.
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, y, cell, cell);
        if (i === j) continue;
        ctx.fillStyle = colors[j];
        ctx.beginPath();
        ctx.moveTo(x + cell, y);
        ctx.lineTo(x + cell, y + cell);
        ctx.lineTo(x, y + cell);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// Off-screen render of the matrix → PNG Blob. Cell size scales down with N so
// large palettes stay bounded. Precondition: callers guard colors.length > 0.
export function drawAdjacencyMatrixPng(
  colors: string[],
  opts: { view: MatrixView },
): Promise<Blob> {
  const n = colors.length;
  const cell = n > 0 ? Math.max(8, Math.floor(640 / n)) : 8;
  const header = Math.max(8, Math.round(cell * 0.6));
  const size = Math.max(1, header + n * cell);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  drawAdjacencyMatrix(ctx, colors, { cell, view: opts.view, header });
  return canvasToPngBlob(canvas);
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: PASS (tsc --noEmit + vite build, no type errors). `DitherPattern`/`ditherPixelIsB` are imported but unused until Task 4 — TS won't error (they're used in the same module next task); if an unused-import lint fails the build, proceed directly to Task 4 which consumes them, then re-run.

- [ ] **Step 4: Commit**

```bash
git add src/lib/strip-export.ts
git commit -m "feat: drawAdjacencyMatrix + PNG wrapper"
```

---

### Task 4: strip-export.ts — dither-blend canvas draw + PNG wrapper

**Files:**
- Modify: `src/lib/strip-export.ts`

- [ ] **Step 1: Append the dither draw + PNG wrapper** at the end of `src/lib/strip-export.ts`:

```ts
// --- Dither-blend preview --------------------------------------------------

const DITHER_ROW_H = 40;    // px row height
const DITHER_SOLID_W = 44;  // px solid shade cell width
const DITHER_BLEND_W = 28;  // px blend cell width
const DITHER_SUB = 8;       // checker/bayer subdivisions per blend cell

// Per ramp row: solid shade · dither blend(shadeᵢ, shadeᵢ₊₁) · solid shade …
// Blend cells render the pattern at a visible-pixel scale (DITHER_SUB blocks),
// NOT a shrunk-to-solid midpoint — the texture is the point of the feature.
export function drawDitherBlend(
  ctx: CanvasRenderingContext2D,
  rows: string[][],
  opts: { pattern: DitherPattern; rowH?: number; solidW?: number; blendW?: number; sub?: number },
): void {
  const rowH = opts.rowH ?? DITHER_ROW_H;
  const solidW = opts.solidW ?? DITHER_SOLID_W;
  const blendW = opts.blendW ?? DITHER_BLEND_W;
  const sub = opts.sub ?? DITHER_SUB;
  ctx.imageSmoothingEnabled = false;

  rows.forEach((row, r) => {
    const y = r * rowH;
    let x = 0;
    for (let i = 0; i < row.length; i++) {
      ctx.fillStyle = row[i];
      ctx.fillRect(x, y, solidW, rowH);
      x += solidW;
      if (i < row.length - 1) {
        const a = row[i];
        const b = row[i + 1];
        const px = blendW / sub;
        const py = rowH / sub;
        for (let gx = 0; gx < sub; gx++) {
          for (let gy = 0; gy < sub; gy++) {
            ctx.fillStyle = ditherPixelIsB(opts.pattern, gx, gy) ? b : a;
            ctx.fillRect(Math.round(x + gx * px), Math.round(y + gy * py), Math.ceil(px), Math.ceil(py));
          }
        }
        x += blendW;
      }
    }
  });
}

// Off-screen render of the dither preview → PNG Blob. Width tracks the longest
// ramp; shorter rows draw left-aligned. Precondition: callers guard rows.length > 0.
export function drawDitherBlendPng(
  rows: string[][],
  opts: { pattern: DitherPattern },
): Promise<Blob> {
  const solidW = 48;
  const blendW = 30;
  const rowH = 48;
  const sub = 8;
  const maxCells = rows.reduce((m, row) => Math.max(m, row.length), 0);
  const width = Math.max(1, maxCells * solidW + Math.max(0, maxCells - 1) * blendW);
  const height = Math.max(1, rows.length * rowH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  drawDitherBlend(ctx, rows, { pattern: opts.pattern, rowH, solidW, blendW, sub });
  return canvasToPngBlob(canvas);
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: PASS. All viz-interaction imports are now consumed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/strip-export.ts
git commit -m "feat: drawDitherBlend + PNG wrapper"
```

---

### Task 5: AdjacencyMatrix component

**Files:**
- Create: `src/components/AdjacencyMatrix.tsx`

No unit test (canvas/DOM; smoke-verified in Task 9).

- [ ] **Step 1: Write the component**

```tsx
// src/components/AdjacencyMatrix.tsx
import { useEffect, useRef, useState } from 'react';
import { drawAdjacencyMatrix } from '../lib/strip-export';
import { adjacencyDeltaE, matrixColors, type MatrixColorSet, type MatrixView } from '../lib/viz-interaction';

interface AdjacencyMatrixProps {
  allColors: string[];
  bases: string[];
  colorSet: MatrixColorSet;
  view: MatrixView;       // caller passes 'heatmap' for compact slots
  compact: boolean;
  borderColor?: string;
}

export function AdjacencyMatrix({
  allColors, bases, colorSet, view, compact, borderColor,
}: AdjacencyMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [readout, setReadout] = useState('');
  const colors = matrixColors(colorSet, allColors, bases);
  const n = colors.length;
  const maxW = compact ? 180 : 340;
  const cell = n > 0 ? Math.max(4, Math.min(compact ? 14 : 24, Math.floor(maxW / n))) : 8;
  const header = Math.max(6, Math.round(cell * 0.5));
  const size = header + n * cell;
  const colorKey = colors.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, size);
    canvas.height = Math.max(1, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (n > 0) drawAdjacencyMatrix(ctx, colors, { cell, view, header });
  }, [colorKey, view, cell, header, size, n]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (compact || n === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx - header;
    const cy = (e.clientY - rect.top) * sy - header;
    if (cx < 0 || cy < 0) { setReadout(''); return; }
    const j = Math.floor(cx / cell);
    const i = Math.floor(cy / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) { setReadout(''); return; }
    if (i === j) { setReadout(`${colors[i].toUpperCase()} (self)`); return; }
    const d = adjacencyDeltaE(colors[i], colors[j]);
    setReadout(`${colors[i].toUpperCase()} ↔ ${colors[j].toUpperCase()} · ΔE ${d === null ? 'n/a' : d.toFixed(3)}`);
  };

  if (n === 0) return null;
  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setReadout('')}
        style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto', display: 'block', border: `1px solid ${borderColor ?? '#444'}` }}
      />
      {!compact && (
        <div className="text-[10px] text-cyan-100/70 font-mono mt-1 h-4" aria-live="polite">{readout || ' '}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/AdjacencyMatrix.tsx
git commit -m "feat: AdjacencyMatrix component (canvas + hover readout)"
```

---

### Task 6: DitherBlend component

**Files:**
- Create: `src/components/DitherBlend.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/DitherBlend.tsx
import { useEffect, useRef } from 'react';
import { drawDitherBlend } from '../lib/strip-export';
import { type DitherPattern } from '../lib/viz-interaction';

interface DitherBlendProps {
  rows: string[][];
  pattern: DitherPattern;
  compact: boolean;
  borderColor?: string;
}

export function DitherBlend({ rows, pattern, compact, borderColor }: DitherBlendProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowH = compact ? 26 : 38;
  const solidW = compact ? 30 : 44;
  const blendW = compact ? 20 : 28;
  const sub = 8;
  const maxCells = rows.reduce((m, row) => Math.max(m, row.length), 0);
  const width = maxCells > 0 ? maxCells * solidW + Math.max(0, maxCells - 1) * blendW : 1;
  const height = rows.length > 0 ? rows.length * rowH : 1;
  const rowsKey = JSON.stringify(rows);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (rows.length > 0) drawDitherBlend(ctx, rows, { pattern, rowH, solidW, blendW, sub });
  }, [rowsKey, pattern, rowH, solidW, blendW, width, height]);

  if (rows.length === 0) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto', display: 'block', border: `1px solid ${borderColor ?? '#444'}` }}
    />
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DitherBlend.tsx
git commit -m "feat: DitherBlend component (canvas)"
```

---

### Task 7: App.tsx — toggle state, imports, export handlers, toolbar buttons

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend the strip-export import and add component + helper imports.**

Find the existing line (~26):
```ts
import { computeVizData, drawLightnessStripPng, drawMosaicPng } from './lib/strip-export';
```
Replace with:
```ts
import { computeVizData, drawLightnessStripPng, drawMosaicPng, drawAdjacencyMatrixPng, drawDitherBlendPng } from './lib/strip-export';
import { AdjacencyMatrix } from './components/AdjacencyMatrix';
import { DitherBlend } from './components/DitherBlend';
```
Then ensure `dedupeHexes` is imported (used by the matrix export handler). If `src/App.tsx` does not already import it, add:
```ts
import { dedupeHexes } from './lib/hex-utils';
```
(Check first with a search for `dedupeHexes` in `src/App.tsx`; only add if absent.)

- [ ] **Step 2: Add the three toggle state hooks.**

Find (~line 1005):
```js
  const [vizStyle, setVizStyle] = useState('punchy');
```
Add immediately after it:
```js
  const [matrixColorSet, setMatrixColorSet] = useState('unique'); // 'unique' | 'bases'
  const [matrixView, setMatrixView] = useState('pair');           // 'pair' | 'heatmap'
  const [ditherPattern, setDitherPattern] = useState('checker');  // 'checker' | 'bayer'
```

- [ ] **Step 3: Add the two export handlers** immediately after the `exportMosaicPng` handler (after its closing `};`, ~line 4858):

```js
  // Export the Slot-A adjacency matrix as a PNG, mirroring the on-screen
  // matrix (current vizStyle, color-set, and view-mode toggles).
  const exportMatrixPng = async (snap) => {
    try {
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { allColors } = computeVizData(ramps);
      const colors = matrixColorSet === 'bases'
        ? dedupeHexes(Array.isArray(snap?.baseColors) ? snap.baseColors : [])
        : allColors;
      if (colors.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawAdjacencyMatrixPng(colors, { view: matrixView });
      const result = await saveFile({
        defaultName: 'pixel-pal-adjacency.png',
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

  // Export the Slot-A dither-blend preview as a PNG (current vizStyle + pattern).
  const exportDitherPng = async (snap) => {
    try {
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r) => r.hexes);
      if (rows.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawDitherBlendPng(rows, { pattern: ditherPattern });
      const result = await saveFile({
        defaultName: 'pixel-pal-dither.png',
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

- [ ] **Step 4: Add toggle + export buttons to the Style toolbar.**

Find the Mosaic PNG button and the `</div>` that closes the toolbar row (the button ends at ~line 7105, `</div>` at ~7106). Insert the following block immediately **after** the Mosaic PNG `</button>` and **before** that closing `</div>`:

```jsx
                    <span className="mx-1 h-5 w-px bg-cyan-500/40" aria-hidden="true" />
                    <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Matrix:</span>
                    <button onClick={() => setMatrixColorSet(s => s === 'unique' ? 'bases' : 'unique')} title="Toggle matrix colors between all unique shades and ramp bases" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}>{matrixColorSet === 'unique' ? 'All colors' : 'Bases'}</button>
                    <button onClick={() => setMatrixView(v => v === 'pair' ? 'heatmap' : 'pair')} title="Toggle matrix between pair-split and ΔE_OK heatmap" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}>{matrixView === 'pair' ? 'Pair' : 'Heatmap'}</button>
                    <button onClick={() => exportMatrixPng(getSnapshotForSlot(sbsLeft, sbsLeftPayload))} title="Download the Adjacency Matrix as a PNG (current style)" className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 hover:scale-105 flex items-center gap-2" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Matrix PNG</button>
                    <span className="mx-1 h-5 w-px bg-cyan-500/40" aria-hidden="true" />
                    <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Dither:</span>
                    <button onClick={() => setDitherPattern(p => p === 'checker' ? 'bayer' : 'checker')} title="Toggle dither pattern between 2×2 checkerboard and 4×4 Bayer" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}>{ditherPattern === 'checker' ? '2×2 Checker' : '4×4 Bayer'}</button>
                    <button onClick={() => exportDitherPng(getSnapshotForSlot(sbsLeft, sbsLeftPayload))} title="Download the Dither-Blend preview as a PNG (current style)" className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 hover:scale-105 flex items-center gap-2" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Dither PNG</button>
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: matrix/dither toggles, export handlers, toolbar buttons"
```

---

### Task 8: App.tsx — render both views in renderSlotViz

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Insert the two view blocks after the Mosaic block.**

In `renderSlotViz`, find the end of the Mosaic block — the `</div>` closing the mosaic section, immediately followed by:
```jsx
                {compact && <div className="text-[10px] text-cyan-100/50 text-center font-mono">{ramps.length} ramps, {allColors.length} unique colors</div>}
```
Insert the following **before** that `{compact && ...}` line (i.e. after the Mosaic block's closing `</div>`):

```jsx
                <div>
                  <h4 className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-cyan-200 uppercase tracking-widest mb-1`}>
                    {compact ? 'Adjacency' : '▸ Adjacency Matrix'}
                  </h4>
                  {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">Every color paired with every other. Pair mode shows the two together; heatmap shades each cell by perceptual distance (ΔE_OK) — dark = near-duplicate pair, bright = outlier. Hover for the exact pair. (Compare slots use heatmap.)</p>}
                  <div className="flex justify-center overflow-x-auto">
                    <AdjacencyMatrix
                      allColors={allColors}
                      bases={Array.isArray(snap.baseColors) ? snap.baseColors : []}
                      colorSet={matrixColorSet}
                      view={compact ? 'heatmap' : matrixView}
                      compact={compact}
                      borderColor={t.vizDataBorder}
                    />
                  </div>
                </div>
                <div>
                  <h4 className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-cyan-200 uppercase tracking-widest mb-1`}>
                    {compact ? 'Dither Blend' : '▸ Dither-Blend Preview'}
                  </h4>
                  {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">Between each pair of consecutive ramp shades, the 2-color dither blend — the optical "in-between" shade you get for free when dithering at sprite scale.</p>}
                  <div className="flex justify-center overflow-x-auto">
                    <DitherBlend
                      rows={mosaicRamps.map((r) => r.hexes)}
                      pattern={ditherPattern}
                      compact={compact}
                      borderColor={t.vizDataBorder}
                    />
                  </div>
                </div>
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render adjacency matrix + dither blend in renderSlotViz"
```

---

### Task 9: Full verification + smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — including the new `viz-interaction.spec.ts` and the unchanged `strip-export.spec.ts`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: PASS (tsc --noEmit + vite build).

- [ ] **Step 3: Manual smoke** (`npm run dev`, open localhost:5173)

Verify, in the Visualize & Compare section (working palette):
- Adjacency Matrix renders below the Mosaic; default = Pair mode, all-colors.
- "Matrix: All colors / Bases" toggle switches the grid size; "Pair / Heatmap" toggle flips rendering. In heatmap, near-duplicate pairs read dark, outliers bright.
- Hovering the full-size matrix updates the readout line (`#AABBCC ↔ #DDEEFF · ΔE 0.xxx`).
- Dither-Blend renders interleaved strips; "Dither: 2×2 Checker / 4×4 Bayer" toggle changes the texture; pixels are visibly distinct (not a solid block).
- Open Compare Mode, pick a Slot B palette: both views appear in both compact slots; the matrix is in heatmap mode there with no hover readout.
- "Matrix PNG" and "Dither PNG" buttons download files that match the on-screen Slot-A views (try both toggle states for each).

- [ ] **Step 4: Confirm done** — all checkboxes ticked, suite + build green, smoke checks pass. Do not mark complete until each is verified (see superpowers:verification-before-completion).

---

## Self-Review

**Spec coverage:**
- Shared integration (renderSlotViz, all slots, vizStyle, computeVizData, canvas, PNG) → Tasks 7, 8.
- Matrix color-set toggle → Tasks 1 (`matrixColors`), 7 (state/button), 8 (prop).
- Matrix ramp-grouped axis order (not lightness) → enforced by passing `allColors` (Task 8) + documented in `drawAdjacencyMatrix` (Task 3). `allColors` first-occurrence order is asserted in the existing `strip-export.spec.ts`.
- Full grid + diagonal identity → Task 3 draw logic.
- Pair / heatmap view + ΔE_OK + null-guard → Tasks 1 (`adjacencyDeltaE` null), 3 (`MATRIX_NA`, diagonal).
- Header strips → Task 3 (`header`).
- Compact → heatmap, no hover → Task 8 (`view={compact ? 'heatmap' : matrixView}`) + Task 5 (hover gated on `!compact`).
- Hover readout (full only) → Task 5.
- Matrix PNG → Tasks 3, 7.
- Size guard (adaptive cell, floor) → Task 5 (`Math.max(4, …)`) + Task 3 PNG (`Math.max(8, …)`). The optional ">~48 colors" inline note is a nice-to-have not implemented here; flagged as deferred so it's not a silent gap.
- Dither in-ramp interleaved + 2×2/4×4 toggle + visible-pixel scale → Tasks 2, 4 (`DITHER_SUB`), 6, 7, 8.
- Dither PNG → Tasks 4, 7.
- Testing (pure logic unit-tested; canvas/React build+smoke) → Tasks 1, 2, 9.

**Deferred (explicit, not a gap):** the dense-palette inline advisory note (>~48 colors) from the spec's size-guard section is not built; adaptive cell-shrink covers the functional need. Add later if desired.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `MatrixColorSet`/`MatrixView`/`DitherPattern` defined in Task 1/2 and used in Tasks 3–8. `drawAdjacencyMatrix(ctx, colors, {cell,view,header})`, `drawAdjacencyMatrixPng(colors,{view})`, `drawDitherBlend(ctx, rows, {pattern,...})`, `drawDitherBlendPng(rows,{pattern})`, `adjacencyDeltaE`, `normalizeDeltaE`, `heatColor`, `ditherPixelIsB`, `matrixColors` — names/signatures consistent across all tasks. Export handlers `exportMatrixPng`/`exportDitherPng` and state `matrixColorSet`/`matrixView`/`ditherPattern` consistent between Task 7 and Task 8.
