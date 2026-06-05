import { describe, it, expect } from 'vitest';
import { buildRamp } from '../../src/lib/ramp-pipeline';
import { buildRampsForSnapshot } from '../../src/lib/snapshot-ramps';

// The mirror is now STRUCTURAL: buildRampsForSnapshot delegates to the same
// per-base buildRamp the live App.tsx memos call, so the two can't diverge by
// construction. This test guards that single code path (and that buildRamp is
// exported with the agreed signature). NOTE: once buildRampsForSnapshot is
// `map(i => buildRamp(...))`, the equality below is near-tautological — the real
// byte-identity guard is ramp-pipeline-characterization.spec.ts (full feature
// set, captured before the extraction).

const snap = { baseColors: ['#37cd76', '#1a2f6b'], rampSize: 7, hardwareLock: null };

describe('buildRamp ↔ buildRampsForSnapshot mirror', () => {
  it('snapshot path equals per-base buildRamp (v1)', () => {
    const viaSnapshot = buildRampsForSnapshot(snap, 'punchy');
    const viaBuild = snap.baseColors.map((_, i) => buildRamp(snap, 'punchy', i));
    expect(viaBuild).toEqual(viaSnapshot);
  });

  it('snapshot path equals per-base buildRamp (v2)', () => {
    const s2 = { ...snap, engineVersion: 2 };
    const viaSnapshot = buildRampsForSnapshot(s2, 'punchy');
    const viaBuild = s2.baseColors.map((_, i) => buildRamp(s2, 'punchy', i));
    expect(viaBuild).toEqual(viaSnapshot);
  });

  it('holds with the live field set (pins, per-ramp curve/hue, sat override, shuffle)', () => {
    const live = {
      baseColors: ['#37cd76', '#1a2f6b', '#cc3344'],
      rampSize: 7,
      rampSizeOverrides: { 1: 5 },
      rampSatOverrides: { 2: 0.5 },
      overrides: { 0: { 3: { punchy: '#abcdef' } } },
      hardwareLock: null,
      hueShiftStrength: 1.0,
      hueShiftStrengthPerRamp: { 0: 0.2, 1: 2.0 },
      lightnessCurvePerRamp: { 0: [{ t: 0, v: 0 }, { t: 0.5, v: 0.5 }, { t: 1, v: 1 }] },
      satCurvePerRamp: { 1: [{ t: 0, v: 1 }, { t: 0.5, v: 1.6 }, { t: 1, v: 1 }] },
      shuffleSeed: 42,
      rampShuffleOffsets: { 2: 5 },
    };
    const viaSnapshot = buildRampsForSnapshot(live, 'punchy');
    const viaBuild = live.baseColors.map((_, i) => buildRamp(live, 'punchy', i));
    expect(viaBuild).toEqual(viaSnapshot);
  });
});
