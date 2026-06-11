import { useState } from 'react';
import type { CurvePoints } from '../lib/curve';
import { DEFAULT_STYLE_PRESETS } from '../lib/style-presets';
import { computePermutation, permuteRampState } from '../lib/permute-indexed-state';

/**
 * usePaletteState — thin document state-bag (App.tsx Tier B, Wave 2).
 *
 * Owns the 26 "document core" fields: the 20 `SNAPSHOT_FIELDS` that participate
 * in undo/redo snapshots, plus the 6-field editor/compare cluster that
 * `applyUndoSnapshot` resets. It is deliberately *thin*: it holds state and
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
  // ----- 20 snapshot fields -----
  const [baseColors, setBaseColors] = useState(['#ff00ff']);
  const [aiColorNames, setAiColorNames] = useState([]);
  const [rampSize, setRampSize] = useState(6);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [overrides, setOverrides] = useState({});
  // harmonyAnchor: index into baseColors[] used as the source for the Harmony
  // Colors panel. Clamped in removeRamp; falls back to 0 if the anchor base
  // itself is removed. We deliberately do NOT auto-switch on base add.
  const [harmonyAnchor, setHarmonyAnchor] = useState(0);
  // Per-ramp overrides (sparse maps keyed by baseIndex; absent → global default):
  //   rampSizeOverrides[i] = 4..8     overrides the global rampSize for ramp i
  //   rampSatOverrides[i] = 0.5..2.0  multiplies the base color's saturation
  const [rampSizeOverrides, setRampSizeOverrides] = useState({});
  const [rampSatOverrides, setRampSatOverrides] = useState({});
  const [hueShiftStrengthPerRamp, setHueShiftStrengthPerRamp] = useState({});
  // Hidden shades per base. Sparse map keyed by baseIndex → array of shadeIndex
  // filtered from display/export. Cleared on full-palette-replace.
  const [hiddenShades, setHiddenShades] = useState({});
  // Per-ramp shuffle offsets. Sparse map keyed by baseIndex; non-negative int
  // incremented by the per-ramp Shuffle button. Feeds the generator jitter seed.
  const [rampShuffleOffsets, setRampShuffleOffsets] = useState({});
  // hardwareLock: when non-null, generated shades snap to the named hardware
  // palette ('nes' | 'gameboy' | 'cga16' | 'ega64' | 'c64'). Part of palette
  // identity, so it's persisted with the palette and in the snapshot.
  const [hardwareLock, setHardwareLock] = useState(null);
  // hueShiftStrength scales the shadow/highlight hue shifts in generateRamp.
  // 1.0 = default (byte-identical to pre-E saved palettes); 0.0 = flat; 2.0 =
  // painterly. Per-palette creative choice, NOT a global preference.
  const [hueShiftStrength, setHueShiftStrength] = useState(1.0);
  // lockedRamps: Set of base indices exempt from global regeneration.
  const [lockedRamps, setLockedRamps] = useState(() => new Set<number>());
  // collapsedRamps: Set of collapsed ramp-card base indices (transient UI).
  const [collapsedRamps, setCollapsedRamps] = useState(() => new Set<number>());
  const [lightnessCurvePerRamp, setLightnessCurvePerRamp] = useState<Record<string, CurvePoints>>({});
  const [satCurvePerRamp, setSatCurvePerRamp] = useState<Record<string, CurvePoints>>({});
  const [stylePresets, setStylePresets] = useState(DEFAULT_STYLE_PRESETS);

  // ----- editor / compare cluster (6) -----
  // Base color editor: at most one ramp's editor open at a time. editorHsv holds
  // live slider values (HSV is the editor's source of truth so drags stay
  // continuous). Seeded from baseColors[i] via hexToHsv when the editor opens.
  const [editingIndex, setEditingIndex] = useState(null);
  const [editorHsv, setEditorHsv] = useState({ h: 0, s: 0, v: 0 });
  // pinEditor: which shade's editor is open. { baseIndex, shadeIndex } | null.
  const [pinEditor, setPinEditor] = useState(null);
  // WCAG Check compare cluster: compareMode on → clicking a swatch sets
  // compareAnchor; a second click populates compareResult with the ratio.
  const [compareMode, setCompareMode] = useState(false);
  const [compareAnchor, setCompareAnchor] = useState(null); // { baseIndex, shadeIndex, style, hex } | null
  const [compareResult, setCompareResult] = useState(null); // { aHex, bHex, ratio, tier } | null

  // ----- snapshot helpers (consumed by useHistory) -----

  // Read the 19 snapshot fields into a JSON-serializable object. Sets are
  // serialized as sorted arrays so JSON.stringify equality is deterministic.
  const buildSnapshot = () => ({
    baseColors,
    aiColorNames,
    rampSize,
    shuffleSeed,
    overrides,
    harmonyAnchor,
    rampSizeOverrides,
    rampSatOverrides,
    hueShiftStrengthPerRamp,
    hiddenShades,
    rampShuffleOffsets,
    hardwareLock,
    hueShiftStrength,
    lockedRamps: [...lockedRamps].sort((a, b) => a - b),
    collapsedRamps: [...collapsedRamps].sort((a, b) => a - b),
    lightnessCurvePerRamp,
    satCurvePerRamp,
    stylePresets,
  });

  // Write the 19 snapshot fields from a snapshot. Does NOT set the
  // isReplayingHistory flag (that's useHistory's job) and does NOT reset the
  // transient editors (see resetTransientEditors) — both are layered by
  // useHistory's applyUndoSnapshot wrapper.
  const applySnapshotFields = (snap: any) => {
    setBaseColors(snap.baseColors);
    setAiColorNames(snap.aiColorNames);
    setRampSize(snap.rampSize);
    setShuffleSeed(snap.shuffleSeed);
    setOverrides(snap.overrides);
    setHarmonyAnchor(snap.harmonyAnchor);
    setRampSizeOverrides(snap.rampSizeOverrides);
    setRampSatOverrides(snap.rampSatOverrides);
    setHueShiftStrengthPerRamp(snap.hueShiftStrengthPerRamp ?? {});
    setHiddenShades(snap.hiddenShades);
    setRampShuffleOffsets(snap.rampShuffleOffsets);
    setHardwareLock(snap.hardwareLock);
    setHueShiftStrength(snap.hueShiftStrength);
    setLockedRamps(new Set(snap.lockedRamps || []));
    setCollapsedRamps(new Set(snap.collapsedRamps || []));
    setLightnessCurvePerRamp(snap.lightnessCurvePerRamp ?? {});
    setSatCurvePerRamp(snap.satCurvePerRamp ?? {});
    setStylePresets(snap.stylePresets ?? DEFAULT_STYLE_PRESETS);
  };

  // Clear in-flight UI editor states that could reference stale indices after
  // a snapshot is applied. The 4 impure setters from the old applyUndoSnapshot.
  const resetTransientEditors = () => {
    setPinEditor(null);
    setEditingIndex(null);
    setCompareAnchor(null);
    setCompareResult(null);
  };

  // Move the ramp at `from` to the drop target (target, pos), permuting every
  // index-keyed structure atomically. Clears transient editors (a reorder is a
  // deliberate structural action). Returns the inverse permutation `next` so the
  // caller can apply the SAME remap to state it owns (App.tsx's gamutPerRamp).
  const reorderRamps = (from: number, target: number, pos: 'before' | 'after'): number[] => {
    const n = baseColors.length;
    const perm = computePermutation(n, from, target, pos);
    const np = permuteRampState({
      baseColors, aiColorNames,
      overrides, rampSizeOverrides, rampSatOverrides, hueShiftStrengthPerRamp,
      hiddenShades, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp,
      lockedRamps: [...lockedRamps], collapsedRamps: [...collapsedRamps],
      harmonyAnchor,
    }, perm);
    setBaseColors(np.baseColors);
    setAiColorNames(np.aiColorNames);
    setOverrides(np.overrides);
    setRampSizeOverrides(np.rampSizeOverrides);
    setRampSatOverrides(np.rampSatOverrides);
    setHueShiftStrengthPerRamp(np.hueShiftStrengthPerRamp);
    setHiddenShades(np.hiddenShades);
    setRampShuffleOffsets(np.rampShuffleOffsets);
    setLightnessCurvePerRamp(np.lightnessCurvePerRamp);
    setSatCurvePerRamp(np.satCurvePerRamp);
    setLockedRamps(new Set(np.lockedRamps));
    setCollapsedRamps(new Set(np.collapsedRamps));
    setHarmonyAnchor(np.harmonyAnchor);
    setEditingIndex(null);
    setPinEditor(null);
    setCompareAnchor(null);
    return perm.next;
  };

  return {
    // 20 snapshot fields + setters
    baseColors, setBaseColors,
    aiColorNames, setAiColorNames,
    rampSize, setRampSize,
    shuffleSeed, setShuffleSeed,
    overrides, setOverrides,
    harmonyAnchor, setHarmonyAnchor,
    rampSizeOverrides, setRampSizeOverrides,
    rampSatOverrides, setRampSatOverrides,
    hueShiftStrengthPerRamp, setHueShiftStrengthPerRamp,
    hiddenShades, setHiddenShades,
    rampShuffleOffsets, setRampShuffleOffsets,
    hardwareLock, setHardwareLock,
    hueShiftStrength, setHueShiftStrength,
    lockedRamps, setLockedRamps,
    collapsedRamps, setCollapsedRamps,
    lightnessCurvePerRamp, setLightnessCurvePerRamp,
    satCurvePerRamp, setSatCurvePerRamp,
    stylePresets, setStylePresets,
    // editor / compare cluster + setters
    editingIndex, setEditingIndex,
    editorHsv, setEditorHsv,
    pinEditor, setPinEditor,
    compareMode, setCompareMode,
    compareAnchor, setCompareAnchor,
    compareResult, setCompareResult,
    // snapshot helpers
    buildSnapshot,
    applySnapshotFields,
    resetTransientEditors,
    reorderRamps,
  };
}
