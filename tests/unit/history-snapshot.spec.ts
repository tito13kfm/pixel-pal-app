import { describe, it, expect } from 'vitest';
import { inferLabel, SNAPSHOT_FIELDS } from '../../src/lib/history-snapshot';

const base = {
  baseColors: ['#ff00ff'], aiColorNames: [], aiReasoning: '', rampSize: 6,
  shuffleSeed: 0, overrides: {}, harmonyAnchor: 0, rampSizeOverrides: {},
  rampSatOverrides: {}, hueShiftStrengthPerRamp: {}, hiddenShades: {},
  rampShuffleOffsets: {}, hardwareLock: null, hueShiftStrength: 1.0,
  lockedRamps: [], collapsedRamps: [], lightnessCurvePerRamp: {},
  satCurvePerRamp: {}, stylePresets: {},
};

describe('SNAPSHOT_FIELDS', () => {
  it('names exactly the 20 document fields', () => {
    expect(SNAPSHOT_FIELDS).toEqual([
      'baseColors', 'aiColorNames', 'aiReasoning', 'rampSize', 'shuffleSeed',
      'overrides', 'harmonyAnchor', 'rampSizeOverrides', 'rampSatOverrides',
      'hueShiftStrengthPerRamp', 'hiddenShades', 'rampShuffleOffsets',
      'hardwareLock', 'hueShiftStrength', 'lockedRamps', 'collapsedRamps',
      'lightnessCurvePerRamp', 'satCurvePerRamp', 'stylePresets',
      'engineVersion',
    ]);
  });
});

describe('inferLabel', () => {
  it('returns Edit when prev or next missing', () => {
    expect(inferLabel(null, base)).toBe('Edit');
    expect(inferLabel(base, null)).toBe('Edit');
  });
  it('detects Add ramp / Remove ramp / Edit base color', () => {
    expect(inferLabel(base, { ...base, baseColors: ['#ff00ff', '#00ff00'] })).toBe('Add ramp');
    expect(inferLabel({ ...base, baseColors: ['#a', '#b'] }, base)).toBe('Remove ramp');
    expect(inferLabel(base, { ...base, baseColors: ['#111111'] })).toBe('Edit base color');
  });
  it('detects pin/unpin, hide/restore, lock/unlock, shuffle', () => {
    expect(inferLabel(base, { ...base, overrides: { 0: '#fff' } })).toBe('Pin / unpin shade');
    expect(inferLabel(base, { ...base, hiddenShades: { 0: [1] } })).toBe('Hide / restore shade');
    expect(inferLabel(base, { ...base, lockedRamps: [0] })).toBe('Lock / unlock ramp');
    expect(inferLabel(base, { ...base, rampShuffleOffsets: { 0: 2 } })).toBe('Shuffle ramp');
  });
  it('detects saturation, per-ramp hue, ramp size, shade count', () => {
    expect(inferLabel(base, { ...base, rampSatOverrides: { 0: 1.2 } })).toBe('Adjust saturation');
    expect(inferLabel(base, { ...base, hueShiftStrengthPerRamp: { 0: 0.5 } })).toBe('Adjust ramp hue shift');
    expect(inferLabel(base, { ...base, rampSizeOverrides: { 0: 8 } })).toBe('Change ramp size');
    expect(inferLabel(base, { ...base, rampSize: 8 })).toBe('Change shade count');
  });
  it('detects global hue shift, hardware lock/unlock, harmony anchor, generate, collapse', () => {
    expect(inferLabel(base, { ...base, hueShiftStrength: 1.5 })).toBe('Adjust hue shift');
    expect(inferLabel(base, { ...base, hardwareLock: 'nes' })).toBe('Lock to nes');
    expect(inferLabel({ ...base, hardwareLock: 'nes' }, base)).toBe('Unlock hardware');
    expect(inferLabel(base, { ...base, harmonyAnchor: 2 })).toBe('Change harmony anchor');
    expect(inferLabel(base, { ...base, shuffleSeed: 1 })).toBe('Generate');
    expect(inferLabel(base, { ...base, collapsedRamps: [0] })).toBe('Collapse / expand ramps');
  });
  it('falls back to Edit for unrecognized change', () => {
    expect(inferLabel(base, base)).toBe('Edit');
  });
  it('returns Edit for snapshot fields it does not specifically label', () => {
    expect(inferLabel(base, { ...base, stylePresets: { punchy: {} } })).toBe('Edit');
    expect(inferLabel(base, { ...base, lightnessCurvePerRamp: { 0: [] } })).toBe('Edit');
    expect(inferLabel(base, { ...base, satCurvePerRamp: { 0: [] } })).toBe('Edit');
    expect(inferLabel(base, { ...base, aiColorNames: ['x'] })).toBe('Edit');
    expect(inferLabel(base, { ...base, aiReasoning: 'changed' })).toBe('Edit');
  });
});
