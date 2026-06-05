import { hexToOklch, deltaEOK } from './oklch';

export type MatrixColorSet = 'unique' | 'bases';
export type MatrixView = 'pair' | 'heatmap';
// Ordered-dither patterns offered in the Dither-Blend preview. Each maps to an
// N×N threshold matrix (a permutation of 0..N²-1) tiled in both axes and swept
// by a left→right threshold — see drawDitherBlend in strip-export.ts. Adding a
// pattern is just another matrix in DITHER_PATTERNS below.
export type DitherPattern =
  | 'bayer2' | 'bayer4' | 'bayer8' | 'clustered' | 'lines' | 'crosshatch';

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

// 2x2 ordered-dither (Bayer base) threshold matrix, values 0..3. Its 50% slice
// is the classic checkerboard; tiled + threshold-swept it gives a coarse 4-level
// ordered-dither ramp (vs the 4x4's 16 levels).
export const BAYER_2X2: number[][] = [
  [0, 2],
  [3, 1],
];

// 4x4 Bayer ordered-dither threshold matrix, values 0..15.
export const BAYER_4X4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// 8x8 Bayer ordered-dither threshold matrix, values 0..63 — the same family as
// 2×2/4×4, with 64 tonal levels (the smoothest ordered ramp). Standard matrix.
export const BAYER_8X8: number[][] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// --- Non-Bayer threshold-matrix generators ---
// Each returns an N×N permutation of 0..N²-1. Fed through the SAME gradient
// sweep as Bayer (matrix[cy%N][cx%N] < threshold), the assignment order is what
// makes the pattern "grow" as the threshold rises.

// Clustered-dot / halftone: cells ordered by distance from the tile center, so
// a central dot grows with intensity (retro print look). Deterministic ties.
function clusteredMatrix(n: number): number[][] {
  const c = (n - 1) / 2;
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      cells.push({ y, x, d: (y - c) * (y - c) + (x - c) * (x - c) });
  cells.sort((p, q) => p.d - q.d || p.y - q.y || p.x - q.x);
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  cells.forEach((cell, i) => { m[cell.y][cell.x] = i; });
  return m;
}

// Scanline / interleaved: rows fill in bit-reversed order, so horizontal lines
// appear spread out and thicken with intensity (CRT-ish). n must be a power of 2.
function linesMatrix(n: number): number[][] {
  const bits = Math.round(Math.log2(n));
  const bitReverse = (v: number): number => {
    let r = 0;
    for (let i = 0; i < bits; i++) r = (r << 1) | ((v >> i) & 1);
    return r;
  };
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    const order = bitReverse(y);
    for (let x = 0; x < n; x++) m[y][x] = order * n + x;
  }
  return m;
}

// Cross-hatch: cells ordered by closeness to either tile diagonal, so both 45°
// line families thicken together (classic hand-shading texture).
function crosshatchMatrix(n: number): number[][] {
  const cells = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const diag = (x + y) % n;
      const anti = (((x - y) % n) + n) % n;
      const k = Math.min(Math.min(diag, n - diag), Math.min(anti, n - anti));
      cells.push({ y, x, k });
    }
  cells.sort((p, q) => p.k - q.k || p.y - q.y || p.x - q.x);
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  cells.forEach((cell, i) => { m[cell.y][cell.x] = i; });
  return m;
}

export const CLUSTERED_4X4 = clusteredMatrix(4);
export const LINES_8X8 = linesMatrix(8);
export const CROSSHATCH_8X8 = crosshatchMatrix(8);

// Registry: ordered as shown in the UI dropdown. Adding a pattern here wires it
// into both the on-screen preview and the PNG export with no other changes.
export interface DitherPatternDef {
  id: DitherPattern;
  label: string;
  matrix: number[][];
}
export const DITHER_PATTERNS: DitherPatternDef[] = [
  { id: 'bayer2', label: '2×2 Bayer', matrix: BAYER_2X2 },
  { id: 'bayer4', label: '4×4 Bayer', matrix: BAYER_4X4 },
  { id: 'bayer8', label: '8×8 Bayer', matrix: BAYER_8X8 },
  { id: 'clustered', label: 'Clustered dot', matrix: CLUSTERED_4X4 },
  { id: 'lines', label: 'Scanline', matrix: LINES_8X8 },
  { id: 'crosshatch', label: 'Cross-hatch', matrix: CROSSHATCH_8X8 },
];

const DITHER_MATRIX_BY_ID = new Map(DITHER_PATTERNS.map((p) => [p.id, p.matrix]));

// Threshold matrix for a pattern id; falls back to 4×4 Bayer for unknown ids
// (e.g. a stale persisted value), so callers never get undefined.
export function ditherMatrix(pattern: string): number[][] {
  return DITHER_MATRIX_BY_ID.get(pattern as DitherPattern) ?? BAYER_4X4;
}
