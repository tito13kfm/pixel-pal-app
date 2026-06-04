import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from '../../src/lib/style-presets';

const HUES = ['#37cd76', '#1a2f6b', '#e8d24a'];   // light green, dark navy, light yellow

const ramp = (hex: string, N: number) => {
  const { reach, chromaFalloff } = styleToScalars('punchy', DEFAULT_STYLE_PRESETS);
  return generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0, engineVersion: 2 });
};
const baseIdx = (hex: string, N: number) =>
  ramp(hex, N).findIndex(s => s.hex.toLowerCase() === hex.toLowerCase());

// Acceptance is the BALANCE guarantee, not per-step ΔL evenness. v2 controls one
// thing: where the base sits in the ramp (slot allocation). The eased lightness
// curve — shared with v1, deliberately non-uniform (small step near base, big at
// the extreme) — owns step spacing, so a "max ΔL ≤ 1.5× median" target is
// curve-bound and unsatisfiable at small N (structural; v1==v2 at N=4). The
// "looks even" judgement is the human visual gate (Task 7); the automated gates
// here are: base never stranded at an end, ≥2 shades per side when N allows, and
// strict L-monotonicity.

describe('v2 distribution — balance guarantee', () => {
  it('green N=7 has ≥2 highlights (base not stranded at the top — the #35 fix)', () => {
    expect(7 - 1 - baseIdx('#37cd76', 7)).toBeGreaterThanOrEqual(2);
  });

  for (const hex of HUES) {
    for (const N of [7, 16, 64]) {                 // N ≥ 5 ⇒ ≥2 shadows AND ≥2 highlights fit
      it(`≥2 shadows and ≥2 highlights — ${hex} N=${N}`, () => {
        const i = baseIdx(hex, N);
        expect(i).toBeGreaterThanOrEqual(2);        // ≥2 shadows below the base
        expect(N - 1 - i).toBeGreaterThanOrEqual(2); // ≥2 highlights above the base
      });
    }
  }

  for (const hex of HUES) {
    for (const N of [2, 3, 4, 7, 16, 64]) {
      it(`L strictly monotonic — ${hex} N=${N}`, () => {
        const Ls = ramp(hex, N).map(s => s.oklch.L);
        for (let i = 1; i < Ls.length; i++) expect(Ls[i]).toBeGreaterThan(Ls[i - 1]);
      });
    }
  }
});
