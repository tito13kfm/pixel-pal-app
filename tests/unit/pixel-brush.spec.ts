import { describe, it, expect } from 'vitest';
import { getStamp, applyStamp } from '../../src/lib/pixel-brush';
import type { BrushOffset } from '../../src/lib/pixel-brush';

// Helpers
function sortOffsets(offsets: BrushOffset[]) {
  return [...offsets].sort((a, b) => a.dy !== b.dy ? a.dy - b.dy : a.dx - b.dx);
}

function toKey(o: BrushOffset) {
  return `${o.dx},${o.dy}`;
}

// ─── getStamp: square ─────────────────────────────────────────────────────────

describe('getStamp square', () => {
  it('size 1 returns 1 pixel at origin', () => {
    const stamp = getStamp('square', 1);
    expect(stamp).toHaveLength(1);
    // loop produces -0 for -half when half=0; Math.abs normalizes it
    expect(Math.abs(stamp[0].dx)).toBe(0);
    expect(Math.abs(stamp[0].dy)).toBe(0);
  });

  it('size 2 returns 9 pixels (3x3 grid, half=1)', () => {
    const stamp = getStamp('square', 2);
    expect(stamp).toHaveLength(9);
  });

  it('size 2 covers dx and dy in [-1, 1]', () => {
    const stamp = getStamp('square', 2);
    const keys = new Set(stamp.map(toKey));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(keys.has(`${dx},${dy}`)).toBe(true);
      }
    }
  });

  it('size 4 returns 25 pixels (5x5 grid, half=2)', () => {
    const stamp = getStamp('square', 4);
    expect(stamp).toHaveLength(25);
  });

  it('size 4 covers dx and dy in [-2, 2]', () => {
    const stamp = getStamp('square', 4);
    const keys = new Set(stamp.map(toKey));
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        expect(keys.has(`${dx},${dy}`)).toBe(true);
      }
    }
  });

  it('no duplicate offsets for any size', () => {
    for (const size of [1, 2, 4] as const) {
      const stamp = getStamp('square', size);
      const keys = stamp.map(toKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

// ─── getStamp: circle ─────────────────────────────────────────────────────────

describe('getStamp circle', () => {
  it('size 1 returns 1 pixel at origin', () => {
    const stamp = getStamp('circle', 1);
    expect(stamp).toHaveLength(1);
    expect(Math.abs(stamp[0].dx)).toBe(0);
    expect(Math.abs(stamp[0].dy)).toBe(0);
  });

  it('size 2 returns 4 pixels', () => {
    const stamp = getStamp('circle', 2);
    expect(stamp).toHaveLength(4);
  });

  it('size 2 contains exactly the correct offsets', () => {
    const stamp = getStamp('circle', 2);
    const keys = new Set(stamp.map(toKey));
    // (-1,-1),(-1,0),(0,-1),(0,0) all pass (dx+0.5)^2+(dy+0.5)^2 <= 1
    expect(keys.has('-1,-1')).toBe(true);
    expect(keys.has('-1,0')).toBe(true);
    expect(keys.has('0,-1')).toBe(true);
    expect(keys.has('0,0')).toBe(true);
    // (1,*) and (0,1) and (-1,1) all fail
    expect(keys.has('1,0')).toBe(false);
    expect(keys.has('0,1')).toBe(false);
  });

  it('size 4 returns 12 pixels', () => {
    const stamp = getStamp('circle', 4);
    expect(stamp).toHaveLength(12);
  });

  it('size 4 contains correct offsets', () => {
    const stamp = getStamp('circle', 4);
    const keys = new Set(stamp.map(toKey));
    const expected = [
      { dx: -1, dy: -2 }, { dx: 0, dy: -2 },
      { dx: -2, dy: -1 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
      { dx: -2, dy: 0 },  { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
      { dx: -1, dy: 1 },  { dx: 0, dy: 1 },
    ];
    for (const o of expected) {
      expect(keys.has(toKey(o))).toBe(true);
    }
    // corners excluded
    expect(keys.has('-2,-2')).toBe(false);
    expect(keys.has('2,2')).toBe(false);
    expect(keys.has('2,-2')).toBe(false);
  });

  it('all circle offsets satisfy the inscribed-circle formula', () => {
    for (const size of [2, 4] as const) {
      const r2 = (size / 2) ** 2;
      const stamp = getStamp('circle', size);
      for (const { dx, dy } of stamp) {
        const dist2 = (dx + 0.5) ** 2 + (dy + 0.5) ** 2;
        expect(dist2).toBeLessThanOrEqual(r2);
      }
    }
  });

  it('no duplicate offsets', () => {
    for (const size of [1, 2, 4] as const) {
      const stamp = getStamp('circle', size);
      const keys = stamp.map(toKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

// ─── applyStamp ───────────────────────────────────────────────────────────────

describe('applyStamp', () => {
  const W = 4;
  const H = 4;
  const empty = () => new Array<number | null>(W * H).fill(null);

  it('applies single-pixel stamp at center', () => {
    const stamp = getStamp('square', 1); // [{dx:0,dy:0}]
    const result = applyStamp(empty(), 2, 2, stamp, 0xff0000, W, H);
    expect(result[2 * W + 2]).toBe(0xff0000);
    // all other cells still null
    expect(result.filter(v => v !== null)).toHaveLength(1);
  });

  it('applies value to all stamp pixels', () => {
    const stamp = getStamp('square', 2); // 9 offsets centered on (1,1) fits in 4x4
    const result = applyStamp(empty(), 1, 1, stamp, 42, W, H);
    // center (1,1), half=1: dx in [-1..1], dy in [-1..1]
    // all 9 pixels land in [0..2] x [0..2], all in bounds
    expect(result.filter(v => v === 42)).toHaveLength(9);
  });

  it('clamps out-of-bounds offsets', () => {
    // stamp at corner (0,0) with square size 2 (half=1): offsets include (-1,*) and (*,-1) which are OOB
    const stamp = getStamp('square', 2);
    const result = applyStamp(empty(), 0, 0, stamp, 7, W, H);
    // Only (0,0),(1,0),(0,1),(1,1) are in bounds
    expect(result.filter(v => v === 7)).toHaveLength(4);
    expect(result[0 * W + 0]).toBe(7);
    expect(result[0 * W + 1]).toBe(7);
    expect(result[1 * W + 0]).toBe(7);
    expect(result[1 * W + 1]).toBe(7);
  });

  it('clamps at right/bottom edge', () => {
    const stamp = getStamp('square', 2);
    const result = applyStamp(empty(), W - 1, H - 1, stamp, 5, W, H);
    // offsets with dx>0 or dy>0 OOB; dx in {-1,0}, dy in {-1,0} in-bounds
    expect(result.filter(v => v === 5)).toHaveLength(4);
  });

  it('does not mutate original array', () => {
    const original = empty();
    const stamp = getStamp('square', 1);
    applyStamp(original, 1, 1, stamp, 99, W, H);
    expect(original[1 * W + 1]).toBeNull();
  });

  it('can write null (erase)', () => {
    const pixels = new Array<number | null>(W * H).fill(0xffffff);
    const stamp = getStamp('square', 1);
    const result = applyStamp(pixels, 2, 2, stamp, null, W, H);
    expect(result[2 * W + 2]).toBeNull();
    // other pixels unchanged
    expect(result.filter(v => v === 0xffffff)).toHaveLength(W * H - 1);
  });

  it('returns array of same length as input', () => {
    const pixels = empty();
    const stamp = getStamp('square', 4);
    const result = applyStamp(pixels, 2, 2, stamp, 1, W, H);
    expect(result).toHaveLength(pixels.length);
  });
});
