# Task 5 — Thread aggregate views to `rampsActive`; retire the global selectors

**Status: ✅ Done.** Every non-card consumer now reads `rampsActive` /
`buildRampsForSnapshot(snap)` (Visualization, Playground, Remap, side-by-side,
sprite preview) and all exports render per-ramp: `export.ts`
`collectPaletteEntries`/`filteredRamp` take `rampsActive` (dropped
`selectRampsForStyle`); `useExport` per-ramp Copy/Download and whole-palette
gpl/pal/ase/strip use `activeStyleFor(i)` with a `-mixed` filename tag when
styles diverge. `vizStyle`/`gplStyle`/`rampExportStyle` (+ setters, persist
effects, and their `ui:` keys) are removed; the RampsPanel "Ramp export:"
toggle and the ExportPanel/Viz style trios are gone. `npm test` (591 tests),
type gate, `npm run build`, `npm run deadcode:ci` (0 new), and `npm run test:e2e`
(53 passed) all green.

> Read `../README.md` first.

**Depends on:** Task 4 (`rampsActive`, `activeStyleFor`).
**Scope:** `[wiring, larger]` — every ramp consumer except the Color Ramps card
(Task 6). Can run in parallel with Task 6; coordinate on `App.tsx` prop wiring.

## Context you need

Under "authoritative everywhere," every view renders each ramp at its active style, so
the three global selectors (`vizStyle`, `rampExportStyle`, `gplStyle`) stop being
display switches and are removed. Below is the grounded consumer inventory — change
each site to consume `rampsActive` (or, for snapshot consumers, let
`buildRampsForSnapshot(snap)` resolve per-ramp, which it now does after Task 2).

## Changes — consumers

- **Visualization / Side-by-side** (`src/components/panels/VizComparePanel.tsx`):
  - `:216` `buildRampsForSnapshot(snap, vizStyle)` → `buildRampsForSnapshot(snap)`.
  - `:646-647` cross-adjacency A×B: drop the `vizStyle` arg on both calls.
  - `:28,:102,:162,:447-449` remove the `vizStyle` prop, `styleAccent`, and the
    Punchy/Balanced/Muted button row. If `styleAccent` was only cosmetic, drop it or
    key it off `paletteDefaultStyle`.
  - `src/hooks/useSideBySideCompute.ts:40,:70,:268` remove the `vizStyle` prop;
    `paletteFromSnapshotForRemap` calls `buildRampsForSnapshot(snapshot)`.
- **Playground** (`src/components/panels/PlaygroundPanel.tsx`):
  - `:47` `ramps={rampsActive}`; remove the vizStyle button row (`:34-44`) and the
    three-array props — the panel now takes `rampsActive` + `isDark`.
- **Image remap** (`src/hooks/useImageRemapCompute.ts`):
  - `:75-77` set `rampsForStyle = p.rampsActive`; drop the `vizStyle` prop and the
    three-array props. The per-ramp filterHidden/dedupe below is unchanged.
- **Sprite preview** (`src/components/panels/InputPanel.tsx`):
  - `:50,:85,:255` rename the `rampsPunchy` prop to `rampsActive`; use `rampsActive?.[0]`.
- **Exports** (`src/hooks/useExport.ts` + `src/lib/export.ts`):
  - PNG snapshot exports `useExport.ts:82,:108,:135,:164` — drop the `vizStyle` arg
    (`buildRampsForSnapshot(snap)`).
  - Whole-palette gpl/pal/ase/strip `useExport.ts:201-234` — export each ramp at its
    active style. In `export.ts` `collectPaletteEntries` (`:90-136`, style select at
    `:104`) and `filteredRamp` (`:147-164`), accept a per-ramp `rampsActive` array and
    index into it instead of selecting by `style`. `selectRampsForStyle` (`:143-144`)
    becomes dead → **remove it** (and any import). Filenames that embedded `${gplStyle}`
    (`:203,:213,:223,:234`) → drop the style suffix, or use `-mixed` when
    `rampStyleOverrides` diverge from `paletteDefaultStyle`, else the default style name.
  - Per-ramp Copy/Download `useExport.ts:280,:289-290` — use `activeStyleFor(i)` for
    the style and filename (`...-${activeStyleFor(i)}.gpl`).
  - `buildPaletteText` (the human-readable `.txt` dump, `export.ts:22-88`) **keeps all
    three** styles — it is a full dump, not a style-selected view. Leave it.

## Changes — retire the globals

- **`src/hooks/useVizSettings.ts`:** delete `vizStyle`/`setVizStyle` state and the
  `ui:vizStyle` load/persist effects (`:37,:44-74`).
- **`src/hooks/useExportSettings.ts`:** delete `rampExportStyle` (`:56,:120-149`,
  `ui:rampExportStyle`) and `gplStyle` (`:54,:63-90`, `ui:gplStyle`).
- **`src/components/panels/ExportPanel.tsx`:** remove the `gplStyle` button trio
  (`:21,:33,:113-115`) and its props.
- **`src/hooks/useDragReorder.tsx:34,:63-68`:** repoint the "viz" section-accent tint
  (was keyed off `vizStyle`) to a constant or `paletteDefaultStyle`.
- **`src/App.tsx`:** remove the now-dead props threaded to consumers
  (`:387,:547,:562,:611,:930`) and any `vizStyle`/`rampExportStyle`/`gplStyle`
  destructures. Pass `rampsActive` (and `activeStyleFor` where needed) instead.
- Orphaned `ui:vizStyle` / `ui:rampExportStyle` / `ui:gplStyle` localStorage keys are
  harmless; note them in the PR (no cleanup required).

## Tests

- Update `tests/unit/PlaygroundPanel.spec.tsx`, `VizComparePanel.spec.tsx`,
  `ExportPanel.spec.tsx`, `export.spec.ts` for the removed buttons/args and the new
  `rampsActive` prop shape.
- Add an export test: a palette with mixed per-ramp styles produces gpl entries whose
  colors match each ramp's active style.

## Acceptance criteria

- Every view renders per-ramp styles; setting `rampStyleOverrides[2]='muted'` shows
  ramp 2 muted in Viz, Mosaic, Remap, and the whole-palette `.gpl`.
- `npm run deadcode` shows no orphaned `selectRampsForStyle` / retired setters.
- `npm test` + `npm run test:e2e` green; type gate clean; grep `App.tsx` for the
  removed identifiers returns nothing.

## Suggested commit

```
feat(views): render every view per-ramp via rampsActive; retire global style selectors (#69)

Visualization, Playground, Remap, side-by-side, sprite preview, and all exports
now honor each ramp's active style. Removes vizStyle/rampExportStyle/gplStyle.
```
