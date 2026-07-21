// Regression: handleGenerate's 'color' branch wrote colorInput into
// baseColors verbatim, unnormalized. Every duplicate-detection reader
// against baseColors (addColorAsBase, useHarmony's add handlers,
// HarmonyPanel, RampsPanel) does a case-insensitive compare on the
// assumption that baseColors is lowercase-canonical; a manually-typed
// uppercase hex broke that assumption at the source. Normalizing here
// closes the root cause instead of patching every reader.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGenerationActions } from '../../src/hooks/useGenerationActions';
import { useRampsStore } from '../../src/store/rampsStore';

function resetStore() {
  useRampsStore.setState({
    baseColors: [],
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

describe('handleGenerate normalizes colorInput to lowercase', () => {
  beforeEach(resetStore);

  it('writes a lowercase entry to baseColors given an uppercase colorInput', () => {
    const { result } = renderHook(() => useGenerationActions({
      mode: 'color',
      colorInput: '#AABBCC',
      setColorInput: vi.fn(),
      activeMood: null,
      tagNextLabel: vi.fn(),
      resetPaletteState: vi.fn(),
      bumpShuffleSeed: vi.fn(),
    }));
    act(() => { result.current.handleGenerate(); });
    expect(useRampsStore.getState().baseColors).toEqual(['#aabbcc']);
  });
});
