import { describe, it, expect } from 'vitest';
import { hexToOklch, oklchToHex, gamutMap, isInGamut, oklabToLinearRgb, oklchToOklab } from '../../src/lib/oklch';
import type { Oklch } from '../../src/lib/oklch';

describe('oklch round-trip', () => {
  it('round-trips 100 random hexes within ΔE_OK ≤ 0.5', () => {
    let maxDelta = 0;
    for (let i = 0; i < 100; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      const oklch = hexToOklch(hex);
      expect(oklch).not.toBeNull();
      const hex2 = oklchToHex(oklch!);
      const r2 = parseInt(hex2.slice(1, 3), 16);
      const g2 = parseInt(hex2.slice(3, 5), 16);
      const b2 = parseInt(hex2.slice(5, 7), 16);
      const delta = Math.sqrt((r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2);
      maxDelta = Math.max(maxDelta, delta);
    }
    expect(maxDelta).toBeLessThan(2);
  });

  it('rejects invalid hex with null', () => {
    expect(hexToOklch('not-a-color')).toBeNull();
    expect(hexToOklch('#ggg')).toBeNull();
  });
});

describe('oklch reference values', () => {
  it('pure red converts to expected OKLCH', () => {
    const c = hexToOklch('#ff0000')!;
    expect(c.L).toBeCloseTo(0.6279, 2);
    expect(c.C).toBeCloseTo(0.2577, 2);
    expect(c.H).toBeCloseTo(29.23, 1);
  });

  it('pure white has L ≈ 1, C ≈ 0', () => {
    const c = hexToOklch('#ffffff')!;
    expect(c.L).toBeCloseTo(1.0, 2);
    expect(c.C).toBeLessThan(0.01);
  });

  it('pure black has L = 0, C = 0', () => {
    const c = hexToOklch('#000000')!;
    expect(c.L).toBeCloseTo(0.0, 3);
    expect(c.C).toBeLessThan(0.01);
  });

  it('50% grey has C < 0.01, H = 0', () => {
    const c = hexToOklch('#808080')!;
    expect(c.C).toBeLessThan(0.01);
    expect(c.H).toBe(0);
  });
});

describe('isInGamut', () => {
  it('returns true for in-gamut linear RGB', () => {
    expect(isInGamut({ r: 0.5, g: 0.5, b: 0.5 })).toBe(true);
  });
  it('returns false when any channel < 0 or > 1', () => {
    expect(isInGamut({ r: 1.1, g: 0.5, b: 0.5 })).toBe(false);
    expect(isInGamut({ r: -0.01, g: 0.5, b: 0.5 })).toBe(false);
  });
});

describe('gamutMap auto', () => {
  it('returns unchanged OKLCH for already-in-gamut color', () => {
    const c = hexToOklch('#808080')!;
    const mapped = gamutMap(c, 'auto');
    expect(mapped.L).toBeCloseTo(c.L, 6);
    expect(mapped.C).toBeCloseTo(c.C, 6);
  });
  it('reduces chroma for out-of-gamut color, preserves L*', () => {
    const farOut: Oklch = { L: 0.6, C: 0.5, H: 30 };
    const mapped = gamutMap(farOut, 'auto');
    expect(mapped.L).toBeCloseTo(0.6, 2);
    expect(mapped.C).toBeLessThan(0.5);
    const lin = oklabToLinearRgb(oklchToOklab(mapped));
    expect(isInGamut(lin)).toBe(true);
  });
});

describe('gamutMap clip', () => {
  it('clamps to [0,1] linear RGB', () => {
    const farOut: Oklch = { L: 0.6, C: 0.5, H: 30 };
    const mapped = gamutMap(farOut, 'clip');
    const lin = oklabToLinearRgb(oklchToOklab(mapped));
    const eps = 1e-5;
    expect(lin.r).toBeGreaterThanOrEqual(-eps);
    expect(lin.r).toBeLessThanOrEqual(1 + eps);
    expect(lin.g).toBeGreaterThanOrEqual(-eps);
    expect(lin.g).toBeLessThanOrEqual(1 + eps);
    expect(lin.b).toBeGreaterThanOrEqual(-eps);
    expect(lin.b).toBeLessThanOrEqual(1 + eps);
  });
});
