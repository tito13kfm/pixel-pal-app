import { generatePalette, DEFAULT_GENERATOR_ENVELOPE } from '../../src/lib/palette-generator';
import { MOOD_PRESETS } from '../../src/lib/constants';
import { hexToOklch, deltaEOK } from '../../src/lib/oklch';
import { hueInArc } from '../../src/lib/mood';
import type { HueArc } from '../../src/lib/mood';

// Deterministic RNG so assertions never depend on Math.random.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX6_RE = /^#[0-9a-f]{6}$/;

// Widen an arc by `tol` degrees on each side to absorb 8-bit hex
// quantization (hueInArc normalizes endpoints, so raw over/underflow is fine).
const widen = (arc: HueArc, tol: number): HueArc => [arc[0] - tol, arc[1] + tol];

function pairwiseMinDeltaE(hexes: string[]): number {
  let min = Infinity;
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      const a = hexToOklch(hexes[i])!;
      const b = hexToOklch(hexes[j])!;
      min = Math.min(min, deltaEOK(a, b));
    }
  }
  return min;
}

describe('generatePalette shape', () => {
  test('returns 5 valid lowercase hexes by default', () => {
    const out = generatePalette({ rng: mulberry32(1) });
    expect(out).toHaveLength(5);
    for (const hex of out) expect(hex).toMatch(HEX6_RE);
  });

  test('honors count and clamps it to 2..16', () => {
    expect(generatePalette({ count: 3, rng: mulberry32(2) })).toHaveLength(3);
    expect(generatePalette({ count: 1, rng: mulberry32(2) })).toHaveLength(2);
    expect(generatePalette({ count: 99, rng: mulberry32(2) })).toHaveLength(16);
  });

  test('is deterministic for the same rng seed', () => {
    expect(generatePalette({ rng: mulberry32(42) })).toEqual(generatePalette({ rng: mulberry32(42) }));
  });

  test('different rng seeds give different palettes', () => {
    expect(generatePalette({ rng: mulberry32(7) })).not.toEqual(generatePalette({ rng: mulberry32(8) }));
  });
});

describe('generatePalette seeding', () => {
  test('keeps the seed hex verbatim (lowercased) at index 0', () => {
    const out = generatePalette({ seedHex: '#A62721', rng: mulberry32(3) });
    expect(out[0]).toBe('#a62721');
    expect(out).toHaveLength(5);
  });

  test('seed survives even when a mood would exclude it', () => {
    const ocean = MOOD_PRESETS.find(m => m.id === 'deep-ocean')!;
    const out = generatePalette({ seedHex: '#ff0000', mood: ocean, rng: mulberry32(4) });
    expect(out[0]).toBe('#ff0000'); // never mood-clamped: the user's pick wins
  });

  test('invalid seed is ignored (fully random palette)', () => {
    const out = generatePalette({ seedHex: 'red', rng: mulberry32(5) });
    expect(out).toHaveLength(5);
    for (const hex of out) expect(hex).toMatch(HEX6_RE);
  });
});

describe('generatePalette perceptual spacing', () => {
  test('default envelope keeps every base pair at least ΔE_OK 0.05 apart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const out = generatePalette({ rng: mulberry32(seed) });
      expect(pairwiseMinDeltaE(out)).toBeGreaterThanOrEqual(0.05);
    }
  });

  test('bases stay distinct under a tight mood envelope (best-effort floor)', () => {
    const gothic = MOOD_PRESETS.find(m => m.id === 'gothic-horror')!;
    for (let seed = 1; seed <= 10; seed++) {
      const out = generatePalette({ mood: gothic, rng: mulberry32(seed) });
      expect(pairwiseMinDeltaE(out)).toBeGreaterThanOrEqual(0.03);
    }
  });
});

describe('generatePalette mood envelopes', () => {
  test('cyberpunk output lands inside the envelope', () => {
    const cyberpunk = MOOD_PRESETS.find(m => m.id === 'cyberpunk')!;
    for (let seed = 1; seed <= 10; seed++) {
      for (const hex of generatePalette({ mood: cyberpunk, rng: mulberry32(seed) })) {
        const ok = hexToOklch(hex)!;
        expect(ok.L).toBeGreaterThanOrEqual(cyberpunk.lightness[0] - 0.02);
        expect(ok.L).toBeLessThanOrEqual(cyberpunk.lightness[1] + 0.02);
        // C floor is best-effort (gamutMap only ever REDUCES chroma).
        expect(ok.C).toBeLessThanOrEqual(cyberpunk.chroma[1] + 0.01);
        expect(cyberpunk.hueArcs.some(a => hueInArc(ok.H, widen(a, 2)))).toBe(true);
      }
    }
  });

  test('multi-arc mood (gothic) keeps every hue inside one of the arcs', () => {
    const gothic = MOOD_PRESETS.find(m => m.id === 'gothic-horror')!;
    for (let seed = 1; seed <= 10; seed++) {
      for (const hex of generatePalette({ mood: gothic, rng: mulberry32(seed) })) {
        const ok = hexToOklch(hex)!;
        expect(ok.L).toBeLessThanOrEqual(gothic.lightness[1] + 0.02);
        expect(ok.C).toBeLessThanOrEqual(gothic.chroma[1] + 0.01);
        if (ok.C >= 0.02) { // hue is only meaningful for chromatic output
          expect(gothic.hueArcs.some(a => hueInArc(ok.H, widen(a, 4)))).toBe(true);
        }
      }
    }
  });

  test('default envelope biases toward pleasing mid-tones, not full gamut', () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const hex of generatePalette({ rng: mulberry32(seed) })) {
        const ok = hexToOklch(hex)!;
        expect(ok.L).toBeGreaterThanOrEqual(DEFAULT_GENERATOR_ENVELOPE.lightness[0] - 0.02);
        expect(ok.L).toBeLessThanOrEqual(DEFAULT_GENERATOR_ENVELOPE.lightness[1] + 0.02);
        expect(ok.C).toBeLessThanOrEqual(DEFAULT_GENERATOR_ENVELOPE.chroma[1] + 0.01);
      }
    }
  });
});
