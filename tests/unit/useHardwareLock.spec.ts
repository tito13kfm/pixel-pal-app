import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHardwareLock } from '../../src/hooks/useHardwareLock';
import { useRampsStore } from '../../src/store/rampsStore';
import { HARDWARE_PALETTES } from '../../src/lib/constants';

vi.mock('../../src/lib/ramp-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/ramp-helpers')>();
  return { ...actual, generateRamp: vi.fn(actual.generateRamp) };
});

import { generateRamp } from '../../src/lib/ramp-helpers';

function setup() {
  const params = {
    activeHardware: HARDWARE_PALETTES.find(h => h.id === 'nes')!,
    gamutPerRamp: {},
    tagNextLabel: vi.fn(),
    setExportFeedback: vi.fn(),
  };
  const hook = renderHook(() => useHardwareLock(params));
  return { hook, params };
}

describe('useHardwareLock', () => {
  beforeEach(() => {
    useRampsStore.setState({
      baseColors: ['#3355aa'],
      hardwareLock: 'nes',
      overrides: {},
      rampSize: 5,
      rampSizeOverrides: {},
      rampSatOverrides: {},
      hueShiftStrength: 1.0,
      hueShiftStrengthPerRamp: {},
      shuffleSeed: 0,
      rampShuffleOffsets: {},
      lightnessCurvePerRamp: {},
      satCurvePerRamp: {},
      stylePresets: {},
    } as any);
    (generateRamp as any).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('bakeHardwareLock resolves a per-ramp hue-shift override, matching the live/snapshot mirror (buildRamp)', () => {
    useRampsStore.setState({ hueShiftStrength: 1.0, hueShiftStrengthPerRamp: { 0: 1.8 } } as any);
    const { hook } = setup();
    act(() => { hook.result.current.bakeHardwareLock(); });
    // generateRamp's 4th positional arg is hueShiftStrength (see ramp-helpers.ts).
    // buildRamp (ramp-pipeline.ts) resolves this per-ramp via
    // hueShiftStrengthPerRamp[i] ?? hueShiftStrength; bakeHardwareLock must
    // resolve it the same way instead of always passing the global value.
    const callsForRamp0 = (generateRamp as any).mock.calls.filter((c: any[]) => c[4] === 0);
    expect(callsForRamp0.length).toBeGreaterThan(0);
    for (const call of callsForRamp0) {
      expect(call[3]).toBe(1.8);
    }
  });

  it('bakeHardwareLock falls back to the global hueShiftStrength when no per-ramp override exists', () => {
    useRampsStore.setState({ hueShiftStrength: 1.0, hueShiftStrengthPerRamp: {} } as any);
    const { hook } = setup();
    act(() => { hook.result.current.bakeHardwareLock(); });
    const callsForRamp0 = (generateRamp as any).mock.calls.filter((c: any[]) => c[4] === 0);
    expect(callsForRamp0.length).toBeGreaterThan(0);
    for (const call of callsForRamp0) {
      expect(call[3]).toBe(1.0);
    }
  });
});
