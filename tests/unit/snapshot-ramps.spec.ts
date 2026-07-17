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
  it('honors rampSize across the full 2..64 range', () => {
    for (const size of [2, 3, 16, 64]) {
      const ramps = buildRampsForSnapshot({ baseColors: ['#3366cc'], rampSize: size }, 'balanced');
      expect(ramps[0]).toHaveLength(size);
    }
  });
  it('honors per-ramp size overrides in the full range and drops out-of-range ones', () => {
    const ramps = buildRampsForSnapshot({
      baseColors: ['#3366cc', '#cc6633', '#33cc66'],
      rampSize: 5,
      rampSizeOverrides: { 0: 2, 1: 64, 2: 65 },
    }, 'balanced');
    expect(ramps[0]).toHaveLength(2);
    expect(ramps[1]).toHaveLength(64);
    expect(ramps[2]).toHaveLength(5); // 65 is out of range -> global
  });

  it('with no styleOverride, resolves each ramp\'s own active style from the snapshot', () => {
    const snap = {
      baseColors: ['#3366cc', '#cc6633', '#33cc66'],
      rampSize: 5,
      paletteDefaultStyle: 'muted' as const,
      rampStyleOverrides: { 0: 'punchy' as const },
    };
    const mixed = buildRampsForSnapshot(snap);
    const allMuted = buildRampsForSnapshot(snap, 'muted');
    const allPunchy = buildRampsForSnapshot(snap, 'punchy');
    // index 0 overridden to punchy, indices 1 and 2 fall back to the muted default
    expect(mixed[0]).toEqual(allPunchy[0]);
    expect(mixed[1]).toEqual(allMuted[1]);
    expect(mixed[2]).toEqual(allMuted[2]);
  });

  it('with no styleOverride and no paletteDefaultStyle, defaults to punchy', () => {
    const snap = { baseColors: ['#3366cc'], rampSize: 5 };
    expect(buildRampsForSnapshot(snap)).toEqual(buildRampsForSnapshot(snap, 'punchy'));
  });
});
