# App.tsx Tier B — Domain Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract ~127 `useState` + ~44 `useEffect` from the `src/App.tsx` god component into focused custom hooks, with zero behavior change.

**Architecture:** Reorganize-only (no reducer, no context). ~108 independent ephemeral fields → plain domain hooks returning `{state, setters, handlers}`. The 19 `buildUndoSnapshot` document fields + history stay co-located as `usePaletteState` + `useHistory`, extracted last. App.tsx remains the wiring layer. Spec: `docs/superpowers/specs/2026-06-03-app-tsx-tier-b-hooks-design.md`.

**Tech Stack:** React 19, TS 6, Vite 8, Vitest (jsdom), Playwright e2e. Hooks live in `src/hooks/`; unit specs in `tests/unit/*.spec.ts` (import via `../../src/...`).

---

## Critical execution rules (read before any task)

These come from prior burns on this exact file (skill-observations #6, #7, #8):

1. **The build gate is theater here.** `App.tsx` is `@ts-nocheck`. `tsc` skips it; the bundler only errors on a bad `import`, never on a dangling reference to a now-removed local. **A green `npm run build` does NOT prove a clean extraction.** Every task's real gate is the **grep-per-moved-symbol** check below.

2. **grep-per-moved-symbol (the real gate).** After moving a field/handler out of App.tsx, for each moved symbol run:
   ```bash
   grep -nE 'const \[?\bSYMBOL\b|function \bSYMBOL\b' src/App.tsx
   ```
   It must return **zero** declaration hits in App.tsx (the declaration now lives in the hook). Then confirm App.tsx still *references* it (destructured from the hook + call sites):
   ```bash
   grep -cn '\bSYMBOL\b' src/App.tsx   # expect > 0 (the hook binding + uses)
   ```
   A symbol that is both declared and destructured = duplicate-declaration SyntaxError (ES modules). A symbol referenced but not declared anywhere = dangling local.

3. **Commit the instant it's green.** Never leave a half-applied move (declaration deleted, hook not yet wired) across a turn boundary — that is a non-compiling state. If a task feels too big for one turn, it is already split below into "create hook" + "wire + remove + commit".

4. **Merge gate = green CI, not local `npm test`.** Playwright e2e runs only in CI. Do not merge the Tier B branch until the PR's full CI run is green.

5. **Line numbers below are anchored to HEAD `276333e`** and drift as earlier tasks edit App.tsx. **Locate symbols by grep, not by line number.** Ranges are orientation only.

---

## File Structure

**Create:**
- `src/lib/history-snapshot.ts` — pure history kernel: `SNAPSHOT_FIELDS`, `inferLabel(prev, next)`. Shared by the hook + tests.
- `src/hooks/useDisplaySettings.ts`, `useExportSettings.ts`, `usePanelLayout.ts`, `useAIAssist.ts`, `useImageExtract.ts`, `useImageRemap.ts`, `useSideBySide.ts`, `useSpriteImport.ts`, `useTour.ts`, `useSavedPalettes.ts`, `useVizSettings.ts`, `useUpdater.ts` (Wave 1)
- `src/hooks/usePaletteState.ts`, `src/hooks/useHistory.ts` (Wave 2)
- `tests/unit/history-snapshot.spec.ts`

**Modify:**
- `src/App.tsx` — remove migrated declarations/effects; add hook calls (the wiring layer).

**Convention:** each hook is a typed `.ts` file exporting one `useXxx()` that takes a small typed options object (for cross-hook callbacks/initial values) and returns `{ ...state, ...setters, ...handlers }`. App.tsx destructures the return. Hooks are NOT `@ts-nocheck` — they are newly typed (follow Tier A lib modules).

---

## Task 1: Pure history kernel + characterization tests (safety net — do FIRST)

Locks the most behavior-sensitive logic (`inferLabel`'s 16 branches, the snapshot field list) as a pure, tested module before any hook touches the document core. This is real TDD; the rest of the plan is mechanical moves guarded by grep.

**Files:**
- Create: `src/lib/history-snapshot.ts`
- Test: `tests/unit/history-snapshot.spec.ts`
- Modify: `src/App.tsx` (replace inline `inferLabel` with import; export field list for `buildUndoSnapshot`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/history-snapshot.spec.ts
import { describe, it, expect } from 'vitest';
import { inferLabel, SNAPSHOT_FIELDS } from '../../src/lib/history-snapshot';

const base = {
  baseColors: ['#ff00ff'], aiColorNames: [], aiReasoning: '', rampSize: 6,
  shuffleSeed: 0, overrides: {}, harmonyAnchor: 0, rampSizeOverrides: {},
  rampSatOverrides: {}, hueShiftStrengthPerRamp: {}, hiddenShades: {},
  rampShuffleOffsets: {}, hardwareLock: null, hueShiftStrength: 1.0,
  lockedRamps: [], collapsedRamps: [], lightnessCurvePerRamp: {},
  satCurvePerRamp: {}, stylePresets: {},
};

describe('SNAPSHOT_FIELDS', () => {
  it('names exactly the 19 document fields', () => {
    expect(SNAPSHOT_FIELDS).toHaveLength(19);
    expect(SNAPSHOT_FIELDS).toContain('baseColors');
    expect(SNAPSHOT_FIELDS).toContain('aiColorNames');
    expect(SNAPSHOT_FIELDS).toContain('stylePresets');
  });
});

describe('inferLabel', () => {
  it('returns Edit when prev or next missing', () => {
    expect(inferLabel(null, base)).toBe('Edit');
    expect(inferLabel(base, null)).toBe('Edit');
  });
  it('detects Add ramp / Remove ramp / Edit base color', () => {
    expect(inferLabel(base, { ...base, baseColors: ['#ff00ff', '#00ff00'] })).toBe('Add ramp');
    expect(inferLabel({ ...base, baseColors: ['#a', '#b'] }, base)).toBe('Remove ramp');
    expect(inferLabel(base, { ...base, baseColors: ['#111111'] })).toBe('Edit base color');
  });
  it('detects pin/unpin, hide/restore, lock/unlock, shuffle', () => {
    expect(inferLabel(base, { ...base, overrides: { 0: '#fff' } })).toBe('Pin / unpin shade');
    expect(inferLabel(base, { ...base, hiddenShades: { 0: [1] } })).toBe('Hide / restore shade');
    expect(inferLabel(base, { ...base, lockedRamps: [0] })).toBe('Lock / unlock ramp');
    expect(inferLabel(base, { ...base, rampShuffleOffsets: { 0: 2 } })).toBe('Shuffle ramp');
  });
  it('detects saturation, per-ramp hue, ramp size, shade count', () => {
    expect(inferLabel(base, { ...base, rampSatOverrides: { 0: 1.2 } })).toBe('Adjust saturation');
    expect(inferLabel(base, { ...base, hueShiftStrengthPerRamp: { 0: 0.5 } })).toBe('Adjust ramp hue shift');
    expect(inferLabel(base, { ...base, rampSizeOverrides: { 0: 8 } })).toBe('Change ramp size');
    expect(inferLabel(base, { ...base, rampSize: 8 })).toBe('Change shade count');
  });
  it('detects global hue shift, hardware lock/unlock, harmony anchor, generate, collapse', () => {
    expect(inferLabel(base, { ...base, hueShiftStrength: 1.5 })).toBe('Adjust hue shift');
    expect(inferLabel(base, { ...base, hardwareLock: 'nes' })).toBe('Lock to nes');
    expect(inferLabel({ ...base, hardwareLock: 'nes' }, base)).toBe('Unlock hardware');
    expect(inferLabel(base, { ...base, harmonyAnchor: 2 })).toBe('Change harmony anchor');
    expect(inferLabel(base, { ...base, shuffleSeed: 1 })).toBe('Generate');
    expect(inferLabel(base, { ...base, collapsedRamps: [0] })).toBe('Collapse / expand ramps');
  });
  it('falls back to Edit for unrecognized change', () => {
    expect(inferLabel(base, base)).toBe('Edit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/history-snapshot.spec.ts`
Expected: FAIL — `Cannot find module '../../src/lib/history-snapshot'`.

- [ ] **Step 3: Create the module by moving the pure logic verbatim**

Copy the `inferLabel` body from `src/App.tsx` (HEAD `276333e` ~lines 3127–3150) verbatim into the new module, and define the field list from `buildUndoSnapshot` (~lines 3060–3080). Keep `inferLabel` byte-identical — it is the characterized behavior.

```ts
// src/lib/history-snapshot.ts
export const SNAPSHOT_FIELDS = [
  'baseColors', 'aiColorNames', 'aiReasoning', 'rampSize', 'shuffleSeed',
  'overrides', 'harmonyAnchor', 'rampSizeOverrides', 'rampSatOverrides',
  'hueShiftStrengthPerRamp', 'hiddenShades', 'rampShuffleOffsets',
  'hardwareLock', 'hueShiftStrength', 'lockedRamps', 'collapsedRamps',
  'lightnessCurvePerRamp', 'satCurvePerRamp', 'stylePresets',
] as const;

// Verbatim from App.tsx inferLabel — do not "improve". Characterized by spec.
export function inferLabel(prev: any, next: any): string {
  if (!prev || !next) return 'Edit';
  if (JSON.stringify(prev.baseColors) !== JSON.stringify(next.baseColors)) {
    if (prev.baseColors.length < next.baseColors.length) return 'Add ramp';
    if (prev.baseColors.length > next.baseColors.length) return 'Remove ramp';
    return 'Edit base color';
  }
  if (JSON.stringify(prev.overrides) !== JSON.stringify(next.overrides)) return 'Pin / unpin shade';
  if (JSON.stringify(prev.hiddenShades) !== JSON.stringify(next.hiddenShades)) return 'Hide / restore shade';
  if (JSON.stringify(prev.lockedRamps) !== JSON.stringify(next.lockedRamps)) return 'Lock / unlock ramp';
  if (JSON.stringify(prev.rampShuffleOffsets) !== JSON.stringify(next.rampShuffleOffsets)) return 'Shuffle ramp';
  if (JSON.stringify(prev.rampSatOverrides) !== JSON.stringify(next.rampSatOverrides)) return 'Adjust saturation';
  if (JSON.stringify(prev.hueShiftStrengthPerRamp) !== JSON.stringify(next.hueShiftStrengthPerRamp)) return 'Adjust ramp hue shift';
  if (JSON.stringify(prev.rampSizeOverrides) !== JSON.stringify(next.rampSizeOverrides)) return 'Change ramp size';
  if (prev.rampSize !== next.rampSize) return 'Change shade count';
  if (prev.hueShiftStrength !== next.hueShiftStrength) return 'Adjust hue shift';
  if (prev.hardwareLock !== next.hardwareLock) {
    return next.hardwareLock ? `Lock to ${next.hardwareLock}` : 'Unlock hardware';
  }
  if (prev.harmonyAnchor !== next.harmonyAnchor) return 'Change harmony anchor';
  if (prev.shuffleSeed !== next.shuffleSeed) return 'Generate';
  if (JSON.stringify(prev.collapsedRamps) !== JSON.stringify(next.collapsedRamps)) return 'Collapse / expand ramps';
  return 'Edit';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/history-snapshot.spec.ts`
Expected: PASS (all assertions).

- [ ] **Step 5: Replace the inline copy in App.tsx with the import**

In `src/App.tsx`: add `import { inferLabel } from './lib/history-snapshot';` to the import block, and delete the inline `const inferLabel = ...` definition (~lines 3127–3150). Leave `buildUndoSnapshot` as-is for now (Wave 2 will use `SNAPSHOT_FIELDS`).

- [ ] **Step 6: Verify grep-per-symbol + suite green**

```bash
grep -nE 'const inferLabel|function inferLabel' src/App.tsx   # expect ZERO
grep -cn 'inferLabel' src/App.tsx                              # expect > 0 (import + call site)
npx vitest run && npm run build
```
Expected: zero declaration hits, >0 references, full unit suite + build green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/history-snapshot.ts tests/unit/history-snapshot.spec.ts src/App.tsx
git commit -m "refactor(history): extract pure inferLabel + SNAPSHOT_FIELDS to lib, add characterization tests"
```

---

## Wave 1 — independent ephemeral hooks

Each Wave 1 task follows the **same shape**. The hooks have no cross-coupling, so they can be done in any order; recommended order is smallest-first to build the wiring pattern. For every Wave 1 hook:

**Generic task shape (apply per hook):**

- [ ] **Step A — Create the hook file.** Create `src/hooks/useXxx.ts`. Move the listed `useState` declarations and the listed `useEffect`(s) verbatim into the hook body. The hook takes a typed options arg for any value it currently reads from outside its domain (e.g. `mode` for `useImageExtract`'s reset effect, persisted-initial values), and returns an object with every moved state value, its setter, and any handlers that close only over this domain. Hook file is normally typed (not `@ts-nocheck`); use `any` sparingly where it touches the untyped App surface, matching Tier A lib style.
- [ ] **Step B — Wire into App.tsx.** Add `import { useXxx } from './hooks/useXxx';`. Replace the removed `useState`/`useEffect` block with `const { ...fields, ...setters, ...handlers } = useXxx({ ...options });`. Pass any required cross-domain options.
- [ ] **Step C — grep-per-symbol gate.** For each moved symbol: `grep -nE 'const \[?\bSYMBOL\b' src/App.tsx` → zero declaration hits; `grep -cn '\bSYMBOL\b' src/App.tsx` → >0 references. Repeat for the setter and any moved handler.
- [ ] **Step D — Suite + build green.** `npx vitest run && npm run build`. (Remember: build green is necessary, not sufficient — Step C is the real gate.)
- [ ] **Step E — Commit.** `git commit -m "refactor(hooks): extract useXxx from App.tsx"`.

The per-hook field/effect inventory (all line numbers anchored to HEAD `276333e`, locate by grep):

### Task 2: `useDisplaySettings`
- State: `theme`, `cvdMode`, `crtEnabled`
- Effects: theme persist (dep `[theme]`, ~2343), cvd persist (dep `[cvdMode]`, ~2371)
- Options in: none (reads persisted defaults via existing init logic — move that too)

### Task 3: `useVizSettings`
- State: `vizStyle`, `matrixColorSet`, `matrixView`, `ditherPattern`
- Effects: vizStyle persist (dep `[vizStyle]`, ~2438)
- Options in: none

### Task 4: `useExportSettings`
- State: `gplStyle`, `exportFormat`, `rampExportStyle`, `exportFeedback`, `lastSavedPath`, `sessionRampGplFolder`, `copiedHex`
- Effects: persist `[gplStyle]` (~2464), `[exportFormat]` (~2490), `[rampExportStyle]` (~2519)
- Options in: none. Note: `exportFeedback` is also written by undo/redo toast messages — expose `setExportFeedback` in the return so `useHistory` (Wave 2) can be passed it as an option.

### Task 5: `useTour`
- State: `tourOpen`, `tourGuideId`, `tourStep`, `launcherOpen`
- Effects: tour snapshot effects (~1054 `snapshotTourState`, ~1089). Move `tourSnapshot` ref too.
- Options in: none

### Task 6: `useSpriteImport`
- State: `spriteKey`, `customSprites`, `showSpriteImporter`, `spriteImportText`, `spriteImportName`, `spriteImportError`, `spriteDragging`
- Effects: none beyond handlers
- Options in: none

### Task 7: `useAIAssist`
- State (the *request* only): `aiInput`, `aiLoading`, `aiError`, `showAISettings`, `aiConfigured`
- **Do NOT move** `aiColorNames` / `aiReasoning` — those are document state (in `SNAPSHOT_FIELDS`), owned by `usePaletteState` in Wave 2. The AI generate handler writes results into the document core; wire that at the App layer by passing the core's `setAiColorNames`/`setAiReasoning` as options (or keep the generate handler in App.tsx until Wave 2 lands, then relocate). For this task, the generate handler stays in App.tsx; this hook owns only the request fields.
- Effects: none
- Options in: none

### Task 8: `useImageExtract`
- State: `imageDataUrl`, `imageColorCount`, `imageLoading`, `imageError`, `isDragging`, `eyedropperActive`, `imageZoom`, `imageNaturalSize`, `hoveredColor`
- Effects: mode-reset effect (dep `[mode]`, ~1105) — takes `mode` as an option.
- Options in: `{ mode }`

### Task 9: `useImageRemap`
- State: `remapImageDataUrl`, `remapImageNaturalSize`, `remapOutput`, `remapOutputSignature`, `remapDither`, `remapLoading`, `remapError`, `remapImageName`, `remapDownloadScale`, `remapDownloadConfirmPending`, `remapDragOver`
- Effects: `[remapImageDataUrl, livePaletteSig]` (~1364), `[remapOutput]` (~1395), `[remapImageDataUrl]` (~2980)
- Options in: `{ livePaletteSig, palette }` (the live working palette + its signature, computed in App.tsx from document state). **This hook reads the working palette but does not own it** — pass it in.
- **Sizing:** large (~11 fields + 3 effects + remap pipeline calls). Split into Step A (create hook with state + effects) and a separate commit for Step B wiring if it doesn't fit one turn (obs #8).

### Task 10: `useSideBySide`
- State: `sbsRemapSource`, `sbsLeftRemap`, `sbsRightRemap`, `sbsLeftRemapLoading`, `sbsRightRemapLoading`, `sbsLeft`, `sbsRight`, `sbsLeftPayload`, `sbsRightPayload`, `sbsLeftError`, `sbsRightError`, `sbsLeftLoading`, `sbsRightLoading`
- Effects: `[sbsLeftRemap]` (~1416), `[sbsRightRemap]` (~1432), `[sbsLeft]` (~2776), `[sbsRight]` (~2819), `[sbsRemapSource, leftRemapKey]` (~3023), `[sbsRemapSource, rightRemapKey]` (~3050)
- Options in: `{ resolveSlot, paletteFromSnapshotForRemap, vizStyle }` — the slot-resolution + snapshot-palette helpers it calls (these read document state; keep them in App.tsx or pass them in).
- **Sizing:** largest ephemeral hook (~13 fields + 6 effects). Split A (state+effects) / B (wire) across two commits.

### Task 11: `useSavedPalettes`
- State: `savedPalettes`, `saveName`, `savedError`, `savedBusy`, `confirmDeleteSlug`, `renamingSlug`, `renameDraft`, `renameError`, `savedFilter`, `classicLoaderId`, `confirmReset`
- Effects: saved-palettes localStorage persist/load
- Options in: `{ buildSavePayload, loadPayload }` — save reads the full document to serialize; load writes the document via the core's setters. For this task, pass those as callbacks wired in App.tsx (they depend on Wave 2's `usePaletteState`; until then they remain App.tsx functions).

### Task 12: `usePanelLayout`
- State: `rampsOpen`, `harmonyOpen`, `tipsOpen`, `hwPickerOpen`, `exportOpen`, `historyOpen`, `savedOpen`, `sbsOpen`, `pgOpen`, `advancedOpen`, `sectionOrder`, `dragOver`, `draggingKey`
- Effects: panel-open persist (multi-dep, ~1029), `[sectionOrder]` persist (~1033). Move the `_panels` initial-read helper too.
- Options in: none
- Note: `historyOpen` is read by `useHistory` (Wave 2) for the panel toggle, but is layout state — keep it here and pass `historyOpen`/`setHistoryOpen` into `useHistory` as options if needed, OR leave `historyOpen` in App.tsx wiring. Decide during Task 12; default = own it here, pass down.

### Task 13: `useUpdater`
- State: `updateInfo`, `updateReady`, `updateDownloading`
- Effects: updater init/check effects (~1008–1031 region, the Tauri updater wiring)
- Options in: none. Tauri-gated (dynamic import); preserve the `isTauri()` guards verbatim.

---

## Wave 2 — document core + history (last, co-located) — CORRECTED 2026-06-03

Behavior-sensitive. The Task 1 characterization tests + e2e are the net.

**Corrected scope (supersedes earlier Task 14/15 drafts):** `usePaletteState` is a
**thin state-bag** — the 25 document fields + 3 snapshot helpers, nothing else. The
**generation pipeline + ALL bulk handlers STAY in App.tsx** (they read the fields via
the destructured `palette` object). `useHistory` owns the history machinery and the
`pendingLabelRef`; the ~19 scattered `pendingLabelRef.current =` writes in App.tsx
handlers become `tagNextLabel(...)` calls. The 2 writes *inside the watcher*
(read + null-reset) move into `useHistory` verbatim — NOT converted.

**Verification gate (both, every move):**
1. **grep-per-symbol:** `decl=0` in App.tsx, `refs>0`.
2. **TS2304 completeness gate** (catches the deleted-but-not-destructured hole grep
   misses — `@ts-nocheck` + no-eslint-in-CI hide it otherwise): temporarily replace
   line-1 `// @ts-nocheck`, `npx tsc --noEmit`, collect `TS2304 Cannot find name`
   hits, restore. **Baseline = `__APP_VERSION__`, `__BUILD_DATE__` only.** Any *new*
   TS2304 name = a dangling reference (missing destructure). Fix before commit.

### Task 14: `usePaletteState` — thin document state-bag

**Files:** Create `src/hooks/usePaletteState.ts`; modify `src/App.tsx`.

The 25 fields (move `useState` verbatim, keep initializers byte-identical):
- **19 snapshot:** baseColors, aiColorNames, aiReasoning, rampSize, shuffleSeed,
  overrides, harmonyAnchor, rampSizeOverrides, rampSatOverrides,
  hueShiftStrengthPerRamp, hiddenShades, rampShuffleOffsets, hardwareLock,
  hueShiftStrength, lockedRamps, collapsedRamps, lightnessCurvePerRamp,
  satCurvePerRamp, stylePresets
- **6 editor/compare cluster:** editingIndex, editorHsv, pinEditor, compareMode,
  compareAnchor, compareResult
- **STAY in App.tsx:** mode, colorInput, addBaseFeedback, gplImport (input/mode fields,
  read by the staying bulk handlers — not document core).

Hook imports `DEFAULT_STYLE_PRESETS` from `./lib/style-presets`, `CurvePoints` type from
`./lib/curve`. Returns the 25 values + 25 setters + 3 helpers:
- `buildSnapshot()` — the old `buildUndoSnapshot` body verbatim (sorts locked/collapsed).
- `applySnapshotFields(snap)` — the 19 setter calls from old `applyUndoSnapshot`
  (lines ~2755–2773), **without** the `isReplayingHistoryRef` flag and **without** the
  4 transient resets.
- `resetTransientEditors()` — `setPinEditor(null); setEditingIndex(null);
  setCompareAnchor(null); setCompareResult(null);`.

- [ ] **Step 1:** Create the hook with the 25 `useState` + 3 helpers.
- [ ] **Step 2:** In App.tsx, remove the 25 `useState` lines; add
  `const palette = usePaletteState();` and destructure all 25 values + setters +
  `buildSnapshot, applySnapshotFields, resetTransientEditors`. Place the call ABOVE the
  history machinery.
- [ ] **Step 3:** Rewire the still-resident history machinery: watcher's
  `buildUndoSnapshot()` → `buildSnapshot()`; App.tsx `applyUndoSnapshot(snap)` body →
  `isReplayingHistoryRef.current = true; applySnapshotFields(snap); resetTransientEditors();`.
  Delete the old local `buildUndoSnapshot` + `applyUndoSnapshot` bodies. `resetStylePresets`
  and all bulk handlers stay (now call `palette` setters).
- [ ] **Step 4 — gates:** grep `decl=0`/`refs>0` for all 25 symbols + their setters;
  TS2304 gate clean (baseline only). `npx vitest run && npm run build` green.
- [ ] **Step 5:** Commit: `refactor(hooks): extract usePaletteState thin document state-bag`.

### Task 15: `useHistory` — history machinery + `tagNextLabel`

**Files:** Create `src/hooks/useHistory.ts`; modify `src/App.tsx`.

Move verbatim into the hook: `HISTORY_DEPTH_CAP`/`HISTORY_DEBOUNCE_MS` consts,
`historyEntries` (incl. the `Initial state` sentinel initializer), `historyIndex`,
refs (`historyEntriesRef`, `historyIndexRef`, `isReplayingHistoryRef`, `pendingLabelRef`,
`historyDebounceRef`), the 2 ref-sync effects, the debounced watcher effect, the keybind
rebind effect, `applyUndoSnapshot`, `undo`, `redo`, `jumpToHistoryIndex`, `canUndo`,
`canRedo`. `inferLabel` already imported from `./lib/history-snapshot`.

Interface:
```ts
const { historyEntries, historyIndex, undo, redo, jumpToHistoryIndex,
        canUndo, canRedo, tagNextLabel } = useHistory({
  buildSnapshot, applySnapshotFields, resetTransientEditors, // from palette
  setExportFeedback,                                          // from useExportSettings
  snapshotInputs,  // the 17-value watcher dep array (see below) — used AS the dep array
});
```
- `useHistory.applyUndoSnapshot(snap)` = `if(!snap) return; isReplayingHistoryRef.current = true;
  applySnapshotFields(snap); resetTransientEditors();`.
- `tagNextLabel(label)` = `pendingLabelRef.current = label;` — returned, called by App.tsx handlers.
- The watcher's two internal `pendingLabelRef` touches (read for `label`, then `= null`) stay
  inside the hook verbatim.
- **`snapshotInputs` dep array — preserve VERBATIM at 17 fields** (deliberately omits
  `lightnessCurvePerRamp` + `satCurvePerRamp`; do NOT "complete" to 19 — behavior change):
  `[baseColors, aiColorNames, aiReasoning, rampSize, shuffleSeed, overrides, harmonyAnchor,
  rampSizeOverrides, rampSatOverrides, hueShiftStrengthPerRamp, hiddenShades,
  rampShuffleOffsets, hardwareLock, hueShiftStrength, lockedRamps, collapsedRamps, stylePresets]`.

- [ ] **Step 1:** Create the hook; the watcher uses `}, snapshotInputs);` as its dep array
  (CI runs no eslint, so the variable dep array is safe for the merge gate).
- [ ] **Step 2:** Wire into App.tsx; pass the options; destructure the return.
- [ ] **Step 3:** Convert the ~19 handler-site `pendingLabelRef.current = X` → `tagNextLabel(X)`.
- [ ] **Step 4 — gates:** `pendingLabelRef` must be **0 refs** in App.tsx (clean gate);
  `decl=0`/`refs>0` for historyEntries/historyIndex/undo/redo/jumpToHistoryIndex/canUndo/canRedo;
  TS2304 gate clean. `npx vitest run && npm run build` green.
- [ ] **Step 5:** Commit: `refactor(hooks): extract useHistory; tagNextLabel + explicit editor-reset interface`.

### Task 16: e2e + integration verification + PR

- [ ] **Step 1:** `npm run test:e2e` locally if the dev server is available; else rely on CI (note in PR).
- [ ] **Step 2:** Behavior-sensitive smoke: 3+ edits (edit base color, change shade count, lock a ramp)
  → undo ×3 → redo ×3 → jump to a middle history entry; palette + labels round-trip.
- [ ] **Step 3:** Push, open PR. **Wait for full green CI before merging** (obs #6).
- [ ] **Step 4:** After green CI, finish via `superpowers:finishing-a-development-branch`.

---

## Self-review notes (author)

- **Spec coverage:** all 12 Wave-1 hooks + 2 Wave-2 hooks from the spec table have tasks (Tasks 2–15). The `useHistory`↔editor-reset interface (spec §Key interface) is Task 15 Step 2. Verification strategy (grep-per-symbol, characterization-before-Wave-2, early e2e, CI merge gate) is in the Critical Rules + Tasks 1/16. AI request-vs-result boundary (spec fix) is Task 7's explicit "do NOT move aiColorNames/aiReasoning" note + Task 14 ownership.
- **Leftover fields** (editor/compare/mode/colorInput/gplImport/addBaseFeedback) are assigned to `usePaletteState` in Task 14 because the generation pipeline reads them — matches the spec's "candidates… but touched by applyUndoSnapshot" note.
- **Type consistency:** `buildUndoSnapshot` / `applySnapshotFields` / `resetTransientEditors` / `inferLabel` / `SNAPSHOT_FIELDS` names are used identically across Tasks 1, 14, 15.
- **Known adaptation:** this is a zero-behavior-change refactor, so Wave 1 tasks are extract-and-verify (grep + suite-stays-green) rather than red-green TDD. Only Task 1 (pure kernel) is classic TDD. This is intentional and called out in the Critical Rules.
