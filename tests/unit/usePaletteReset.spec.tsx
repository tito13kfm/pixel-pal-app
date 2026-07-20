// resetPaletteState wipes every per-palette customization layer
// (ARCHITECTURE.md "Cross-cutting state-maintenance rules" invariant 1).
//
// Regression coverage for the #69 gap: the shipped per-ramp style maps
// (rampStyleOverrides / rampStyleScalars) were never added to the shared
// wipe, so New palette / Surprise Me / image extract / GPL import leaked
// the previous palette's per-ramp styles onto the new palette's indices.
// paletteDefaultStyle is deliberately preserved (session-level preference,
// same rationale as rampSize / hardwareLock / moodPreset).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaletteReset } from '../../src/hooks/usePaletteReset';
import { useRampsStore } from '../../src/store/rampsStore';

function resetStore() {
  useRampsStore.setState({
    baseColors: ['#ff0000', '#00ff00', '#0000ff'],
    aiColorNames: [],
    rampSize: 6,
    shuffleSeed: 0,
    overrides: { 1: { 2: { punchy: '#123456' } } },
    harmonyAnchor: 1,
    rampSizeOverrides: { 1: 4 },
    rampSatOverrides: {},
    hueShiftStrengthPerRamp: { 2: 1.5 },
    hiddenShades: {},
    rampShuffleOffsets: {},
    hardwareLock: null,
    hueShiftStrength: 0.5,
    lockedRamps: new Set([2]),
    collapsedRamps: new Set([1]),
    lightnessCurvePerRamp: {},
    satCurvePerRamp: {},
    paletteDefaultStyle: 'muted',
    rampStyleOverrides: { 1: 'punchy', 2: 'custom' },
    rampStyleScalars: { 2: { reach: 0.3, chromaFalloff: 0.7 } },
    editingIndex: null,
    editorHsv: { h: 0, s: 0, v: 0 },
    pinEditor: null,
    compareMode: false,
    compareAnchor: null,
    compareResult: null,
    lospecSource: null,
  });
}

function setupHook() {
  const hook = renderHook(() => usePaletteReset({
    setSbsLeft: vi.fn(),
    setSbsRight: vi.fn(),
    setSbsLeftPayload: vi.fn(),
    setSbsRightPayload: vi.fn(),
    setSbsLeftError: vi.fn(),
    setSbsRightError: vi.fn(),
    setSbsLeftLoading: vi.fn(),
    setSbsRightLoading: vi.fn(),
    setRemapOutput: vi.fn(),
    setRemapOutputSignature: vi.fn(),
    setRemapError: vi.fn(),
    confirmReset: false,
    setConfirmReset: vi.fn(),
    setColorInput: vi.fn(),
    tagNextLabel: vi.fn(),
  }));
  return hook;
}

describe('resetPaletteState clears per-palette state, preserves session prefs', () => {
  beforeEach(resetStore);

  it('clears the #69 per-ramp style maps', () => {
    const hook = setupHook();
    act(() => { hook.result.current.resetPaletteState(); });

    const s = useRampsStore.getState();
    expect(s.rampStyleOverrides).toEqual({});
    expect(s.rampStyleScalars).toEqual({});
    // Control: layers that were always wiped still are.
    expect(s.overrides).toEqual({});
    expect(s.rampSizeOverrides).toEqual({});
    expect(s.lockedRamps).toEqual(new Set());
    expect(s.harmonyAnchor).toBe(0);
    expect(s.hueShiftStrength).toBe(1.0);
  });

  it('preserves paletteDefaultStyle (session-level, like rampSize)', () => {
    const hook = setupHook();
    act(() => { hook.result.current.resetPaletteState(); });

    const s = useRampsStore.getState();
    expect(s.paletteDefaultStyle).toBe('muted');
    expect(s.rampSize).toBe(6);
  });

  it('clears lospecSource', () => {
    useRampsStore.getState().setLospecSource({ slug: 'x', title: 'X', author: 'A', url: 'https://lospec.com/palette-list/x' });
    const hook = setupHook();
    act(() => { hook.result.current.resetPaletteState(); });
    expect(useRampsStore.getState().lospecSource).toBeNull();
  });
});
