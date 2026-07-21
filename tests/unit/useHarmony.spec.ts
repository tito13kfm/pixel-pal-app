// Regression coverage: the harmony add handlers checked baseColors
// membership with a case-sensitive `.includes()`, but hslToHex/rgbToHex
// always emit lowercase hex while baseColors can hold an uppercase entry
// (handleGenerate's manual Single Color path writes colorInput verbatim,
// unnormalized). A harmony-derived color equal case-insensitively to an
// existing uppercase base slipped past the duplicate check and got added
// as a second ramp for the same color.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHarmony } from '../../src/hooks/useHarmony';
import { useRampsStore } from '../../src/store/rampsStore';

function resetStore(baseColors: string[]) {
  useRampsStore.setState({
    baseColors,
    aiColorNames: [],
    rampSize: 6,
    shuffleSeed: 0,
    overrides: {},
    harmonyAnchor: 0,
    rampSizeOverrides: {},
    rampSatOverrides: {},
    hueShiftStrengthPerRamp: {},
    hiddenShades: {},
    rampShuffleOffsets: {},
    hardwareLock: null,
    hueShiftStrength: 1.0,
    lockedRamps: new Set(),
    collapsedRamps: new Set(),
    lightnessCurvePerRamp: {},
    satCurvePerRamp: {},
    rampStyleOverrides: {},
    rampStyleScalars: {},
    editingIndex: null,
    editorHsv: { h: 0, s: 0, v: 0 },
    pinEditor: null,
    compareMode: false,
    compareAnchor: null,
    compareResult: null,
  });
}

function setupHook() {
  return renderHook(() => useHarmony({
    safeAnchor: 0,
    activeMood: null,
    tagNextLabel: vi.fn(),
    setExportFeedback: vi.fn(),
  }));
}

describe('useHarmony duplicate detection is case-insensitive', () => {
  it('addHarmonyColor does not add a color already present under a different case', () => {
    resetStore(['#AABBCC']);
    const hook = setupHook();
    act(() => { hook.result.current.addHarmonyColor('#aabbcc', 'Complement'); });
    expect(useRampsStore.getState().baseColors).toEqual(['#AABBCC']);
  });

  it('addHarmonyPair skips both slots already present under a different case', () => {
    resetStore(['#AABBCC', '#112233']);
    const hook = setupHook();
    act(() => { hook.result.current.addHarmonyPair('#aabbcc', '#112233', 'A', 'B'); });
    expect(useRampsStore.getState().baseColors).toEqual(['#AABBCC', '#112233']);
  });

  it('addHarmonyMany skips a pair entry already present under a different case', () => {
    resetStore(['#AABBCC']);
    const hook = setupHook();
    act(() => {
      hook.result.current.addHarmonyMany([
        { hex: '#aabbcc', name: 'Dup' },
        { hex: '#334455', name: 'New' },
      ]);
    });
    expect(useRampsStore.getState().baseColors).toEqual(['#AABBCC', '#334455']);
  });
});
