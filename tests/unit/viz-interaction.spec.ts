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
