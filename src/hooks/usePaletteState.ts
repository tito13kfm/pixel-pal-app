import { useRampsStore } from '../store/rampsStore';

/**
 * usePaletteState: thin document state-bag (App.tsx Tier B, Wave 2).
 *
 * Owns the 28 "document core" fields: the 20 `SNAPSHOT_FIELDS` that participate
 * in undo/redo snapshots, plus the 8-field editor/compare cluster. Of that
 * cluster, `resetTransientEditors` clears only editingIndex/pinEditor/
 * compareAnchor/compareResult; the other four (editorHsv/editorOklch/
 * editorMode/compareMode) are UI-preference caches, not undo-scoped state,
 * and survive undo/redo. It is deliberately *thin*: it holds state and
 * exposes three snapshot helpers. The generation pipeline, harmonize, load,
 * GPL import, and every other bulk handler STAY in App.tsx (the wiring layer)
 * and read these fields via the destructured return.
 *
 * The history machinery (`useHistory`) consumes the three helpers:
 *   - buildSnapshot()          → read the 20 fields into a snapshot object
 *   - applySnapshotFields(snap)→ write the 20 setters from a snapshot
 *   - resetTransientEditors()  → clear the 4 impure editor/compare states
 * Keeping those here makes usePaletteState the single owner of these setters;
 * useHistory wraps them with the `isReplayingHistoryRef` flag.
 */
export function usePaletteState() {
  const store = useRampsStore();
  return {
    // 20 snapshot fields + setters
    baseColors: store.baseColors, setBaseColors: store.setBaseColors,
    aiColorNames: store.aiColorNames, setAiColorNames: store.setAiColorNames,
    rampSize: store.rampSize, setRampSize: store.setRampSize,
    shuffleSeed: store.shuffleSeed, setShuffleSeed: store.setShuffleSeed,
    overrides: store.overrides, setOverrides: store.setOverrides,
    harmonyAnchor: store.harmonyAnchor, setHarmonyAnchor: store.setHarmonyAnchor,
    rampSizeOverrides: store.rampSizeOverrides, setRampSizeOverrides: store.setRampSizeOverrides,
    rampSatOverrides: store.rampSatOverrides, setRampSatOverrides: store.setRampSatOverrides,
    hueShiftStrengthPerRamp: store.hueShiftStrengthPerRamp, setHueShiftStrengthPerRamp: store.setHueShiftStrengthPerRamp,
    hiddenShades: store.hiddenShades, setHiddenShades: store.setHiddenShades,
    rampShuffleOffsets: store.rampShuffleOffsets, setRampShuffleOffsets: store.setRampShuffleOffsets,
    hardwareLock: store.hardwareLock, setHardwareLock: store.setHardwareLock,
    hueShiftStrength: store.hueShiftStrength, setHueShiftStrength: store.setHueShiftStrength,
    lockedRamps: store.lockedRamps, setLockedRamps: store.setLockedRamps,
    collapsedRamps: store.collapsedRamps, setCollapsedRamps: store.setCollapsedRamps,
    lightnessCurvePerRamp: store.lightnessCurvePerRamp, setLightnessCurvePerRamp: store.setLightnessCurvePerRamp,
    satCurvePerRamp: store.satCurvePerRamp, setSatCurvePerRamp: store.setSatCurvePerRamp,
    stylePresets: store.stylePresets, setStylePresets: store.setStylePresets,
    // editor / compare cluster + setters
    editingIndex: store.editingIndex, setEditingIndex: store.setEditingIndex,
    editorHsv: store.editorHsv, setEditorHsv: store.setEditorHsv,
    editorOklch: store.editorOklch, setEditorOklch: store.setEditorOklch,
    editorMode: store.editorMode, setEditorMode: store.setEditorMode,
    pinEditor: store.pinEditor, setPinEditor: store.setPinEditor,
    compareMode: store.compareMode, setCompareMode: store.setCompareMode,
    compareAnchor: store.compareAnchor, setCompareAnchor: store.setCompareAnchor,
    compareResult: store.compareResult, setCompareResult: store.setCompareResult,
    // snapshot helpers
    buildSnapshot: store.buildSnapshot,
    applySnapshotFields: store.applySnapshotFields,
    resetTransientEditors: store.resetTransientEditors,
    reorderRamps: store.reorderRamps,
  };
}
