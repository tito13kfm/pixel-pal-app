import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import type { Shade } from '../../src/lib/ramp-engine';

describe('generateRamp (perceptual)', () => {
  it('returns exactly `size` shades', () => {
    const shades = generateRamp('#c45c3a', {
      style: 'punchy',
      size: 6,
      hueShiftStrength: 1.0,
    });
    expect(shades).toHaveLength(6);
  });

  it('each shade has hex, oklch, pinned, gamutClipped', () => {
    const shades = generateRamp('#c45c3a', { style: 'punchy', size: 6, hueShiftStrength: 1.0 });
    for (const s of shades) {
      expect(typeof s.hex).toBe('string');
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof s.oklch.L).toBe('number');
      expect(typeof s.pinned).toBe('boolean');
      expect(typeof s.gamutClipped).toBe('boolean');
    }
  });

  it('pure function: same opts → same output', () => {
    const opts = { style: 'punchy' as const, size: 6, hueShiftStrength: 1.0 };
    const a = generateRamp('#c45c3a', opts);
    const b = generateRamp('#c45c3a', opts);
    expect(a).toEqual(b);
  });

  it('punchy style: shadow L* < 0.20, highlight L* > 0.85 for #c45c3a', () => {
    const shades = generateRamp('#c45c3a', { style: 'punchy', size: 6, hueShiftStrength: 1.0 });
    expect(shades[0].oklch.L).toBeLessThan(0.20);
    expect(shades[shades.length - 1].oklch.L).toBeGreaterThan(0.85);
  });

  it('saturated cyan #00b3b3 punchy: all shades are valid sRGB, highlight L* > 0.85', () => {
    const shades = generateRamp('#00b3b3', { style: 'punchy', size: 6, hueShiftStrength: 1.0, gamut: 'auto' });
    // auto strategy KEEPS shades in sRGB by reducing chroma at lightness extremes.
    // So gamutClipped may be true for cyan-at-low-L (correct behavior), but every
    // output must still be a valid 7-char hex (in-sRGB by construction).
    for (const s of shades) {
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(shades[shades.length - 1].oklch.L).toBeGreaterThan(0.85);
  });

  it('achromatic base: all shades chroma < 0.02', () => {
    const shades = generateRamp('#808080', { style: 'punchy', size: 6, hueShiftStrength: 1.0 });
    for (const s of shades) {
      expect(s.oklch.C).toBeLessThan(0.02);
    }
  });

  it('linear curve: L* values linearly spaced', () => {
    const shades = generateRamp('#c45c3a', { style: 'punchy', size: 5, hueShiftStrength: 1.0, curve: 'linear' });
    const deltas = [];
    for (let i = 1; i < shades.length; i++) {
      deltas.push(shades[i].oklch.L - shades[i - 1].oklch.L);
    }
    for (let i = 1; i < deltas.length; i++) {
      expect(Math.abs(deltas[i] - deltas[0])).toBeLessThan(0.005);
    }
  });

  it('pin overrides engine output at the pinned index', () => {
    const shades = generateRamp('#c45c3a', {
      style: 'punchy', size: 6, hueShiftStrength: 1.0,
      pins: { 2: '#abcdef' },
    });
    expect(shades[2].hex).toBe('#abcdef');
    expect(shades[2].pinned).toBe(true);
  });

  it('hidden indices dropped from output', () => {
    const shades = generateRamp('#c45c3a', {
      style: 'punchy', size: 6, hueShiftStrength: 1.0,
      hidden: [1, 4],
    });
    expect(shades).toHaveLength(4);
  });

  it('invalid hex: returns N copies of input, no throw', () => {
    const shades = generateRamp('not-a-hex', { style: 'punchy', size: 4, hueShiftStrength: 1.0 });
    expect(shades).toHaveLength(4);
    for (const s of shades) {
      expect(s.hex).toBe('not-a-hex');
    }
  });
});

describe('generateRamp slider monotonicity', () => {
  const bases = ['#3a5fc4', '#c45c3a', '#00b3b3', '#7a3a8e', '#808080'];

  for (const base of bases) {
    it(`mean chroma is monotonically non-decreasing with S slider for ${base}`, () => {
      const means: number[] = [];
      for (const s of [0, 25, 50, 75, 100]) {
        const shades = generateRamp(base, {
          style: 'punchy',
          size: 6,
          hueShiftStrength: 1.0,
          satMultiplier: 1 + s / 100,
        });
        const meanC = shades.reduce((acc, sh) => acc + sh.oklch.C, 0) / shades.length;
        means.push(meanC);
      }
      for (let i = 1; i < means.length; i++) {
        expect(means[i]).toBeGreaterThanOrEqual(means[i - 1] - 1e-6);
      }
    });
  }
});
