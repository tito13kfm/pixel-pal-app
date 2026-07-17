import { describe, it, expect } from 'vitest';
import { computePermutation } from '../../src/lib/permute-indexed-state';
import { permuteStringKeyMap, permuteRampState } from '../../src/lib/permute-indexed-state';

describe('computePermutation', () => {
  // order[newPos] = oldIndex ; next[oldIndex] = newPos
  it('moves first to last (0 -> after 2) for n=3', () => {
    const { order, next } = computePermutation(3, 0, 2, 'after');
    expect(order).toEqual([1, 2, 0]);
    expect(next).toEqual([2, 0, 1]); // old 0 -> pos 2, old 1 -> pos 0, old 2 -> pos 1
  });

  it('moves last to first (2 -> before 0) for n=3', () => {
    const { order, next } = computePermutation(3, 2, 0, 'before');
    expect(order).toEqual([2, 0, 1]);
    expect(next).toEqual([1, 2, 0]);
  });

  it('adjacent swap (1 -> before 0) for n=3', () => {
    const { order } = computePermutation(3, 1, 0, 'before');
    expect(order).toEqual([1, 0, 2]);
  });

  it('drop onto self is identity (1 -> after 1)', () => {
    const { order, next } = computePermutation(3, 1, 1, 'after');
    expect(order).toEqual([0, 1, 2]);
    expect(next).toEqual([0, 1, 2]);
  });
});

describe('permuteStringKeyMap', () => {
  it('remaps numeric-string keys through next, drops absent keys', () => {
    // next: old 0 -> 2, old 1 -> 0, old 2 -> 1
    const out = permuteStringKeyMap({ '0': 'a', '2': 'c' }, [2, 0, 1]);
    expect(out).toEqual({ '2': 'a', '1': 'c' }); // sparse gap at old 1 preserved as gap
  });
});

describe('permuteRampState', () => {
  // 3-ramp state, every structure seeded with an identifiable value per ramp.
  const state = {
    baseColors: ['#aa0000', '#00bb00', '#0000cc'],
    aiColorNames: ['red', 'green', 'blue'],
    overrides: { '0': { 0: { punchy: '#111' } }, '2': { 1: { muted: '#999' } } },
    rampSizeOverrides: { '0': 4, '1': 7 },
    rampSatOverrides: { '2': 1.5 },
    hueShiftStrengthPerRamp: { '1': 0.5 },
    hiddenShades: { '0': [2, 3] },
    rampShuffleOffsets: { '2': 9 },
    lightnessCurvePerRamp: { '1': [[0, 0], [1, 1]] },
    satCurvePerRamp: { '0': [[0, 0.2]] },
    // Per-ramp style maps (#69): one distinct value per ramp so a
    // permutation that put a value on the wrong ramp is caught.
    rampStyleOverrides: { '0': 'muted', '1': 'custom', '2': 'balanced' },
    rampStyleScalars: { '1': { reach: 0.11, chromaFalloff: 0.22 } },
    lockedRamps: [0, 2],
    collapsedRamps: [1],
    harmonyAnchor: 2,
  };

  it('moves ramp 0 to last: every structure follows the permutation', () => {
    const perm = computePermutation(3, 0, 2, 'after'); // next = [2,0,1]
    const out = permuteRampState(state, perm);

    expect(out.baseColors).toEqual(['#00bb00', '#0000cc', '#aa0000']);
    expect(out.aiColorNames).toEqual(['green', 'blue', 'red']);

    expect(out.overrides).toEqual({ '2': { 0: { punchy: '#111' } }, '1': { 1: { muted: '#999' } } });
    expect(out.rampSizeOverrides).toEqual({ '2': 4, '0': 7 });
    expect(out.rampSatOverrides).toEqual({ '1': 1.5 });
    expect(out.hueShiftStrengthPerRamp).toEqual({ '0': 0.5 });
    expect(out.hiddenShades).toEqual({ '2': [2, 3] });
    expect(out.rampShuffleOffsets).toEqual({ '1': 9 });
    expect(out.lightnessCurvePerRamp).toEqual({ '0': [[0, 0], [1, 1]] });
    expect(out.satCurvePerRamp).toEqual({ '2': [[0, 0.2]] });
    // old 0->2, old 1->0, old 2->1
    expect(out.rampStyleOverrides).toEqual({ '2': 'muted', '0': 'custom', '1': 'balanced' });
    expect(out.rampStyleScalars).toEqual({ '0': { reach: 0.11, chromaFalloff: 0.22 } });

    expect(out.lockedRamps).toEqual([1, 2]);   // old 0->2, old 2->1
    expect(out.collapsedRamps).toEqual([0]);   // old 1->0
    expect(out.harmonyAnchor).toEqual(1);      // old 2 -> 1
  });

  it('moves last ramp to first: per-ramp style maps follow the permutation', () => {
    const perm = computePermutation(3, 2, 0, 'before'); // next = [1,2,0]
    const out = permuteRampState(state, perm);
    // old 0->1, old 1->2, old 2->0
    expect(out.rampStyleOverrides).toEqual({ '1': 'muted', '2': 'custom', '0': 'balanced' });
    expect(out.rampStyleScalars).toEqual({ '2': { reach: 0.11, chromaFalloff: 0.22 } });
  });

  it('adjacent swap keeps each style value on its own ramp', () => {
    const perm = computePermutation(3, 1, 0, 'before'); // swaps ramps 0 and 1; next = [1,0,2]
    const out = permuteRampState(state, perm);
    // old 0->1, old 1->0, old 2->2
    expect(out.rampStyleOverrides).toEqual({ '1': 'muted', '0': 'custom', '2': 'balanced' });
    expect(out.rampStyleScalars).toEqual({ '0': { reach: 0.11, chromaFalloff: 0.22 } });
  });

  it('no-op permutation returns equal data', () => {
    const perm = computePermutation(3, 1, 1, 'after');
    const out = permuteRampState(state, perm);
    expect(out.baseColors).toEqual(state.baseColors);
    expect(out.lockedRamps).toEqual([0, 2]);
    expect(out.harmonyAnchor).toEqual(2);
  });

  it('leaves a shorter-than-n array untouched (aiColorNames = [])', () => {
    const perm = computePermutation(3, 0, 2, 'after');
    const out = permuteRampState({ ...state, aiColorNames: [] }, perm);
    expect(out.aiColorNames).toEqual([]); // not turned into [undefined, undefined, undefined]
  });
});
