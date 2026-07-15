import { describe, it, expect } from 'vitest';
import { rotateCycle } from '../../src/lib/viz-interaction';
import { buildCycleJson } from '../../src/lib/palette-export';

const HEXES = ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'];

describe('rotateCycle', () => {
  it('offset 0 is the identity (new array, same contents)', () => {
    const out = rotateCycle(HEXES, 1, 4, 0);
    expect(out).toEqual(HEXES);
    expect(out).not.toBe(HEXES);
  });

  it('rotates only inside the inclusive range, leaving the rest alone', () => {
    const out = rotateCycle(HEXES, 1, 4, 1);
    expect(out).toEqual(['#000000', '#222222', '#333333', '#444444', '#111111', '#555555']);
  });

  it('is periodic: offset === range length is the identity', () => {
    expect(rotateCycle(HEXES, 1, 4, 4)).toEqual(HEXES);
    expect(rotateCycle(HEXES, 1, 4, 9)).toEqual(rotateCycle(HEXES, 1, 4, 1));
  });

  it('reverse undoes forward for the same offset', () => {
    const fwd = rotateCycle(HEXES, 1, 4, 3);
    expect(rotateCycle(fwd, 1, 4, 3, true)).toEqual(HEXES);
  });

  it('handles negative offsets like a reverse step', () => {
    expect(rotateCycle(HEXES, 1, 4, -1)).toEqual(rotateCycle(HEXES, 1, 4, 3));
  });

  it('clamps out-of-bounds and swapped endpoints', () => {
    expect(rotateCycle(HEXES, 4, 1, 1)).toEqual(rotateCycle(HEXES, 1, 4, 1));
    expect(rotateCycle(HEXES, -3, 99, 6)).toEqual(HEXES); // clamped to full length, period 6
  });

  it('degenerate ranges and empty input are no-ops', () => {
    expect(rotateCycle(HEXES, 2, 2, 5)).toEqual(HEXES);
    expect(rotateCycle([], 0, 3, 2)).toEqual([]);
  });
});

describe('buildCycleJson', () => {
  it('writes a parseable sidecar with format tag, version, lowercased palette', () => {
    const text = buildCycleJson(['#FF00FF', '#00FFFF'], [{ low: 0, high: 1, rate: 8, reverse: false }]);
    expect(text.endsWith('\n')).toBe(true);
    const doc = JSON.parse(text);
    expect(doc).toEqual({
      format: 'pixel-pal-cycle',
      version: 1,
      palette: ['#ff00ff', '#00ffff'],
      cycles: [{ low: 0, high: 1, rate: 8, reverse: false }],
    });
  });
});
