import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DOCK_POS,
  resolveCardAnchor,
  clampToViewport,
  cardAnchorFromPixel,
  parseCardAnchor,
  gridColumns,
} from '../../src/lib/base-dock';

const VP = { w: 1000, h: 800 };
const SIZE = { w: 50, h: 200 };
const CARD = { left: 200, right: 800 };

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

describe('resolveCardAnchor', () => {
  it('places the dock a gap to the right of the card column, from the top', () => {
    const p = resolveCardAnchor({ hEdge: 'right', dx: 12, vEdge: 'top', dy: 80 }, CARD, VP, SIZE);
    expect(p).toEqual({ x: 800 + 12, y: 80 });
  });
  it('anchors to the left card edge and bottom viewport edge', () => {
    const p = resolveCardAnchor({ hEdge: 'left', dx: -30, vEdge: 'bottom', dy: 16 }, CARD, VP, SIZE);
    expect(p).toEqual({ x: 200 - 30, y: 800 - 200 - 16 });
  });
  it('clamps an off-screen result back inside the viewport', () => {
    const p = resolveCardAnchor({ hEdge: 'right', dx: 9999, vEdge: 'top', dy: 0 }, CARD, VP, SIZE);
    expect(p).toEqual({ x: 950, y: 0 });
  });
});

describe('cardAnchorFromPixel (calibration / drag)', () => {
  it('reports the nearest card edge as a signed offset', () => {
    const a = cardAnchorFromPixel({ x: 812, y: 80 }, CARD, VP, SIZE);
    expect(a).toEqual({ hEdge: 'right', dx: 12, vEdge: 'top', dy: 80 });
  });
  it('uses the left edge and bottom viewport edge for a lower-left point', () => {
    const a = cardAnchorFromPixel({ x: 170, y: 584 }, CARD, VP, SIZE);
    expect(a).toEqual({ hEdge: 'left', dx: -30, vEdge: 'bottom', dy: 16 });
  });
  it('round-trips with resolveCardAnchor', () => {
    const a = cardAnchorFromPixel({ x: 812, y: 80 }, CARD, VP, SIZE);
    expect(resolveCardAnchor(a, CARD, VP, SIZE)).toEqual({ x: 812, y: 80 });
  });
});

describe('parseCardAnchor', () => {
  it('parses a valid stored card anchor', () => {
    expect(parseCardAnchor('{"hEdge":"right","dx":12,"vEdge":"top","dy":143}'))
      .toEqual({ hEdge: 'right', dx: 12, vEdge: 'top', dy: 143 });
  });
  it('returns null for bad edges, non-finite, the old shape, or junk', () => {
    expect(parseCardAnchor(null)).toBeNull();
    expect(parseCardAnchor('not json')).toBeNull();
    expect(parseCardAnchor('{"hEdge":"middle","dx":1,"vEdge":"top","dy":2}')).toBeNull();
    expect(parseCardAnchor('{"hEdge":"right","dx":"a","vEdge":"top","dy":2}')).toBeNull();
    expect(parseCardAnchor('{"anchor":"top-right","dx":24,"dy":80}')).toBeNull();
    expect(parseCardAnchor('{"x":1,"y":2}')).toBeNull();
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
  it('is a valid card anchor default', () => {
    expect(['left', 'right']).toContain(DEFAULT_DOCK_POS.hEdge);
    expect(['top', 'bottom']).toContain(DEFAULT_DOCK_POS.vEdge);
    expect(typeof DEFAULT_DOCK_POS.dx).toBe('number');
    expect(typeof DEFAULT_DOCK_POS.dy).toBe('number');
  });
});
