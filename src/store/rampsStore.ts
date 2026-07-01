import { create } from 'zustand';
import type { CurvePoints } from '../lib/curve';
import { DEFAULT_STYLE_PRESETS } from '../lib/style-presets';
import { computePermutation, permuteRampState } from '../lib/permute-indexed-state';

type Updater<T> = T | ((prev: T) => T);
const resolveUpdater = <T,>(value: Updater<T>, prev: T): T =>
  typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;

export interface RampsStoreState {
  baseColors: string[];
  aiColorNames: string[];
  rampSize: number;
  shuffleSeed: number;
  overrides: Record<string, unknown>;
  harmonyAnchor: number;
  rampSizeOverrides: Record<number, number>;
  rampSatOverrides: Record<number, number>;
  hueShiftStrengthPerRamp: Record<number, number>;
  hiddenShades: Record<number, number[]>;
  rampShuffleOffsets: Record<number, number>;
  hardwareLock: string | null;
  hueShiftStrength: number;
  lockedRamps: Set<number>;
  collapsedRamps: Set<number>;
  lightnessCurvePerRamp: Record<string, CurvePoints>;
  satCurvePerRamp: Record<string, CurvePoints>;
  stylePresets: typeof DEFAULT_STYLE_PRESETS;
  editingIndex: number | null;
  editorHsv: { h: number; s: number; v: number };
  pinEditor: { baseIndex: number; shadeIndex: number } | null;
  compareMode: boolean;
  compareAnchor: { baseIndex: number; shadeIndex: number; style: string; hex: string } | null;
  compareResult: { aHex: string; bHex: string; ratio: number; tier: string } | null;

  setBaseColors: (v: Updater<string[]>) => void;
  setAiColorNames: (v: Updater<string[]>) => void;
  setRampSize: (v: Updater<number>) => void;
  setShuffleSeed: (v: Updater<number>) => void;
  setOverrides: (v: Updater<Record<string, unknown>>) => void;
  setHarmonyAnchor: (v: Updater<number>) => void;
  setRampSizeOverrides: (v: Updater<Record<number, number>>) => void;
  setRampSatOverrides: (v: Updater<Record<number, number>>) => void;
  setHueShiftStrengthPerRamp: (v: Updater<Record<number, number>>) => void;
  setHiddenShades: (v: Updater<Record<number, number[]>>) => void;
  setRampShuffleOffsets: (v: Updater<Record<number, number>>) => void;
  setHardwareLock: (v: Updater<string | null>) => void;
  setHueShiftStrength: (v: Updater<number>) => void;
  setLockedRamps: (v: Updater<Set<number>>) => void;
  setCollapsedRamps: (v: Updater<Set<number>>) => void;
  setLightnessCurvePerRamp: (v: Updater<Record<string, CurvePoints>>) => void;
  setSatCurvePerRamp: (v: Updater<Record<string, CurvePoints>>) => void;
  setStylePresets: (v: Updater<typeof DEFAULT_STYLE_PRESETS>) => void;
  setEditingIndex: (v: Updater<number | null>) => void;
  setEditorHsv: (v: Updater<{ h: number; s: number; v: number }>) => void;
  setPinEditor: (v: Updater<{ baseIndex: number; shadeIndex: number } | null>) => void;
  setCompareMode: (v: Updater<boolean>) => void;
  setCompareAnchor: (v: Updater<RampsStoreState['compareAnchor']>) => void;
  setCompareResult: (v: Updater<RampsStoreState['compareResult']>) => void;

  buildSnapshot: () => Record<string, unknown>;
  applySnapshotFields: (snap: any) => void;
  resetTransientEditors: () => void;
  reorderRamps: (from: number, target: number, pos: 'before' | 'after') => number[];
}

export const useRampsStore = create<RampsStoreState>((set, get) => ({
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
  lockedRamps: new Set<number>(),
  collapsedRamps: new Set<number>(),
  lightnessCurvePerRamp: {},
  satCurvePerRamp: {},
  stylePresets: DEFAULT_STYLE_PRESETS,
  editingIndex: null,
  editorHsv: { h: 0, s: 0, v: 0 },
  pinEditor: null,
  compareMode: false,
  compareAnchor: null,
  compareResult: null,

  setBaseColors: (v) => set((s) => ({ baseColors: resolveUpdater(v, s.baseColors) })),
  setAiColorNames: (v) => set((s) => ({ aiColorNames: resolveUpdater(v, s.aiColorNames) })),
  setRampSize: (v) => set((s) => ({ rampSize: resolveUpdater(v, s.rampSize) })),
  setShuffleSeed: (v) => set((s) => ({ shuffleSeed: resolveUpdater(v, s.shuffleSeed) })),
  setOverrides: (v) => set((s) => ({ overrides: resolveUpdater(v, s.overrides) })),
  setHarmonyAnchor: (v) => set((s) => ({ harmonyAnchor: resolveUpdater(v, s.harmonyAnchor) })),
  setRampSizeOverrides: (v) => set((s) => ({ rampSizeOverrides: resolveUpdater(v, s.rampSizeOverrides) })),
  setRampSatOverrides: (v) => set((s) => ({ rampSatOverrides: resolveUpdater(v, s.rampSatOverrides) })),
  setHueShiftStrengthPerRamp: (v) => set((s) => ({ hueShiftStrengthPerRamp: resolveUpdater(v, s.hueShiftStrengthPerRamp) })),
  setHiddenShades: (v) => set((s) => ({ hiddenShades: resolveUpdater(v, s.hiddenShades) })),
  setRampShuffleOffsets: (v) => set((s) => ({ rampShuffleOffsets: resolveUpdater(v, s.rampShuffleOffsets) })),
  setHardwareLock: (v) => set((s) => ({ hardwareLock: resolveUpdater(v, s.hardwareLock) })),
  setHueShiftStrength: (v) => set((s) => ({ hueShiftStrength: resolveUpdater(v, s.hueShiftStrength) })),
  setLockedRamps: (v) => set((s) => ({ lockedRamps: resolveUpdater(v, s.lockedRamps) })),
  setCollapsedRamps: (v) => set((s) => ({ collapsedRamps: resolveUpdater(v, s.collapsedRamps) })),
  setLightnessCurvePerRamp: (v) => set((s) => ({ lightnessCurvePerRamp: resolveUpdater(v, s.lightnessCurvePerRamp) })),
  setSatCurvePerRamp: (v) => set((s) => ({ satCurvePerRamp: resolveUpdater(v, s.satCurvePerRamp) })),
  setStylePresets: (v) => set((s) => ({ stylePresets: resolveUpdater(v, s.stylePresets) })),
  setEditingIndex: (v) => set((s) => ({ editingIndex: resolveUpdater(v, s.editingIndex) })),
  setEditorHsv: (v) => set((s) => ({ editorHsv: resolveUpdater(v, s.editorHsv) })),
  setPinEditor: (v) => set((s) => ({ pinEditor: resolveUpdater(v, s.pinEditor) })),
  setCompareMode: (v) => set((s) => ({ compareMode: resolveUpdater(v, s.compareMode) })),
  setCompareAnchor: (v) => set((s) => ({ compareAnchor: resolveUpdater(v, s.compareAnchor) })),
  setCompareResult: (v) => set((s) => ({ compareResult: resolveUpdater(v, s.compareResult) })),

  buildSnapshot: () => {
    const s = get();
    return {
      baseColors: s.baseColors,
      aiColorNames: s.aiColorNames,
      rampSize: s.rampSize,
      shuffleSeed: s.shuffleSeed,
      overrides: s.overrides,
      harmonyAnchor: s.harmonyAnchor,
      rampSizeOverrides: s.rampSizeOverrides,
      rampSatOverrides: s.rampSatOverrides,
      hueShiftStrengthPerRamp: s.hueShiftStrengthPerRamp,
      hiddenShades: s.hiddenShades,
      rampShuffleOffsets: s.rampShuffleOffsets,
      hardwareLock: s.hardwareLock,
      hueShiftStrength: s.hueShiftStrength,
      lockedRamps: [...s.lockedRamps].sort((a, b) => a - b),
      collapsedRamps: [...s.collapsedRamps].sort((a, b) => a - b),
      lightnessCurvePerRamp: s.lightnessCurvePerRamp,
      satCurvePerRamp: s.satCurvePerRamp,
      stylePresets: s.stylePresets,
    };
  },

  applySnapshotFields: (snap: any) => {
    set({
      baseColors: snap.baseColors,
      aiColorNames: snap.aiColorNames,
      rampSize: snap.rampSize,
      shuffleSeed: snap.shuffleSeed,
      overrides: snap.overrides,
      harmonyAnchor: snap.harmonyAnchor,
      rampSizeOverrides: snap.rampSizeOverrides,
      rampSatOverrides: snap.rampSatOverrides,
      hueShiftStrengthPerRamp: snap.hueShiftStrengthPerRamp ?? {},
      hiddenShades: snap.hiddenShades,
      rampShuffleOffsets: snap.rampShuffleOffsets,
      hardwareLock: snap.hardwareLock,
      hueShiftStrength: snap.hueShiftStrength,
      lockedRamps: new Set(snap.lockedRamps || []),
      collapsedRamps: new Set(snap.collapsedRamps || []),
      lightnessCurvePerRamp: snap.lightnessCurvePerRamp ?? {},
      satCurvePerRamp: snap.satCurvePerRamp ?? {},
      stylePresets: snap.stylePresets ?? DEFAULT_STYLE_PRESETS,
    });
  },

  resetTransientEditors: () => {
    set({ pinEditor: null, editingIndex: null, compareAnchor: null, compareResult: null });
  },

  reorderRamps: (from, target, pos) => {
    const state = get();
    const n = state.baseColors.length;
    const perm = computePermutation(n, from, target, pos);
    const np = permuteRampState({
      baseColors: state.baseColors, aiColorNames: state.aiColorNames,
      overrides: state.overrides, rampSizeOverrides: state.rampSizeOverrides,
      rampSatOverrides: state.rampSatOverrides, hueShiftStrengthPerRamp: state.hueShiftStrengthPerRamp,
      hiddenShades: state.hiddenShades, rampShuffleOffsets: state.rampShuffleOffsets,
      lightnessCurvePerRamp: state.lightnessCurvePerRamp, satCurvePerRamp: state.satCurvePerRamp,
      lockedRamps: [...state.lockedRamps], collapsedRamps: [...state.collapsedRamps],
      harmonyAnchor: state.harmonyAnchor,
    }, perm);
    set({
      baseColors: np.baseColors,
      aiColorNames: np.aiColorNames,
      overrides: np.overrides,
      rampSizeOverrides: np.rampSizeOverrides,
      rampSatOverrides: np.rampSatOverrides,
      hueShiftStrengthPerRamp: np.hueShiftStrengthPerRamp,
      hiddenShades: np.hiddenShades,
      rampShuffleOffsets: np.rampShuffleOffsets,
      lightnessCurvePerRamp: np.lightnessCurvePerRamp,
      satCurvePerRamp: np.satCurvePerRamp,
      lockedRamps: new Set(np.lockedRamps),
      collapsedRamps: new Set(np.collapsedRamps),
      harmonyAnchor: np.harmonyAnchor,
      editingIndex: null,
      pinEditor: null,
      compareAnchor: null,
    });
    return perm.next;
  },
}));
