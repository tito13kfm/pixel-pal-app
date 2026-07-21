import { describe, it, expect, beforeEach } from 'vitest';
import { useRampsStore } from '../../src/store/rampsStore';

describe('useRampsStore', () => {
  beforeEach(() => {
    useRampsStore.setState({
      baseColors: ['#ff00ff'],
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
      editingIndex: null,
      editorHsv: { h: 0, s: 0, v: 0 },
      pinEditor: null,
      compareMode: false,
      compareAnchor: null,
      compareResult: null,
      lospecSource: null,
    });
  });

  it('accepts a plain value for a setter', () => {
    useRampsStore.getState().setRampSize(8);
    expect(useRampsStore.getState().rampSize).toBe(8);
  });

  it('accepts a functional updater for a setter (matches useState signature)', () => {
    useRampsStore.getState().setBaseColors(prev => [...prev, '#00ffff']);
    expect(useRampsStore.getState().baseColors).toEqual(['#ff00ff', '#00ffff']);
  });

  it('buildSnapshot serializes Sets as sorted arrays', () => {
    useRampsStore.getState().setLockedRamps(new Set([2, 0, 1]));
    const snap = useRampsStore.getState().buildSnapshot();
    expect(snap.lockedRamps).toEqual([0, 1, 2]);
  });

  it('applySnapshotFields round-trips a buildSnapshot output', () => {
    useRampsStore.getState().setBaseColors(['#111111', '#222222']);
    useRampsStore.getState().setRampSize(4);
    const snap = useRampsStore.getState().buildSnapshot();
    useRampsStore.getState().setBaseColors(['#000000']);
    useRampsStore.getState().setRampSize(8);
    useRampsStore.getState().applySnapshotFields(snap);
    expect(useRampsStore.getState().baseColors).toEqual(['#111111', '#222222']);
    expect(useRampsStore.getState().rampSize).toBe(4);
  });

  it('resetTransientEditors clears editor/compare cluster only', () => {
    useRampsStore.getState().setEditingIndex(1);
    useRampsStore.getState().setPinEditor({ baseIndex: 1, shadeIndex: 2 });
    useRampsStore.getState().setCompareAnchor({ baseIndex: 0, shadeIndex: 0, style: 'punchy', hex: '#fff' });
    useRampsStore.getState().setCompareResult({ aHex: '#fff', bHex: '#000', ratio: 21, tier: 'AAA' });
    useRampsStore.getState().setRampSize(4);
    useRampsStore.getState().resetTransientEditors();
    const s = useRampsStore.getState();
    expect(s.editingIndex).toBeNull();
    expect(s.pinEditor).toBeNull();
    expect(s.compareAnchor).toBeNull();
    expect(s.compareResult).toBeNull();
    expect(s.rampSize).toBe(4);
  });

  it('reorderRamps permutes index-keyed fields and returns the permutation', () => {
    useRampsStore.getState().setBaseColors(['#a', '#b', '#c']);
    useRampsStore.getState().setAiColorNames(['A', 'B', 'C']);
    useRampsStore.getState().setLockedRamps(new Set([0]));
    const perm = useRampsStore.getState().reorderRamps(0, 2, 'after');
    expect(useRampsStore.getState().baseColors).toEqual(['#b', '#c', '#a']);
    expect(useRampsStore.getState().aiColorNames).toEqual(['B', 'C', 'A']);
    expect(useRampsStore.getState().lockedRamps).toEqual(new Set([2]));
    expect(Array.isArray(perm)).toBe(true);
  });

  it('reorderRamps clears the full transient editor cluster, including compareResult', () => {
    useRampsStore.getState().setBaseColors(['#a', '#b', '#c']);
    useRampsStore.getState().setCompareAnchor({ baseIndex: 0, shadeIndex: 0, style: 'punchy', hex: '#fff' });
    useRampsStore.getState().setCompareResult({ aHex: '#fff', bHex: '#000', ratio: 21, tier: 'AAA' });
    useRampsStore.getState().reorderRamps(0, 2, 'after');
    const s = useRampsStore.getState();
    expect(s.editingIndex).toBeNull();
    expect(s.pinEditor).toBeNull();
    expect(s.compareAnchor).toBeNull();
    expect(s.compareResult).toBeNull();
  });

  it('setter identity is stable across state changes (required for memo/useCallback deps)', () => {
    const before = useRampsStore.getState().setRampSize;
    useRampsStore.getState().setBaseColors(['#changed']);
    const after = useRampsStore.getState().setRampSize;
    expect(before).toBe(after);
  });

  it('lospecSource defaults to null and round-trips through set/build/apply snapshot', () => {
    expect(useRampsStore.getState().lospecSource).toBeNull();
    const provenance = { slug: 'greyt-bit', title: 'Greyt-bit', author: 'Sam Keddy', url: 'https://lospec.com/palette-list/greyt-bit' };
    useRampsStore.getState().setLospecSource(provenance);
    expect(useRampsStore.getState().lospecSource).toEqual(provenance);
    const snap = useRampsStore.getState().buildSnapshot();
    expect(snap.lospecSource).toEqual(provenance);
    useRampsStore.getState().applySnapshotFields({ ...snap, lospecSource: null });
    expect(useRampsStore.getState().lospecSource).toBeNull();
  });
});
