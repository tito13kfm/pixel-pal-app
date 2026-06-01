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
