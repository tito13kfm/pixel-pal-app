import { describe, it, expect } from 'vitest';
import {
  adjacencyDeltaE, normalizeDeltaE, heatColor, matrixColors,
} from '../../src/lib/viz-interaction';
import { BAYER_4X4, BAYER_8X8, DITHER_PATTERNS, ditherMatrix } from '../../src/lib/viz-interaction';

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

describe('BAYER_4X4', () => {
  it('is a 4x4 matrix of the 16 distinct values 0..15', () => {
    expect(BAYER_4X4.length).toBe(4);
    BAYER_4X4.forEach(row => expect(row.length).toBe(4));
    const flat = BAYER_4X4.flat().sort((a, b) => a - b);
    expect(flat).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });
});

describe('BAYER_8X8', () => {
  it('is an 8x8 matrix of the 64 distinct values 0..63', () => {
    expect(BAYER_8X8.length).toBe(8);
    BAYER_8X8.forEach(row => expect(row.length).toBe(8));
    const flat = BAYER_8X8.flat().sort((a, b) => a - b);
    expect(flat).toEqual(Array.from({ length: 64 }, (_, i) => i));
  });
});

describe('DITHER_PATTERNS registry', () => {
  it('every pattern matrix is square and a permutation of 0..N²-1', () => {
    // The gradient sweep (matrix[cy%N][cx%N] < threshold) relies on each matrix
    // being a full permutation so the threshold reveals one cell at a time.
    for (const { id, matrix } of DITHER_PATTERNS) {
      const n = matrix.length;
      matrix.forEach(row => expect(row.length, `${id} row length`).toBe(n));
      const flat = matrix.flat().sort((a, b) => a - b);
      expect(flat, `${id} permutation`).toEqual(Array.from({ length: n * n }, (_, i) => i));
    }
  });
  it('has unique, stable ids', () => {
    const ids = DITHER_PATTERNS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ditherMatrix', () => {
  it('returns the registered matrix for a known id', () => {
    expect(ditherMatrix('bayer4')).toBe(BAYER_4X4);
    expect(ditherMatrix('bayer8')).toBe(BAYER_8X8);
  });
  it('falls back to 4×4 Bayer for an unknown id', () => {
    expect(ditherMatrix('nonsense')).toBe(BAYER_4X4);
  });
});
