import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DOCK_POS,
  resolveAnchor,
  clampToViewport,
  nearestCornerOffset,
  parsePoint,
  gridColumns,
} from '../../src/lib/base-dock';

const VP = { w: 1000, h: 800 };
const SIZE = { w: 50, h: 200 };

describe('clampToViewport', () => {
  it('keeps an in-bounds point unchanged', () => {
    expect(clampToViewport({ x: 100, y: 100 }, VP, SIZE)).toEqual({ x: 100, y: 100 });
  });
  it('pulls an off-right/off-bottom point back inside', () => {
    expect(clampToViewport({ x: 9999, y: 9999 }, VP, SIZE)).toEqual({ x: 950, y: 600 });
  });
  it('clamps negative coords to zero', () => {
    expect(clampToViewport({ x: -40, y: -10 }, VP, SIZE)).toEqual({ x: 0, y: 0 });
  });
});

describe('resolveAnchor', () => {
  it('resolves top-right with offsets', () => {
    const p = resolveAnchor({ anchor: 'top-right', dx: 24, dy: 80 }, VP, SIZE);
    expect(p).toEqual({ x: 1000 - 50 - 24, y: 80 });
  });
  it('resolves bottom-left with offsets', () => {
    const p = resolveAnchor({ anchor: 'bottom-left', dx: 16, dy: 16 }, VP, SIZE);
    expect(p).toEqual({ x: 16, y: 800 - 200 - 16 });
  });
});

describe('nearestCornerOffset (calibration)', () => {
  it('reports the nearest corner as anchor + offset', () => {
    const d = nearestCornerOffset({ x: 926, y: 80 }, VP, SIZE);
    expect(d.anchor).toBe('top-right');
    expect(d.dx).toBe(24);
    expect(d.dy).toBe(80);
  });
  it('reports bottom-left for a point near that corner', () => {
    const d = nearestCornerOffset({ x: 16, y: 584 }, VP, SIZE);
    expect(d.anchor).toBe('bottom-left');
    expect(d.dx).toBe(16);
    expect(d.dy).toBe(16);
  });
});

describe('parsePoint', () => {
  it('parses a valid stored point', () => {
    expect(parsePoint('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
  });
  it('returns null for junk or missing data', () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint('not json')).toBeNull();
    expect(parsePoint('{"x":"a"}')).toBeNull();
  });
  it('rejects non-finite coords (corrupted store)', () => {
    expect(parsePoint('{"x":1e999,"y":0}')).toBeNull();
    expect(parsePoint('{"x":null,"y":5}')).toBeNull();
  });
});

describe('gridColumns', () => {
  it('keeps small palettes in one column', () => {
    expect(gridColumns(1)).toBe(1);
    expect(gridColumns(4)).toBe(1);
  });
  it('grows columns to stay a tall ~2:1 rectangle', () => {
    expect(gridColumns(5)).toBe(2);   // 2x3
    expect(gridColumns(8)).toBe(2);   // 2x4
    expect(gridColumns(13)).toBe(3);  // 3x5
    expect(gridColumns(18)).toBe(3);  // 3x6
    expect(gridColumns(32)).toBe(4);  // 4x8
  });
  it('never returns less than one column', () => {
    expect(gridColumns(0)).toBe(1);
  });
});

describe('DEFAULT_DOCK_POS', () => {
  it('is a valid anchor default', () => {
    expect(['top-left','top-right','bottom-left','bottom-right']).toContain(DEFAULT_DOCK_POS.anchor);
    expect(typeof DEFAULT_DOCK_POS.dx).toBe('number');
    expect(typeof DEFAULT_DOCK_POS.dy).toBe('number');
  });
});
