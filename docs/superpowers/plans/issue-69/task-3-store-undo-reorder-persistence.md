# Task 3 — Store state + undo + reorder + saved-palette persistence plumbing

> Read `../README.md` first — especially "the three keep-in-sync field lists."

**Depends on:** Task 1 (`RampStyle`). Can run in parallel with Task 2 (disjoint files).
**Scope:** `[state]` — store, permutation, history, palette-state surface, App dep
arrays, saved-palette I/O.

## Context you need

Three new palette-identity fields must be threaded through undo/redo, the reorder
permutation, and saved-palette persistence, so they never desync from `baseColors`:

- `paletteDefaultStyle: RampStyle` — scalar, default `'punchy'`. **Not** permuted.
- `rampStyleOverrides: Record<number, RampStyle>` — sparse map, permuted.
- `rampStyleScalars: Record<number, StyleScalars>` — sparse map, permuted.

## Changes

### 1. `src/store/rampsStore.ts`
- Add the 3 fields to `RampsStoreState` (types near `:16-28`) and 3 setters
  (`:48-73`); implement setters via `resolveUpdater` (`:109-135`).
- Initial values (`:81-107`): `paletteDefaultStyle: 'punchy'`, `rampStyleOverrides: {}`,
  `rampStyleScalars: {}`.
- Add all 3 to `buildSnapshot` (`:136-158`) and `applySnapshotFields` (`:160-181`,
  each with a `?? default`: `paletteDefaultStyle ?? 'punchy'`, maps `?? {}`).
- Wire the **two maps** into `reorderRamps` (`:187-219`): pass them into the
  `permuteRampState({...})` input object and write the permuted results back in the
  `set({...})` call. **Do not** pass `paletteDefaultStyle` (scalar, unaffected by
  reorder).

### 2. `src/lib/permute-indexed-state.ts`
- Add `'rampStyleOverrides'` and `'rampStyleScalars'` to `MAP_FIELDS` (`:47-50`).
- Add both to the `RampStatePlain` interface (`:52-66`) as `Record<string, any>`.
- (No logic change — `permuteStringKeyMap` handles them generically.)

### 3. `src/lib/permute-indexed-state` test
- Extend the characterization test: seed both new maps with distinct identifiable
  values per index, apply a reorder in **both** directions (0→last and last→0) plus an
  adjacent swap, assert both maps followed the permutation with no value on the wrong
  ramp.

### 4. `src/lib/history-snapshot.ts`
- Add all 3 field names to `SNAPSHOT_FIELDS` (`:1-7`).
- Add `inferLabel` branches (`:10-33`), placed before the generic fallback:
  - `rampStyleScalars` differs → `'Customize ramp style'`
  - `rampStyleOverrides` differs → `'Change ramp style'`
  - `paletteDefaultStyle` differs → `'Change default style'`
- Update the accompanying `history-snapshot` spec if it asserts the field count/labels.

### 5. `src/hooks/usePaletteState.ts`
- Re-export the 3 fields + setters (mirror the existing `stylePresets` line).

### 6. `src/App.tsx`
- Add the 3 fields to `workingRenderInputs` (`:296-311`) and its dependency array.
- Add `rampStyleOverrides` and `rampStyleScalars` to the `snapshotInputs` dep list
  (`:247-252`) so per-ramp style edits push a history entry. (`paletteDefaultStyle`
  too — it is snapshot state.) Note the existing comment about the intentional
  omissions; add these deliberately.

### 7. `src/hooks/useSavedPalettesActions.ts` + `src/lib/palette.ts`
- **Type (`palette.ts`):** add `paletteDefaultStyle?: RampStyle;` and
  `rampStyleOverrides?: Record<string, RampStyle>;` and
  `rampStyleScalars?: Record<string, StyleScalars>;` to the saved-payload type. Keep
  the existing `vizStyle?`/`gplStyle?` fields (legacy read).
- **Save (`useSavedPalettesActions.ts` ~`:176-209`):** write the 3 new fields next to
  `rampSizeOverrides`.
- **Load (~`:230-471`):** restore them with validation — validate any style string
  against `RAMP_STYLES` (from Task 1), drop invalid map entries, clamp scalar numbers
  to sane ranges (0–1). **Legacy migration:** when the payload has no
  `paletteDefaultStyle`, set it from the saved `vizStyle` (else `gplStyle`, else
  `'punchy'`) and `rampStyleOverrides = {}` / `rampStyleScalars = {}`. Route through
  the existing `tagNextLabel('Load: …')`.

## Acceptance criteria

- `npm test` green (permute characterization + history specs updated).
- Reorder a palette with per-ramp styles set → styles travel with their ramp (covered
  by the extended permute test; sanity-check live in Task 6+).
- Save a palette, reload the app, load it back → `paletteDefaultStyle`,
  `rampStyleOverrides`, `rampStyleScalars` restored. A pre-#69 payload loads with
  `paletteDefaultStyle` derived from its old `vizStyle`.
- Type gate clean (strip-nocheck `App.tsx` copy + `tsc --noEmit`); grep confirms no
  dangling refs in `App.tsx`.

## Suggested commit

```
feat(state): thread per-ramp style fields through snapshot/reorder/persistence (#69)

Adds paletteDefaultStyle + rampStyleOverrides + rampStyleScalars to the store,
undo snapshot, reorder permutation, and saved-palette payload (with legacy
vizStyle→default migration). No UI yet.
```
