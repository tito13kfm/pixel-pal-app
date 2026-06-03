import { describe, it, expect } from 'vitest';
import { buildRampsForSnapshot, seededHueDelta } from '../../src/lib/snapshot-ramps';

describe('seededHueDelta', () => {
  it('returns 0 for seed 0 at any ramp index', () => {
    expect(seededHueDelta(0, 0)).toBe(0);
    expect(seededHueDelta(0, 7)).toBe(0);
  });
  it('is deterministic and within ±8 degrees', () => {
    const a = seededHueDelta(42, 3);
    expect(seededHueDelta(42, 3)).toBe(a);
    expect(Math.abs(a)).toBeLessThanOrEqual(8);
  });
});

describe('buildRampsForSnapshot', () => {
  it('returns [] for a missing or empty snapshot', () => {
    expect(buildRampsForSnapshot(null, 'balanced')).toEqual([]);
    expect(buildRampsForSnapshot({ baseColors: [] }, 'balanced')).toEqual([]);
  });
  it('produces one ramp of valid hexes per base color', () => {
    const ramps = buildRampsForSnapshot({ baseColors: ['#cc3344'], rampSize: 5 }, 'balanced');
    expect(ramps).toHaveLength(1);
    expect(ramps[0].length).toBe(5);
    ramps[0].forEach(h => expect(h).toMatch(/^#[0-9a-fA-F]{6}$/));
  });
  it('is deterministic for the same snapshot', () => {
    const snap = { baseColors: ['#3366cc', '#cc6633'], rampSize: 6 };
    expect(buildRampsForSnapshot(snap, 'punchy')).toEqual(buildRampsForSnapshot(snap, 'punchy'));
  });
  it('drops hidden shade indices from the ramp', () => {
    const full = buildRampsForSnapshot({ baseColors: ['#cc3344'], rampSize: 5 }, 'balanced');
    const withHidden = buildRampsForSnapshot(
      { baseColors: ['#cc3344'], rampSize: 5, hiddenShades: { 0: [0, 4] } }, 'balanced');
    expect(withHidden[0]).toEqual([full[0][1], full[0][2], full[0][3]]);
  });
});
