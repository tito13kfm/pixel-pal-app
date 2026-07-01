import { describe, it, expect } from 'vitest';
import {
  shadeLabelsFor, labelsForRamp, applyOverrides, filterHidden,
  resolveBaseForRamp, resolveSizeForRamp, resolveHueShiftForRamp, generateRamp,
} from '../../src/lib/ramp-helpers';

describe('shadeLabelsFor', () => {
  it('returns 6 labels for a 6-shade ramp, centered on base', () => {
    const labels = shadeLabelsFor(6);
    expect(labels).toHaveLength(6);
    expect(labels[3]).toBe('base');
  });
});

describe('labelsForRamp', () => {
  it('re-centers base on the slot that actually holds the base hex', () => {
    const ramp = ['#000000', '#111111', '#ff00ff', '#eeeeee', '#ffffff'];
    const labels = labelsForRamp(ramp, '#ff00ff');
    expect(labels[2]).toBe('base');
  });

  it('falls back to the default table when base hex is not found', () => {
    const ramp = ['#000000', '#111111', '#222222', '#eeeeee', '#ffffff'];
    const labels = labelsForRamp(ramp, '#ff00ff');
    expect(labels).toEqual(shadeLabelsFor(5));
  });
});

describe('applyOverrides', () => {
  it('substitutes a pinned shade for the matching style only', () => {
    const ramp = ['#000000', '#111111', '#222222'];
    const overrides = { 0: { 1: { punchy: '#abcdef' } } };
    const result = applyOverrides(ramp, 0, overrides as any, 'punchy');
    expect(result[1]).toBe('#abcdef');
    const balancedResult = applyOverrides(ramp, 0, overrides as any, 'balanced');
    expect(balancedResult).toEqual(ramp);
  });

  it('ignores an out-of-range pin index', () => {
    const ramp = ['#000000', '#111111'];
    const overrides = { 0: { 7: { punchy: '#abcdef' } } };
    const result = applyOverrides(ramp, 0, overrides as any, 'punchy');
    expect(result).toEqual(ramp);
  });
});

describe('filterHidden', () => {
  it('removes hidden shade indices and keeps originalIndices parallel', () => {
    const ramp = ['#000000', '#111111', '#222222'];
    const labels = ['outline', 'shadow', 'base'];
    const result = filterHidden(ramp, labels, 0, { 0: [1] });
    expect(result.hexes).toEqual(['#000000', '#222222']);
    expect(result.originalIndices).toEqual([0, 2]);
  });

  it('passes through unchanged when no shades are hidden for that base', () => {
    const ramp = ['#000000', '#111111'];
    const labels = ['outline', 'base'];
    const result = filterHidden(ramp, labels, 0, {});
    expect(result.hexes).toEqual(ramp);
  });
});

describe('resolveBaseForRamp', () => {
  it('returns the hex unchanged when no saturation override is set', () => {
    expect(resolveBaseForRamp('#ff00ff', 0, {})).toBe('#ff00ff');
  });

  it('scales saturation when an override multiplier is set', () => {
    const result = resolveBaseForRamp('#ff00ff', 0, { 0: 0.5 });
    expect(result).not.toBe('#ff00ff');
  });
});

describe('resolveSizeForRamp', () => {
  it('returns the global rampSize when no per-ramp override exists', () => {
    expect(resolveSizeForRamp(0, {}, 6)).toBe(6);
  });

  it('returns the per-ramp override when valid', () => {
    expect(resolveSizeForRamp(0, { 0: 8 }, 6)).toBe(8);
  });

  it('falls back to global rampSize when the override is not a valid size', () => {
    expect(resolveSizeForRamp(0, { 0: 3 } as any, 6)).toBe(6);
  });
});

describe('resolveHueShiftForRamp', () => {
  it('returns the per-ramp value when set', () => {
    expect(resolveHueShiftForRamp(0, { 0: 0.5 }, 1.0)).toBe(0.5);
  });

  it('falls back to the global value when unset', () => {
    expect(resolveHueShiftForRamp(0, {}, 1.0)).toBe(1.0);
  });
});

describe('generateRamp', () => {
  it('produces the requested number of shades', () => {
    const shades = generateRamp('#ff00ff', 6, 'punchy', 1.0, 0, {
      gamutPerRamp: {}, stylePresets: {} as any, shuffleSeed: 0,
      rampShuffleOffsets: {}, lightnessCurvePerRamp: {}, satCurvePerRamp: {},
    });
    expect(shades).toHaveLength(6);
    shades.forEach(hex => expect(hex).toMatch(/^#[0-9a-f]{6}$/));
  });

  it('is deterministic for shuffleSeed 0 and no per-ramp offset', () => {
    const a = generateRamp('#ff00ff', 6, 'punchy', 1.0, 0, {
      gamutPerRamp: {}, stylePresets: {} as any, shuffleSeed: 0,
      rampShuffleOffsets: {}, lightnessCurvePerRamp: {}, satCurvePerRamp: {},
    });
    const b = generateRamp('#ff00ff', 6, 'punchy', 1.0, 0, {
      gamutPerRamp: {}, stylePresets: {} as any, shuffleSeed: 0,
      rampShuffleOffsets: {}, lightnessCurvePerRamp: {}, satCurvePerRamp: {},
    });
    expect(a).toEqual(b);
  });
});
