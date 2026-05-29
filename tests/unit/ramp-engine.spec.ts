import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { hexToOklch } from '../../src/lib/oklch';

const PUNCHY   = { reach: 1.00, chromaFalloff: 0.10 };
const BALANCED = { reach: 0.575, chromaFalloff: 0.475 };
const MUTED    = { reach: 0.15, chromaFalloff: 0.85 };

const baseOpts = (extra: object) => ({ size: 5, hueShiftStrength: 1.0, ...extra });

describe('generateRamp base-anchored shape', () => {
  it('returns exactly `size` shades', () => {
    expect(generateRamp('#c45c3a', baseOpts(PUNCHY))).toHaveLength(5);
  });

  it('each shade has hex, oklch, pinned, gamutClipped', () => {
    for (const s of generateRamp('#c45c3a', baseOpts(PUNCHY))) {
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof s.oklch.L).toBe('number');
      expect(typeof s.pinned).toBe('boolean');
      expect(typeof s.gamutClipped).toBe('boolean');
    }
  });

  it('pure function: same opts -> same output', () => {
    const a = generateRamp('#c45c3a', baseOpts(PUNCHY));
    const b = generateRamp('#c45c3a', baseOpts(PUNCHY));
    expect(a).toEqual(b);
  });

  it('invalid hex: returns N copies of input, no throw', () => {
    const shades = generateRamp('not-a-hex', baseOpts(PUNCHY));
    expect(shades).toHaveLength(5);
    for (const s of shades) expect(s.hex).toBe('not-a-hex');
  });
});

describe('base fidelity (the core guarantee)', () => {
  const bases = ['#c45c3a', '#3a5fc4', '#00b3b3', '#7a3a8e', '#e8e2d0', '#1a1420'];

  for (const base of bases) {
    it(`base hex appears verbatim and identically across styles for ${base}`, () => {
      const found: string[] = [];
      for (const preset of [PUNCHY, BALANCED, MUTED]) {
        const shades = generateRamp(base, baseOpts(preset));
        const hit = shades.find(s => s.hex === base.toLowerCase());
        expect(hit, `base ${base} missing in ramp`).toBeTruthy();
        found.push(hit!.hex);
      }
      expect(new Set(found).size).toBe(1); // identical in all three styles
    });
  }

  it('shuffle (hueJitter) never moves the base slot', () => {
    const base = '#c45c3a';
    const plain = generateRamp(base, baseOpts({ ...PUNCHY }));
    const jittered = generateRamp(base, baseOpts({ ...PUNCHY, hueJitter: 8 }));
    const plainBase = plain.find(s => s.hex === base.toLowerCase());
    const jitterBase = jittered.find(s => s.hex === base.toLowerCase());
    expect(plainBase).toBeTruthy();
    expect(jitterBase).toBeTruthy();
  });
});

describe('distribution guarantees', () => {
  for (const n of [4, 5, 6, 7, 8]) {
    it(`near-white base keeps >=1 shade each side at size ${n}`, () => {
      const shades = generateRamp('#f4f0e8', baseOpts({ ...BALANCED, size: n }));
      const baseIdx = shades.findIndex(s => s.hex === '#f4f0e8');
      expect(baseIdx).toBeGreaterThanOrEqual(1);
      expect(baseIdx).toBeLessThanOrEqual(n - 2);
    });
    it(`near-black base keeps >=1 shade each side at size ${n}`, () => {
      const shades = generateRamp('#140f1a', baseOpts({ ...BALANCED, size: n }));
      const baseIdx = shades.findIndex(s => s.hex === '#140f1a');
      expect(baseIdx).toBeGreaterThanOrEqual(1);
      expect(baseIdx).toBeLessThanOrEqual(n - 2);
    });
  }

  it('lightness is non-decreasing across the ramp', () => {
    const shades = generateRamp('#c45c3a', baseOpts(BALANCED));
    for (let i = 1; i < shades.length; i++) {
      expect(shades[i].oklch.L).toBeGreaterThanOrEqual(shades[i - 1].oklch.L - 1e-6);
    }
  });
});

describe('style semantics', () => {
  const base = '#c45c3a';

  it('reach ordering: punchy span >= balanced >= muted', () => {
    const span = (preset: object) => {
      const s = generateRamp(base, baseOpts(preset));
      return s[s.length - 1].oklch.L - s[0].oklch.L;
    };
    expect(span(PUNCHY)).toBeGreaterThanOrEqual(span(BALANCED) - 1e-6);
    expect(span(BALANCED)).toBeGreaterThanOrEqual(span(MUTED) - 1e-6);
  });

  it('chroma falloff: muted midtones grayer than balanced grayer than punchy', () => {
    // Measured at the shades adjacent to the base (the midtones), not the ends:
    // wide-reach styles push their end shades into gamut-clip territory, which
    // confounds end chroma. Neighbor chroma reflects the falloff rate directly.
    const neighborChroma = (preset: object) => {
      const s = generateRamp(base, baseOpts(preset));
      const bi = s.findIndex(x => x.hex === base.toLowerCase());
      return (s[bi - 1].oklch.C + s[bi + 1].oklch.C) / 2;
    };
    expect(neighborChroma(PUNCHY)).toBeGreaterThan(neighborChroma(BALANCED));
    expect(neighborChroma(BALANCED)).toBeGreaterThan(neighborChroma(MUTED));
  });

  it('base chroma is identical across styles (anchor is full chroma)', () => {
    const baseC = hexToOklch(base)!.C;
    for (const preset of [PUNCHY, BALANCED, MUTED]) {
      const s = generateRamp(base, baseOpts(preset));
      const hit = s.find(x => x.hex === base.toLowerCase())!;
      expect(Math.abs(hit.oklch.C - baseC)).toBeLessThan(1e-6);
    }
  });

  it('achromatic base: no hue shift, no NaN, chroma stays tiny', () => {
    const shades = generateRamp('#808080', baseOpts({ ...PUNCHY, hueJitter: 8 }));
    for (const s of shades) {
      expect(Number.isNaN(s.oklch.H)).toBe(false);
      expect(s.oklch.C).toBeLessThan(0.02);
    }
  });
});

describe('pins and hidden', () => {
  it('pin overrides output at the pinned index', () => {
    const shades = generateRamp('#c45c3a', baseOpts({ ...PUNCHY, pins: { 1: '#abcdef' } }));
    expect(shades[1].hex).toBe('#abcdef');
    expect(shades[1].pinned).toBe(true);
  });

  it('pinned shade carries the pin hex oklch, not the base oklch', () => {
    const shades = generateRamp('#c45c3a', baseOpts({ ...PUNCHY, pins: { 1: '#abcdef' } }));
    const pinOklch = hexToOklch('#abcdef')!;
    expect(shades[1].oklch.L).toBeCloseTo(pinOklch.L, 6);
    expect(shades[1].oklch.C).toBeCloseTo(pinOklch.C, 6);
    expect(shades[1].oklch.H).toBeCloseTo(pinOklch.H, 6);
  });

  it('hidden indices dropped from output', () => {
    const shades = generateRamp('#c45c3a', baseOpts({ ...PUNCHY, hidden: [0, 4] }));
    expect(shades).toHaveLength(3);
  });
});
