# Per-ramp style presets (#69)

**Date:** 2026-07-17
**Issue:** #69, per-ramp style presets: show only the active style, custom
overrides, named save/load.
**Sibling:** #52 (drag-to-reorder ramps), its permutation machinery is the
extension point the two new per-ramp maps join. See
`docs/superpowers/specs/2026-06-05-reorder-ramps-design.md`.

## Goal

Before this change, the **Color Ramps** card rendered all three styles
(Punchy/Balanced/Muted) stacked per ramp, and "which style" was a single global
choice split across three independent session selectors: `vizStyle`
(Visualization/Playground/Remap/Side-by-side), `rampExportStyle` (per-ramp
Copy/Download `.gpl`), and `gplStyle` (whole-palette export). None of the
three were part of the undo snapshot or the saved-palette payload.

Style is now a **per-ramp property**. Each ramp picks its own active style;
every view shows only that style; editing the reach/chroma-falloff knobs for
one ramp flips it to a bespoke **Custom** style (the named Punchy/Balanced/
Muted presets stay pristine); custom looks can be saved and loaded by name
like saved palettes.

## Data model

Three new fields, owned by the Zustand store `src/store/rampsStore.ts` next to
`rampSizeOverrides` etc. Unlike the retired UI-pref globals, these are
**palette identity**: they join undo history and the saved-palette payload.

| Field | Shape | Notes |
|---|---|---|
| `paletteDefaultStyle` | `RampStyle` (default `'punchy'`) | fallback active style for any ramp without an override; a **scalar** (not part of the reorder permutation) |
| `rampStyleOverrides` | `Record<number, RampStyle>` (sparse, keyed by baseIndex) | per-ramp active style |
| `rampStyleScalars` | `Record<number, StyleScalars>` (sparse, keyed by baseIndex) | per-ramp `{reach, chromaFalloff}`, only meaningful when that ramp's override is `'custom'` |

`RampStyle = 'punchy' | 'balanced' | 'muted' | 'custom'` and `RAMP_STYLES`
(`src/lib/style-presets.ts`) enumerate it. `StyleScalars = { reach: number;
chromaFalloff: number }` already existed there for the named presets.

## Resolution

Both resolvers are pure helpers in `src/lib/style-presets.ts`, used by both the
live render path and the snapshot/export path so there is exactly one
definition of "what style is this ramp":

- **Active style for a ramp:**
  `resolveActiveStyle(overrides, baseIndex, defaultStyle) = overrides[baseIndex] ?? defaultStyle`.
- **Scalars a ramp renders at:** `resolveRampScalars({ style, baseIndex,
  stylePresets, rampStyleScalars })`. For `'custom'`, the ramp's own
  `rampStyleScalars[baseIndex]`, falling back to the **balanced** preset
  scalars if that ramp has never been switched to Custom; for a named style,
  `styleToScalars(style, stylePresets)`.
- **Inside `buildRamp`** (`src/lib/ramp-pipeline.ts`): style enters at the
  `styleToScalars`/`resolveRampScalars` call and the per-style pin lookup;
  everything downstream of the resolved scalars is unchanged.

### The single new render array

`rampsActive[i] = buildRamp(liveRampSnapshot, activeStyleFor(i), i)`: one
strip per ramp at its own active style, computed by `useRampStyleActions`
(`src/hooks/useRampStyleActions.ts`) and threaded through `App.tsx`. Every
ramp consumer (Color Ramps card, Mosaic, Adjacency, Dither, Visualization,
Side-by-side, Remap, sprite previews, whole-palette export) reads
`rampsActive` instead of picking one of three global sets. The three memos
`rampsPunchy`/`rampsBalanced`/`rampsMuted` are kept, but only for (a) the
card's "show all three" comparison view and (b) the pin editor, which needs a
specific style's ramp.

### Backward compatibility (free)

With `paletteDefaultStyle = 'punchy'` and empty overrides, `rampsActive ===
rampsPunchy`, so the ramp-pipeline characterization test stays byte-identical.
Loading a pre-#69 saved palette has no per-ramp fields:
`useSavedPalettesActions` migrates the saved `vizStyle` (falling back to
`gplStyle`, else `'punchy'`) into `paletteDefaultStyle` and leaves
`rampStyleOverrides`/`rampStyleScalars` empty, so every ramp shows the style
the palette was last viewed at.

### Named styles persistence

`styles:{slug}` localStorage namespace holds `{ name, savedAt, reach,
chromaFalloff }`, managed by `src/hooks/useSavedStylesActions.ts` (mirrors
`useSavedPalettesActions.ts` at a much smaller scale: two numbers and a name
instead of a whole palette; `SAVED_STYLE_LIMIT = 100`). Loading a named style
stamps a **copy** into `rampStyleScalars[i]` and sets that ramp's override to
`'custom'`, snapshot-copy semantics like saved palettes, not a live reference
back to the saved entry.

## Interactions

- **Header "Default Style" row** (`RampsPanel.tsx`, below the global "Style
  Tuning" box, above the hardware-lock banner): segmented Punchy/Balanced/
  Muted control for `paletteDefaultStyle`, a "Set All Ramps to Default" action,
  and the "Compare All 3 Styles" toggle (`showAllStyles`, local to
  `RampsPanel`, default off) that switches the card back to the old stacked
  three-strips-per-ramp view.
- **Per-ramp picker**: inside the `editingIndex === i` Adjust Base editor
  header, next to the HSV/OKLCH mode toggle, a P/B/M/Custom segmented control
  calling `setRampStyleOverride(i, style)`. Flipping a ramp to `'custom'` for
  the first time seeds `rampStyleScalars[i]` from that ramp's *current
  resolved* scalars (not the balanced-preset fallback), so the sliders don't
  visually jump.
- **Custom tuning sliders** (Task 7): Reach / Chroma falloff sliders always
  shown in the Adjust Base editor; dragging either calls `setRampScalar(i,
  key, value)`, which writes into `rampStyleScalars[i]` and flips that ramp's
  override to `'custom'` (auto-switch, no separate "enable custom" step).
- **Named save/load** (Task 8): a save-name input + Save button, and a load
  `<select>` + Load/Delete, compact inside the same editor slot, no dedicated
  section card.
- Every intent-tagged mutation calls `tagNextLabel` directly at the call site
  (in `RampsPanel`'s `onClick`/handler, before invoking the setter), matching
  the existing "Add base from shade" convention; `inferLabel`
  (`src/lib/history-snapshot.ts`) has untagged fallbacks for all three fields
  so an untagged path still gets a reasonable label.

## Keep-in-sync field lists (a new per-ramp map must join all of these)

1. Store `buildSnapshot` + `applySnapshotFields` (`src/store/rampsStore.ts`).
2. `SNAPSHOT_FIELDS` (`src/lib/history-snapshot.ts`).
3. `snapshotInputs` dep array (`src/App.tsx`), triggers a history entry.
4. `MAP_FIELDS` + `RampStatePlain` (`src/lib/permute-indexed-state.ts`): the
   reorder permutation. Only the two `Record<number, ...>` maps
   (`rampStyleOverrides`, `rampStyleScalars`) go here; the scalar
   `paletteDefaultStyle` does not (it isn't keyed by ramp index).
5. `RampSnapshot` (`src/lib/snapshot-ramps.ts`) + `workingRenderInputs`
   (`src/App.tsx`): the render pipeline.
6. Saved-palette payload write + validated read
   (`src/hooks/useSavedPalettesActions.ts`, `src/lib/palette.ts`), including
   the legacy `vizStyle`/`gplStyle` to `paletteDefaultStyle` migration.

## Files touched

- `src/lib/style-presets.ts`: `RampStyle`, `RAMP_STYLES`, `resolveActiveStyle`,
  `resolveRampScalars`.
- `src/lib/ramp-pipeline.ts`, `src/lib/snapshot-ramps.ts`: style resolution
  inside `buildRamp` / `buildRampsForSnapshot`.
- `src/store/rampsStore.ts`: the three fields, their setters, snapshot
  read/write.
- `src/lib/history-snapshot.ts`, `src/lib/permute-indexed-state.ts`: history
  labeling + reorder permutation membership.
- `src/App.tsx`: `activeStyleFor`/`rampsActive` wiring via
  `src/hooks/useRampStyleActions.ts`; every consumer switched from the three
  global memos to `rampsActive`; the three retired global selectors
  (`vizStyle`, `rampExportStyle`, `gplStyle`) and their UI removed.
- `src/hooks/useSavedPalettesActions.ts`, `src/lib/palette.ts`: saved-palette
  payload fields + legacy migration.
- `src/hooks/useSavedStylesActions.ts`: new named-style persistence hook.
- `src/components/panels/RampsPanel.tsx`: per-ramp picker, active-only
  display, "compare all three" toggle, custom-tuning sliders, named save/load
  UI.

## Testing

- Characterization: `paletteDefaultStyle='punchy'` + empty overrides implies
  `rampsActive` byte-identical to the old `rampsPunchy` path.
- `resolveActiveStyle` / `resolveRampScalars` unit tests (defaulting,
  override present, custom-with-no-scalars-yet fallback to balanced).
- Store snapshot round-trip (`buildSnapshot`/`applySnapshotFields`) carries all
  three fields; reorder permutes the two `Record<number, ...>` maps and leaves
  `paletteDefaultStyle` untouched.
- Saved-palette read/write round-trips the three fields; a payload missing
  them migrates `vizStyle`/`gplStyle` into `paletteDefaultStyle`.
- `useSavedStylesActions`: save/load/delete round-trip, `SAVED_STYLE_LIMIT`
  enforcement, load-onto-ramp snapshot-copy semantics (later edits to the ramp
  don't mutate the saved entry).
- Manual (`/run`): set ramp #1 to Muted, ramp #2 to Custom (drag Reach);
  confirm the card, Mosaic, Viz, and whole-palette `.gpl` all show per-ramp
  styles; save a named style + load onto ramp #3; reorder ramps and confirm
  styles travel; undo/redo each op; save + reload the palette (styles
  persist); toggle "compare all three"; load a pre-#69 saved palette (maps to
  its old style via the legacy migration).

## Out of scope

- A dedicated named-styles management section/card (compact in-editor UI only,
  per the locked decision).
- Migrating `rampExportStyle`/`gplStyle`/`vizStyle` values themselves anywhere
  other than the one-time `paletteDefaultStyle` migration on load.
- Style presets (`stylePresets`, the Punchy/Balanced/Muted knobs) becoming
  per-ramp; only the ramp's *choice of* style and its custom scalars are
  per-ramp.
