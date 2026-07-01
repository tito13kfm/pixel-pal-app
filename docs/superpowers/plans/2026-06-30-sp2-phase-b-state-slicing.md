# SP2 Phase b: State Slicing (Ramps Domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 26 ramps-domain fields currently in `usePaletteState()` into a Zustand store, then use the resulting stable references to give `HarmonyPanel` a real `React.memo` win, proven by a render-isolation test.

**Architecture:** Create `src/store/rampsStore.ts` (Zustand store, `useState`-signature-compatible setters). Convert `usePaletteState.ts` into a thin wrapper hook that returns the exact same public shape backed by the store, so the single `usePaletteState()` call site in `App.tsx` and both `RampsPanel`/`HarmonyPanel` prop-drilled call sites need no destructuring changes. Then stabilize `HarmonyPanel`'s 5 non-setState callback props with `useCallback` (its 2 setState-shaped props, `setHarmonizeMode`, `setHarmonyAnchor`, are already stable by React/Zustand contract) and wrap it in `React.memo`.

**Tech Stack:** React 19, TypeScript 6, Zustand (new dependency), Vitest, Testing Library.

## Global Constraints

- No Zustand `persist` middleware, the store holds only in-memory hot state; `usePaletteState`'s save/load path plus the Tauri plugin-store/localStorage shim keep owning persistence (spec: "Decision: Zustand" guardrail).
- Field names and `usePaletteState`'s public shape (`buildSnapshot`, `applySnapshotFields`, `resetTransientEditors`, `reorderRamps`) stay identical, minimize churn at call sites (spec item 1).
- Do not migrate export/viz/sprite/panel-layout/saved-palette state, and do not memoize `SavedPalettesPanel`/`ExportPanel`/`VizComparePanel`/`RampsPanel` in this PR (spec "Out of scope"). `RampsPanel`'s ~90-prop shallow-compare surface makes a real memo win for it a direct-store-subscription-phase task, not this one, deferred, not attempted here.
- `PaletteContext` (`src/contexts/PaletteContext.tsx`) is history-only (`historyEntries`/`historyIndex`/`jumpToHistoryIndex`/`canUndo`/`canRedo`/`formatHistoryAge`), it carries no ramps fields, so the store does not touch it. `EditorContext` is unused dead code today (zero `useEditor()` call sites), leave it alone, do not route the store through it.
- `@ts-nocheck` stays on `App.tsx`/`color.ts`. The new `src/store/rampsStore.ts` and the rewritten `src/hooks/usePaletteState.ts` are NOT `@ts-nocheck` files, keep them type-checked normally.
- `npm run lint:hooks` runs with `--max-warnings 0` (exhaustive-deps), every `useCallback` added in this plan must carry a complete, correct dependency array; do not disable the rule.

---

## Task 1: Add Zustand dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```powershell
npm install zustand
```

- [ ] **Step 2: Verify build still passes with the new dependency**

```powershell
npm run build
```

Expected: succeeds (tsc --noEmit + vite build), no output changes yet (nothing imports zustand).

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: add zustand dependency for ramps state store"
```

---

## Task 2: Create the ramps Zustand store

**Files:**
- Create: `src/store/rampsStore.ts`
- Test: `tests/unit/rampsStore.spec.ts`

**Interfaces:**
- Produces: `useRampsStore`, a Zustand hook returning `RampsStoreState` (26 fields + their `set<Field>` setters, each accepting either a plain value or a `(prev) => next` updater function, matching the `useState` setter signature exactly) plus `buildSnapshot()`, `applySnapshotFields(snap)`, `resetTransientEditors()`, `reorderRamps(from, target, pos)`.

- [ ] **Step 1: Write the failing store tests**

```ts
// tests/unit/rampsStore.spec.ts
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

  it('setter identity is stable across state changes (required for memo/useCallback deps)', () => {
    const before = useRampsStore.getState().setRampSize;
    useRampsStore.getState().setBaseColors(['#changed']);
    const after = useRampsStore.getState().setRampSize;
    expect(before).toBe(after);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npx vitest run tests/unit/rampsStore.spec.ts
```

Expected: FAIL, `Cannot find module '../../src/store/rampsStore'`.

- [ ] **Step 3: Implement the store**

```ts
// src/store/rampsStore.ts
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
```

This is a direct, field-for-field port of `src/hooks/usePaletteState.ts`'s `useState` calls, `buildSnapshot`, `applySnapshotFields`, `resetTransientEditors`, and `reorderRamps`, same defaults, same field names, same permutation logic. The only new behavior is `resolveUpdater`, which makes every setter accept a plain value OR a `(prev) => next` function, exactly like a `useState` setter, required because both `App.tsx` and `RampsPanel` call these setters with the functional form in ~30 places today (e.g. `setBaseColors(prev => [...prev, hex])`, `setStylePresets(prev => ({ ...prev, [sk]: ... }))`).

- [ ] **Step 4: Run tests to verify they pass**

```powershell
npx vitest run tests/unit/rampsStore.spec.ts
```

Expected: PASS, all 7 tests.

- [ ] **Step 5: Type-check**

```powershell
npm run build
```

Expected: succeeds (the store is fully typed, not `@ts-nocheck`).

- [ ] **Step 6: Commit**

```powershell
git add src/store/rampsStore.ts tests/unit/rampsStore.spec.ts
git commit -m "feat: add Zustand ramps store (SP2 phase b)"
```

---

## Task 3: Convert `usePaletteState` into a thin store wrapper

**Files:**
- Modify: `src/hooks/usePaletteState.ts` (full rewrite of the function body; file keeps its name and export)

**Interfaces:**
- Consumes: `useRampsStore` from Task 2.
- Produces: `usePaletteState()`, same public shape as before (all 26 fields + setters + `buildSnapshot`/`applySnapshotFields`/`resetTransientEditors`/`reorderRamps`), now backed by the store. Every existing call site (`App.tsx`'s single `usePaletteState()` call, and the props it forwards into `RampsPanel`) keeps working unchanged.

- [ ] **Step 1: Replace the hook body**

```ts
// src/hooks/usePaletteState.ts
import { useRampsStore } from '../store/rampsStore';

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
```

`useRampsStore()` called with no selector subscribes `usePaletteState`'s caller (`App.tsx`) to the whole store, same as the old `useState`-based hook re-rendered `App.tsx` on any ramps field change, **no behavior change, no render regression, and no render win at this layer either.** This is expected: the win in this PR comes from Task 6/7 (stable callbacks + `React.memo` on `HarmonyPanel`), not from the store swap itself.

This is also why **Tasks covering the 5 tangled handler sites from the spec need no source edits**: `saveCurrentPalette` (App.tsx ~2360-2426), `loadPalette` (~2428-2668), the `[baseColors.length]` effect (~1906-1924), `harmonize`/`restoreHarmonizeBaseline` (~1672-1721), and the ramp-reorder `onDrop` (~4076-4099) all reference the setters by the same destructured names (`setBaseColors`, `setCollapsedRamps`, `reorderRamps`, etc.) that `usePaletteState()` still returns, those names now resolve to store-backed functions transparently. What changes is *what's behind the name*, not the call sites. Step 3 below is where that claim gets verified, not assumed.

- [ ] **Step 2: Type-check**

```powershell
npm run build
```

Expected: succeeds. If `App.tsx` (which is `@ts-nocheck`) has any latent type mismatch it would have been silent before and stays silent now, this step is really checking `usePaletteState.ts` itself compiles clean, since it's no longer `@ts-nocheck`.

- [ ] **Step 3: Run the full existing test suite**

```powershell
npm test
```

Expected: all existing tests PASS unchanged, including `tests/unit/render-isolation.spec.tsx` (Phase a), this is the regression signal that the store swap didn't break `HistoryPanel`/`PlaygroundPanel` memoization or any ramps-consuming logic (`buildRamp`, `buildRampsForSnapshot`, undo/redo, save/load).

- [ ] **Step 4: Manual verification of the 5 tangled handler sites**

Run the app (`npm run tauri:dev` or `npm run dev`) and exercise each site once:
1. **`saveCurrentPalette`**: edit a ramp, save the palette under a new name, confirm it appears in Saved Palettes with correct colors/hardware-lock/style-presets.
2. **`loadPalette`**: load a different saved palette, confirm all ramps/overrides/curves restore correctly.
3. **`[baseColors.length]` effect**: add a new base color, confirm `collapsedRamps`/`harmonizeBaseline` react as before (new ramp not collapsed, side-by-side panel state unaffected).
4. **Harmonize handler**: with 3+ ramps, lock one, click Harmonize, confirm unlocked ramps rotate hue and the locked one doesn't; click Restore, confirm original hues return.
5. **Ramp-reorder `onDrop`**: drag-reorder two ramp cards, confirm colors/overrides/locks/gamut move with the ramp, not left behind.

If any of these regress, the store's `resolveUpdater` functional-update handling or a field name mismatch is the likely cause, recheck against Task 2's store against the original `usePaletteState.ts` field list.

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/usePaletteState.ts
git commit -m "refactor: back usePaletteState with the Zustand ramps store"
```

---

## Task 4: #62 mirror-drift check (`liveRampSnapshot` vs `buildWorkingSnapshot`)

**Files:** none modified, verification-only task, documented in the commit for Task 3 or as its own no-op commit if done separately.

- [ ] **Step 1: Re-list both functions' fields post-migration**

`liveRampSnapshot` (App.tsx, `useMemo`, currently ~line 522): `baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, hardwareLock, hueShiftStrength, hueShiftStrengthPerRamp, lightnessCurvePerRamp, satCurvePerRamp, gamutPerRamp, shuffleSeed, rampShuffleOffsets, stylePresets` (14 fields).

`buildWorkingSnapshot` (App.tsx, plain function, currently ~line 2125): `baseColors, rampSize, shuffleSeed, overrides, rampSizeOverrides, rampSatOverrides, rampShuffleOffsets, hiddenShades, hardwareLock, hueShiftStrength, hueShiftStrengthPerRamp, lightnessCurvePerRamp, satCurvePerRamp, gamutPerRamp, stylePresets` (15 fields).

- [ ] **Step 2: Confirm the diff is exactly the known intentional field**

The only field present in `buildWorkingSnapshot` and absent from `liveRampSnapshot` is `hiddenShades` (intentional: hidden shades affect the working/export snapshot but not the live preview ramps). Confirm no other field was added, dropped, or renamed by the Task 2/3 migration, both functions still read `baseColors`/`rampSize`/etc. directly off the same names `usePaletteState()` returns, and `gamutPerRamp` is still an App.tsx-local (not moved into the store, per Task 2's scope, the store has no `gamutPerRamp` field).

- [ ] **Step 3: If a field mismatch is found**

Stop and fix Task 2/3 before proceeding, do not paper over a mirror-drift with a one-sided patch to either snapshot function (per this repo's mirror/round-trip review lens: diff the whole transform chain, don't assume "same source" means "still mirrored").

---

## Task 5: Stabilize `tagNextLabel` in `useHistory`

**Files:**
- Modify: `src/hooks/useHistory.ts:1` (import), `src/hooks/useHistory.ts:55` (`tagNextLabel` definition)

**Interfaces:**
- Produces: `tagNextLabel`, same signature (`(label: string) => void`), now referentially stable across `useHistory` re-renders (previously recreated every render, which would silently break any `useCallback` in `App.tsx` that lists it as a dependency).

- [ ] **Step 1: Add `useCallback` to the import**

```ts
// src/hooks/useHistory.ts:1
import { useState, useEffect, useRef, useCallback } from 'react';
```

- [ ] **Step 2: Wrap the definition**

```ts
// src/hooks/useHistory.ts:55, replace this line:
  const tagNextLabel = (label: string) => { pendingLabelRef.current = label; };

// with:
  const tagNextLabel = useCallback((label: string) => { pendingLabelRef.current = label; }, []);
```

Empty dependency array is correct: the function only writes to a `useRef`, which is stable by definition and never needs to appear in a dependency array.

- [ ] **Step 3: Verify with lint:hooks**

```powershell
npm run lint:hooks
```

Expected: 0 warnings (empty deps array is exhaustive-deps-correct for a ref-only closure).

- [ ] **Step 4: Run the test suite**

```powershell
npm test
```

Expected: all PASS, `tagNextLabel`'s behavior (setting `pendingLabelRef.current`) is unchanged, only its identity is now stable.

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useHistory.ts
git commit -m "perf: stabilize tagNextLabel identity for downstream useCallback deps"
```

---

## Task 6: Stabilize `HarmonyPanel`'s callback props with `useCallback`

**Files:**
- Modify: `src/App.tsx:2` (import), `src/App.tsx` at `addHarmonyColor` (~1155), `addHarmonyPair` (~1166), `addHarmonyMany` (~1182), `harmonize` (~1673), `restoreHarmonizeBaseline` (~1712)

**Interfaces:**
- Consumes: `tagNextLabel` (now stable, Task 5), `setBaseColors`/`setAiColorNames`/`setCompareAnchor`/`setCompareResult`/`setHarmonyAnchor` (now stable, store-backed setters from Task 2/3), `setExportFeedback`/`setHarmonizeBaseline` (plain `useState` setters, already stable by React contract).
- Produces: `addHarmonyColor`, `addHarmonyPair`, `addHarmonyMany`, `harmonize`, `restoreHarmonizeBaseline`, same signatures and behavior, now with `useCallback`-stabilized identity that only changes when a real dependency (`baseColors`, `safeAnchor`, `lockedRamps`, `harmonizeBaseline`, `harmonizeMode`) changes.

`HarmonyPanel`'s other two callback-shaped props, `setHarmonizeMode` (plain `useState` setter, App.tsx:226) and `setHarmonyAnchor` (store setter), are already stable, no change needed for them.

- [ ] **Step 1: Add `useCallback` to the React import**

```ts
// src/App.tsx:2, replace:
import React, { useState, useEffect, useMemo, useRef } from 'react';
// with:
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
```

- [ ] **Step 2: Wrap `addHarmonyColor`**

```ts
// replace:
  const addHarmonyColor = (hex, name) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  };

// with:
  const addHarmonyColor = useCallback((hex, name) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  }, [baseColors, setBaseColors, setAiColorNames]);
```

- [ ] **Step 3: Wrap `addHarmonyPair`**

```ts
// replace:
  const addHarmonyPair = (hex1, hex2, name1, name2) => {
    const toAdd = [], namesToAdd = [];
    if (!baseColors.includes(hex1)) { toAdd.push(hex1); namesToAdd.push(name1); }
    if (!baseColors.includes(hex2) && hex1 !== hex2) { toAdd.push(hex2); namesToAdd.push(name2); }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  };

// with:
  const addHarmonyPair = useCallback((hex1, hex2, name1, name2) => {
    const toAdd = [], namesToAdd = [];
    if (!baseColors.includes(hex1)) { toAdd.push(hex1); namesToAdd.push(name1); }
    if (!baseColors.includes(hex2) && hex1 !== hex2) { toAdd.push(hex2); namesToAdd.push(name2); }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  }, [baseColors, setBaseColors, setAiColorNames]);
```

- [ ] **Step 4: Wrap `addHarmonyMany`**

```ts
// replace:
  const addHarmonyMany = (pairs) => {
    const toAdd = [], namesToAdd = [];
    for (const { hex, name } of pairs) {
      if (baseColors.includes(hex)) continue;
      if (toAdd.includes(hex)) continue;
      toAdd.push(hex);
      namesToAdd.push(name);
    }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  };

// with:
  const addHarmonyMany = useCallback((pairs) => {
    const toAdd = [], namesToAdd = [];
    for (const { hex, name } of pairs) {
      if (baseColors.includes(hex)) continue;
      if (toAdd.includes(hex)) continue;
      toAdd.push(hex);
      namesToAdd.push(name);
    }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  }, [baseColors, setBaseColors, setAiColorNames]);
```

- [ ] **Step 5: Wrap `harmonize`**

```ts
// replace:
  const harmonize = () => {
    if (baseColors.length < 2) {
      setExportFeedback('Need at least 2 ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    const anchorIdx = safeAnchor;
    const anchorHex = baseColors[anchorIdx];
    if (!anchorHex) return;
    const anchorHsl = hexToHsl(anchorHex);
    const targets = [];
    for (let i = 0; i < baseColors.length; i++) {
      if (i === anchorIdx) continue;
      if (lockedRamps.has(i)) continue;
      targets.push(i);
    }
    if (targets.length === 0) {
      setExportFeedback('No unlocked ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    if (!harmonizeBaseline) setHarmonizeBaseline(baseColors.slice());
    const slots = HARMONIZE_MODE_SLOTS[harmonizeMode] || HARMONIZE_MODE_SLOTS.complement;
    const newBaseColors = baseColors.slice();
    for (let k = 0; k < targets.length; k++) {
      const i = targets[k];
      const slot = slots[k % slots.length];
      const orig = hexToHsl(baseColors[i]);
      const newH = ((anchorHsl.h + slot) % 360 + 360) % 360;
      newBaseColors[i] = hslToHex({ h: newH, s: orig.s, l: orig.l });
    }
    const modeLabel = harmonizeMode.replace('-', ' ');
    tagNextLabel(`Harmonize (${targets.length}, ${modeLabel})`);
    setBaseColors(newBaseColors);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback(`Harmonized ${targets.length} ramp${targets.length === 1 ? '' : 's'}: ${modeLabel}`);
    setTimeout(() => setExportFeedback(''), 2000);
  }

// with:
  const harmonize = useCallback(() => {
    if (baseColors.length < 2) {
      setExportFeedback('Need at least 2 ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    const anchorIdx = safeAnchor;
    const anchorHex = baseColors[anchorIdx];
    if (!anchorHex) return;
    const anchorHsl = hexToHsl(anchorHex);
    const targets = [];
    for (let i = 0; i < baseColors.length; i++) {
      if (i === anchorIdx) continue;
      if (lockedRamps.has(i)) continue;
      targets.push(i);
    }
    if (targets.length === 0) {
      setExportFeedback('No unlocked ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    if (!harmonizeBaseline) setHarmonizeBaseline(baseColors.slice());
    const slots = HARMONIZE_MODE_SLOTS[harmonizeMode] || HARMONIZE_MODE_SLOTS.complement;
    const newBaseColors = baseColors.slice();
    for (let k = 0; k < targets.length; k++) {
      const i = targets[k];
      const slot = slots[k % slots.length];
      const orig = hexToHsl(baseColors[i]);
      const newH = ((anchorHsl.h + slot) % 360 + 360) % 360;
      newBaseColors[i] = hslToHex({ h: newH, s: orig.s, l: orig.l });
    }
    const modeLabel = harmonizeMode.replace('-', ' ');
    tagNextLabel(`Harmonize (${targets.length}, ${modeLabel})`);
    setBaseColors(newBaseColors);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback(`Harmonized ${targets.length} ramp${targets.length === 1 ? '' : 's'}: ${modeLabel}`);
    setTimeout(() => setExportFeedback(''), 2000);
  }, [baseColors, safeAnchor, lockedRamps, harmonizeBaseline, harmonizeMode, setExportFeedback, setHarmonizeBaseline, tagNextLabel, setBaseColors, setCompareAnchor, setCompareResult]);
```

- [ ] **Step 6: Wrap `restoreHarmonizeBaseline`**

```ts
// replace:
  const restoreHarmonizeBaseline = () => {
    if (!harmonizeBaseline) return;
    tagNextLabel('Restore pre-harmonize hues');
    setBaseColors(harmonizeBaseline.slice());
    setHarmonizeBaseline(null);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback('Restored original hues');
    setTimeout(() => setExportFeedback(''), 2000);
  };

// with:
  const restoreHarmonizeBaseline = useCallback(() => {
    if (!harmonizeBaseline) return;
    tagNextLabel('Restore pre-harmonize hues');
    setBaseColors(harmonizeBaseline.slice());
    setHarmonizeBaseline(null);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback('Restored original hues');
    setTimeout(() => setExportFeedback(''), 2000);
  }, [harmonizeBaseline, tagNextLabel, setBaseColors, setHarmonizeBaseline, setCompareAnchor, setCompareResult, setExportFeedback]);
```

- [ ] **Step 7: Verify with lint:hooks and build**

```powershell
npm run lint:hooks
npm run build
```

Expected: 0 warnings, build succeeds. If `lint:hooks` flags a missing dependency, add exactly that dependency, do not disable the rule (Global Constraints).

- [ ] **Step 8: Run the test suite**

```powershell
npm test
```

Expected: all PASS, these are pure identity-stabilization changes, behavior is unchanged.

- [ ] **Step 9: Commit**

```powershell
git add src/App.tsx
git commit -m "perf: stabilize HarmonyPanel callback props with useCallback"
```

---

## Task 7: Memoize `HarmonyPanel`

**Files:**
- Modify: `src/components/panels/HarmonyPanel.tsx:1` (imports), `:22` (rename to `HarmonyPanelImpl` + add `recordRender`), end of file (memo export)

**Interfaces:**
- Produces: `HarmonyPanel`, now `memo(HarmonyPanelImpl)`, same `HarmonyPanelProps` signature, same import path/name (`src/App.tsx`'s `<HarmonyPanel ... />` call site at line 4705 needs no change).

- [ ] **Step 1: Add imports**

```ts
// src/components/panels/HarmonyPanel.tsx:1, replace:
import { Sparkles, RotateCcw } from 'lucide-react';
import { useTheme } from '../../contexts';
import type { HarmonySet } from '../../lib/harmony';

// with:
import { memo } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useTheme } from '../../contexts';
import { recordRender } from '../../lib/renderCount';
import type { HarmonySet } from '../../lib/harmony';
```

- [ ] **Step 2: Rename the function and add the render-count call**

```ts
// replace:
export function HarmonyPanel({
  baseColors,
  aiColorNames,
  safeAnchor,
  lockedRamps,
  harmonizeMode,
  setHarmonizeMode,
  harmonizeBaseline,
  restoreHarmonizeBaseline,
  harmonize,
  harmony,
  addHarmonyPair,
  addHarmonyMany,
  setHarmonyAnchor,
  addHarmonyColor,
}: HarmonyPanelProps) {
  const { t } = useTheme();

// with:
function HarmonyPanelImpl({
  baseColors,
  aiColorNames,
  safeAnchor,
  lockedRamps,
  harmonizeMode,
  setHarmonizeMode,
  harmonizeBaseline,
  restoreHarmonizeBaseline,
  harmonize,
  harmony,
  addHarmonyPair,
  addHarmonyMany,
  setHarmonyAnchor,
  addHarmonyColor,
}: HarmonyPanelProps) {
  recordRender('HarmonyPanel');
  const { t } = useTheme();
```

- [ ] **Step 3: Add the memo export at the end of the file**

The file currently ends with the component's closing `}`. Add immediately after it:

```ts
export const HarmonyPanel = memo(HarmonyPanelImpl);
```

- [ ] **Step 4: Type-check**

```powershell
npm run build
```

Expected: succeeds, `App.tsx`'s `import { HarmonyPanel } from ...` and `<HarmonyPanel ... />` usage are unaffected (same exported name, same props).

- [ ] **Step 5: Commit**

```powershell
git add src/components/panels/HarmonyPanel.tsx
git commit -m "perf: wrap HarmonyPanel in React.memo"
```

---

## Task 8: Extend the render-isolation test for `HarmonyPanel`

**Files:**
- Modify: `tests/unit/render-isolation.spec.tsx`

**Interfaces:**
- Consumes: `getRenderCount('HarmonyPanel')`, now available because Task 7 wired `recordRender('HarmonyPanel')` in.

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `tests/unit/render-isolation.spec.tsx`, alongside the existing `'phase-a memo: panel render isolation'` block:

```tsx
describe('phase-b memo: HarmonyPanel render isolation', () => {
  beforeEach(() => disableRenderCounts());

  it('HarmonyPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    resetRenderCounts();
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('HarmonyPanel')).toBe(0);
  });

  it('HarmonyPanel renders at least once on mount (memo is not over-aggressive)', () => {
    enableRenderCounts();
    render(<App />);
    expect(getRenderCount('HarmonyPanel')).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it currently fails without Tasks 5-7**

This step is retroactive verification once Tasks 5-7 are already committed, running it now should PASS immediately, since `HarmonyPanel` is already memoized with stable callbacks by this point in the plan. If it fails, one of Tasks 5-7's `useCallback` dependency arrays is missing a stable input (re-check `tagNextLabel` and the store setters are actually referentially stable across an unrelated re-render, e.g. by re-running Task 2's "setter identity is stable" store test).

```powershell
npx vitest run tests/unit/render-isolation.spec.tsx
```

Expected: PASS, both new tests plus the 3 existing phase-a tests (5 total).

- [ ] **Step 3: Commit**

```powershell
git add tests/unit/render-isolation.spec.tsx
git commit -m "test: add HarmonyPanel render-isolation coverage"
```

---

## Task 9: Full verification pass

**Files:** none modified.

- [ ] **Step 1: Build, unit tests, hooks lint, deadcode**

```powershell
npm run build
npm test
npm run lint:hooks
npm run deadcode
```

Expected: all succeed. `npm run deadcode` should show no new orphaned exports from the `usePaletteState.ts` rewrite (its exported shape is unchanged), if it flags `src/store/rampsStore.ts`'s internal `resolveUpdater` or the store's own field-level exports as unused, that's expected (they're module-internal, not re-exported elsewhere) and not a regression.

- [ ] **Step 2: Desktop e2e**

```powershell
npm run test:e2e
```

Expected: PASS, no selector changes needed (no user-visible text/role/title changed in this PR).

- [ ] **Step 3: Web e2e**

```powershell
npm run build:web
npx playwright test --config=playwright.web.config.ts
```

Expected: PASS.

- [ ] **Step 4: Manual smoke pass**

Run `npm run tauri:dev`. In addition to the 5 handler checks from Task 3 Step 4, specifically re-verify:
- Undo/redo across a harmonize action and a ramp reorder (exercises `useHistory`'s snapshot watcher against the store-backed `buildSnapshot`/`applySnapshotFields`).
- Save then reload the app (or switch palettes) to confirm persistence still round-trips through `usePaletteState`'s unchanged public shape.

- [ ] **Step 5: Update `docs/ARCHITECTURE.md`**

Per this repo's DOC-SYNC convention (any panel/state-shape change updates the affected `docs/ARCHITECTURE.md` section in the same PR): add a note to the state-management section that ramps-domain state (`usePaletteState`) is now backed by a Zustand store (`src/store/rampsStore.ts`) rather than local `useState`, and that `HarmonyPanel` is memoized as of this PR (`RampsPanel` is not, pending direct-store-subscription work).

- [ ] **Step 6: Final commit**

```powershell
git add docs/ARCHITECTURE.md
git commit -m "docs: note ramps state store + HarmonyPanel memo in ARCHITECTURE.md"
```
