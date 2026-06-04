import { describe, it, expect } from 'vitest';
import { buildRampsForSnapshot } from '../../src/lib/snapshot-ramps';

// FULL-PIPELINE characterization — the real guard for the Task 2 extraction.
// The engine-level v1 characterization pins generateRamp; it does NOT exercise
// buildRampsForSnapshot's resolve/pin/hardware-snap/hidden-filter chain, nor the
// exact field set the live App.tsx memo feeds the engine. A botched live-snapshot
// field mapping would slip past everything else (mirror test goes tautological
// once buildRampsForSnapshot delegates to buildRamp; build/grep only prove it
// compiles). This freezes the whole chain across pins + hidden + hardware lock +
// per-ramp lightness/sat curve + sat override + size override + shuffle.
//
// Case A / C have NO per-ramp hue → must stay byte-identical through Tasks 2-3.
// Case B adds hueShiftStrengthPerRamp → today the snapshot path IGNORES it
// (global hueShiftStrength only), so B currently equals its global-hue render.
// The approved mirror fix (Task 2 Step 6) makes buildRamp honor per-ramp hue, so
// B's snapshot is EXPECTED to change then (and ONLY B) — the diff is the proof
// that the extraction touched nothing but the intended per-ramp-hue divergence.

const kitchenSink = {
  baseColors: ['#37cd76', '#1a2f6b', '#cc3344'],
  rampSize: 7,
  rampSizeOverrides: { 1: 5 },
  rampSatOverrides: { 2: 0.5 },
  overrides: { 0: { 3: { punchy: '#abcdef', balanced: '#abcdef', muted: '#abcdef' } } },
  hiddenShades: { 0: [0] },
  hardwareLock: null as string | null,
  hueShiftStrength: 1.0,
  lightnessCurvePerRamp: { 0: [{ t: 0, v: 0 }, { t: 0.5, v: 0.5 }, { t: 1, v: 1 }] },
  satCurvePerRamp: { 1: [{ t: 0, v: 1 }, { t: 0.5, v: 1.6 }, { t: 1, v: 1 }] },
  shuffleSeed: 42,
  rampShuffleOffsets: { 2: 5 },
};

describe('full-pipeline characterization (frozen — guards the buildRamp extraction)', () => {
  it('Case A — kitchen sink, no hardware, no per-ramp hue (must not change)', () => {
    expect(buildRampsForSnapshot({ ...kitchenSink }, 'punchy')).toMatchSnapshot();
  });

  it('Case C — kitchen sink + gameboy hardware snap (must not change)', () => {
    expect(buildRampsForSnapshot({ ...kitchenSink, hardwareLock: 'gameboy' }, 'punchy')).toMatchSnapshot();
  });

  it('Case B — kitchen sink + per-ramp hue override (EXPECTED to change at the mirror fix)', () => {
    const snap = { ...kitchenSink, hueShiftStrengthPerRamp: { 0: 0.2, 1: 2.0 } };
    expect(buildRampsForSnapshot(snap, 'punchy')).toMatchSnapshot();
  });
});
