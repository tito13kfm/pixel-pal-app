// removeRamp / duplicateRamp re-keying of the per-ramp advanced settings
// (ARCHITECTURE.md "Cross-cutting state-maintenance rules" invariant 3).
//
// Regression coverage for the gap tracked on #113: removeRamp historically
// dropped/shifted seven base-keyed structures but skipped
// hueShiftStrengthPerRamp / lightnessCurvePerRamp / satCurvePerRamp /
// gamutPerRamp, and duplicateRamp did not carry those four to the copy:
// removing a ramp silently attached a later ramp's hue shift, Advanced
// curve, or gamut strategy to the wrong index, and a duplicate rendered
// differently from its source.
//
// The #69 per-ramp style maps (rampStyleOverrides / rampStyleScalars)
// repeated the same miss post-0.26.0: removing a ramp attached a later
// ramp's active style to the wrong index, and a duplicate lost its
// source's style override / custom scalars. Covered here alongside the
// #113 four.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRampEditing } from '../../src/hooks/useRampEditing';
import { useRampsStore } from '../../src/store/rampsStore';

const CURVE_A = [[0, 0], [0.5, 0.6], [1, 1]];
const CURVE_B = [[0, 0.1], [1, 0.9]];

function resetStore() {
  useRampsStore.setState({
    baseColors: ['#ff0000', '#00ff00', '#0000ff'],
    aiColorNames: ['red', 'green', 'blue'],
    rampSize: 6,
    shuffleSeed: 0,
    overrides: {},
    harmonyAnchor: 0,
    rampSizeOverrides: { 1: 4, 2: 8 },
    rampSatOverrides: {},
    hueShiftStrengthPerRamp: { 1: 0.5, 2: 1.5 },
    hiddenShades: {},
    rampShuffleOffsets: {},
    hardwareLock: null,
    hueShiftStrength: 1.0,
    lockedRamps: new Set(),
    collapsedRamps: new Set(),
    lightnessCurvePerRamp: { 1: CURVE_A, 2: CURVE_B },
    satCurvePerRamp: { 2: CURVE_B },
    rampStyleOverrides: { 1: 'muted', 2: 'custom' },
    rampStyleScalars: { 2: { reach: 0.3, chromaFalloff: 0.7 } },
    editingIndex: null,
    editorHsv: { h: 0, s: 0, v: 0 },
    pinEditor: null,
    compareMode: false,
    compareAnchor: null,
    compareResult: null,
  });
}

function setupHook() {
  // gamutPerRamp is App-local state (not store-backed); mirror App.tsx's
  // useState with a plain object + updater-applying setter.
  const gamut: { current: Record<string, unknown> } = { current: { 1: 'clip', 2: 'chroma-preserve' } };
  const setGamutPerRamp = (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => {
    gamut.current = updater(gamut.current);
  };
  const hook = renderHook(() => useRampEditing({
    tagNextLabel: vi.fn(),
    setExportFeedback: vi.fn(),
    setGamutPerRamp,
  }));
  return { hook, gamut };
}

describe('removeRamp re-keys the per-ramp advanced settings', () => {
  beforeEach(resetStore);

  it('drops the removed index and shifts later indices down by 1', () => {
    const { hook, gamut } = setupHook();
    act(() => { hook.result.current.removeRamp(1); });

    const s = useRampsStore.getState();
    expect(s.baseColors).toEqual(['#ff0000', '#0000ff']);
    // Control: the structure that was always re-keyed still is.
    expect(s.rampSizeOverrides).toEqual({ 1: 8 });
    // The four historically-missed structures follow the same rule.
    expect(s.hueShiftStrengthPerRamp).toEqual({ 1: 1.5 });
    expect(s.lightnessCurvePerRamp).toEqual({ 1: CURVE_B });
    expect(s.satCurvePerRamp).toEqual({ 1: CURVE_B });
    expect(gamut.current).toEqual({ 1: 'chroma-preserve' });
    // #69 style maps follow the same drop-and-shift rule.
    expect(s.rampStyleOverrides).toEqual({ 1: 'custom' });
    expect(s.rampStyleScalars).toEqual({ 1: { reach: 0.3, chromaFalloff: 0.7 } });
  });

  it('removing the last ramp leaves earlier entries un-shifted', () => {
    const { hook, gamut } = setupHook();
    act(() => { hook.result.current.removeRamp(2); });

    const s = useRampsStore.getState();
    expect(s.hueShiftStrengthPerRamp).toEqual({ 1: 0.5 });
    expect(s.lightnessCurvePerRamp).toEqual({ 1: CURVE_A });
    expect(s.satCurvePerRamp).toEqual({});
    expect(gamut.current).toEqual({ 1: 'clip' });
    expect(s.rampStyleOverrides).toEqual({ 1: 'muted' });
    expect(s.rampStyleScalars).toEqual({});
  });
});

describe('duplicateRamp carries the per-ramp advanced settings to the copy', () => {
  beforeEach(resetStore);

  it('clones hue shift, curves, and gamut strategy onto the appended index', () => {
    const { hook, gamut } = setupHook();
    act(() => { hook.result.current.duplicateRamp(1); });

    const s = useRampsStore.getState();
    expect(s.baseColors).toEqual(['#ff0000', '#00ff00', '#0000ff', '#00ff00']);
    expect(s.hueShiftStrengthPerRamp).toEqual({ 1: 0.5, 2: 1.5, 3: 0.5 });
    expect(s.lightnessCurvePerRamp).toEqual({ 1: CURVE_A, 2: CURVE_B, 3: CURVE_A });
    // Deep clone, not a shared reference: editing the copy's curve later
    // must not mutate the source ramp's curve.
    expect(s.lightnessCurvePerRamp[3]).not.toBe(s.lightnessCurvePerRamp[1]);
    expect(gamut.current).toEqual({ 1: 'clip', 2: 'chroma-preserve', 3: 'clip' });
    // #69: the source's style override rides along too.
    expect(s.rampStyleOverrides).toEqual({ 1: 'muted', 2: 'custom', 3: 'muted' });
    expect(s.rampStyleScalars).toEqual({ 2: { reach: 0.3, chromaFalloff: 0.7 } });
  });

  it('clones a custom style override and its scalars onto the copy', () => {
    const { hook } = setupHook();
    act(() => { hook.result.current.duplicateRamp(2); });

    const s = useRampsStore.getState();
    expect(s.rampStyleOverrides).toEqual({ 1: 'muted', 2: 'custom', 3: 'custom' });
    expect(s.rampStyleScalars).toEqual({
      2: { reach: 0.3, chromaFalloff: 0.7 },
      3: { reach: 0.3, chromaFalloff: 0.7 },
    });
    // Deep clone: nudging the copy's scalars must not mutate the source's.
    expect(s.rampStyleScalars[3]).not.toBe(s.rampStyleScalars[2]);
  });

  it('does not invent entries the source ramp never had', () => {
    const { hook, gamut } = setupHook();
    act(() => { hook.result.current.duplicateRamp(0); });

    const s = useRampsStore.getState();
    expect(s.hueShiftStrengthPerRamp).toEqual({ 1: 0.5, 2: 1.5 });
    expect(s.lightnessCurvePerRamp).toEqual({ 1: CURVE_A, 2: CURVE_B });
    expect(s.satCurvePerRamp).toEqual({ 2: CURVE_B });
    expect(gamut.current).toEqual({ 1: 'clip', 2: 'chroma-preserve' });
    expect(s.rampStyleOverrides).toEqual({ 1: 'muted', 2: 'custom' });
    expect(s.rampStyleScalars).toEqual({ 2: { reach: 0.3, chromaFalloff: 0.7 } });
  });

  // Regression: duplicateRamp pushed the copy's name onto the END of
  // aiColorNames without padding first, unlike every other add path
  // (addHarmonyColor, addColorAsBase, handleImageClick). If aiColorNames is
  // shorter than baseColors (e.g. right after handleGenerate's 'color'
  // branch, which resets aiColorNames to []), the pushed name landed at the
  // wrong index instead of the new ramp's actual index.
  it('pads aiColorNames to baseColors.length before appending the copy name, when names are shorter', () => {
    useRampsStore.setState({ aiColorNames: [] });
    const { hook } = setupHook();
    act(() => { hook.result.current.duplicateRamp(1); });

    const s = useRampsStore.getState();
    expect(s.baseColors).toEqual(['#ff0000', '#00ff00', '#0000ff', '#00ff00']);
    expect(s.aiColorNames).toEqual(['', '', '', '']);
  });
});
