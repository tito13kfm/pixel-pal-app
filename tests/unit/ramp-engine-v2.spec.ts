import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from '../../src/lib/style-presets';

const BASES = { green: '#37cd76', navy: '#1a2f6b', red: '#cc3344', grey: '#888888', yellow: '#e8d24a' };
const HUES = Object.values(BASES);   // light/dark/mid stress cases
const SIZES = [2, 4, 5, 6, 7, 8, 16, 64];   // covers the app's 4-8 operating range + extremes

const ramp = (hex: string, N: number) => {
  const { reach, chromaFalloff } = styleToScalars('punchy', DEFAULT_STYLE_PRESETS);
  return generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0 });
};
const baseIdx = (hex: string, N: number) =>
  ramp(hex, N).findIndex(s => s.hex.toLowerCase() === hex.toLowerCase());

// Acceptance is the BALANCE guarantee, not per-step ΔL evenness. v2 controls one
// thing: where the base sits in the ramp (slot allocation). The eased lightness
// curve — shared with v1, deliberately non-uniform (small step near base, big at
// the extreme) — owns step spacing, so a "max ΔL ≤ 1.5× median" target is
// curve-bound and unsatisfiable at small N (structural; v1==v2 at N=4). The
// "looks even" judgement is the human visual gate (user-approved v1-vs-v2 strips
// across N=4..16); the automated gates here are: base never stranded at an end,
// ≥2 shades per side when N allows, and strict L-monotonicity.

describe('v2 distribution — balance guarantee', () => {
  it('green N=7 has ≥2 highlights (base not stranded at the top — the #35 fix)', () => {
    expect(7 - 1 - baseIdx('#37cd76', 7)).toBeGreaterThanOrEqual(2);
  });

  for (const hex of HUES) {
    for (const N of [5, 6, 7, 8, 16, 64]) {       // N ≥ 5 ⇒ ≥2 shadows AND ≥2 highlights fit
      it(`≥2 shadows and ≥2 highlights — ${hex} N=${N}`, () => {
        const i = baseIdx(hex, N);
        expect(i).toBeGreaterThanOrEqual(2);         // ≥2 shadows below the base
        expect(N - 1 - i).toBeGreaterThanOrEqual(2); // ≥2 highlights above the base
      });
    }
  }

  for (const hex of HUES) {
    for (const N of SIZES) {
      it(`L strictly monotonic — ${hex} N=${N}`, () => {
        const Ls = ramp(hex, N).map(s => s.oklch.L);
        for (let i = 1; i < Ls.length; i++) expect(Ls[i]).toBeGreaterThan(Ls[i - 1]);
      });
    }
  }
});

describe('v2 tiny N edge cases', () => {
  it('N=2 light base → the one non-base shade is a shadow (base at top)', () => {
    expect(baseIdx('#37cd76', 2)).toBe(1);   // farther cap is dark ⇒ 1 shadow, 0 highlight
  });
  it('N=2 dark base → the one non-base shade is a highlight (base at bottom)', () => {
    expect(baseIdx('#1a2f6b', 2)).toBe(0);   // farther cap is light ⇒ 0 shadow, 1 highlight
  });
  it('N=3 and N=4 never place the base at an end', () => {
    for (const hex of ['#37cd76', '#1a2f6b']) {
      for (const N of [3, 4]) {
        const i = baseIdx(hex, N);
        expect(i).toBeGreaterThan(0);
        expect(i).toBeLessThan(N - 1);
      }
    }
  });
});

// Frozen v2 output — the regression guard the visual sign-off restores. Recorded
// only AFTER the v1-vs-v2 strips (N=4..16, including the 5/6/8 operating range)
// were user-approved; if a value here changes, v2 allocation drifted — STOP.
describe('v2 ramp characterization (frozen — must not change)', () => {
  for (const [name, hex] of Object.entries(BASES)) {
    for (const N of SIZES) {
      it(`${name} N=${N}`, () => {
        expect(ramp(hex, N).map(s => s.hex)).toMatchSnapshot();
      });
    }
  }
});
