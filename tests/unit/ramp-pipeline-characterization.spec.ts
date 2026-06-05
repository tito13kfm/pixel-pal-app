import { describe, it, expect } from 'vitest';
import { buildRampsForSnapshot } from '../../src/lib/snapshot-ramps';

// FULL-PIPELINE characterization — the guard for buildRampsForSnapshot's
// resolve/pin/hardware-snap/hidden-filter chain plus the exact field set the
// live App.tsx memo feeds the engine. Freezes the whole chain across pins +
// hidden + hardware lock + per-ramp lightness/sat curve + sat override + size
// override + shuffle. Post-#70 there is ONE engine (v2); this snapshot is the
// recorded v2 output. A diff here means the pipeline field-mapping drifted —
// STOP and investigate (engine math is separately pinned by ramp-engine-v2).

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
  // Pin presets to the recorded look so this extraction-drift guard does NOT
  // ride DEFAULT_STYLE_PRESETS — a default-preset change (#40) must not silently
  // shift these "must not change" snapshots.
  stylePresets: {
    punchy:   { reach: 1.0,   chromaFalloff: 0.1 },
    balanced: { reach: 0.575, chromaFalloff: 0.475 },
    muted:    { reach: 0.15,  chromaFalloff: 0.85 },
  },
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
