# SP2 Phase b: State Slicing (Ramps Domain) Design

Status: approved, ready for implementation plan.
Parent: `docs/architecture-rebuild-roadmap.md` (SP2 phase b).

## Problem

`App.tsx` (`PixelPalGenerator`, ~5100 lines) holds hot editing state in one flat
block (mostly via `usePaletteState()`, plus a handful of locals). Any state change
re-renders panels that don't depend on it. Phase a (merged, PR #102) memoized
`HistoryPanel` + `PlaygroundPanel`, proving the memo pattern works but only
covering 2 of 7 panels. The other 5 (`SavedPalettesPanel`, `ExportPanel`,
`HarmonyPanel`, `RampsPanel`, `VizComparePanel`) have no `React.memo` at all and
re-render unconditionally on every interaction.

## Decision: Zustand

Chosen over extending the existing Context layer (Theme/Layout/Palette/Editor,
from Tier C) and over Jotai. Rationale:
- The problem shape is "one centralized blob → domain slices with surgical
  subscriptions," which Zustand's selector-based `useStore(s => s.field)` maps to
  directly. Context requires hand-splitting into many small contexts to get
  equivalent granularity, which is easy to under-split.
- Jotai's atom-per-field model fits flat independent state poorly here; ramps
  state is nested (per-ramp arrays/records), which would need atom families and
  adds complexity without benefit over Zustand.
- Small footprint (~1KB gzip), strong TS support, incremental migration (can move
  one domain's `useState` calls into the store while leaving the rest of
  `App.tsx` untouched).

**Guardrail carried over from the roadmap: stay React/TS. No persist middleware.**
`usePaletteState`'s save/load path plus the Tauri plugin-store/localStorage shim
already own persistence; the store holds only in-memory hot state.

## Separability finding (pre-spec verification)

Traced via Explore agent before committing to this design (see conversation,
2026-06-30). Ramps/editor state (26 fields, currently in `src/hooks/usePaletteState.ts`)
is **cleanly separable at the storage level**: it's already isolated in one hook,
and downstream consumers (`buildRamp` in `lib/ramp-pipeline.ts`,
`buildRampsForSnapshot` in `lib/snapshot-ramps.ts`) take plain `RampSnapshot`
objects, not live state: store-migration-friendly.

It is **tangled at the handler/effect level** in `App.tsx`. Five sites mix ramps
setters with non-ramps setters in the same function body and must be rewired, not
just left calling `usePaletteState()`:
1. `saveCurrentPalette` (~2360-2415): ramps fields + `gplStyle`/`vizStyle`/
   `spriteKey`/`customSprites`/`advancedOpen` + saved-palette setters.
2. `loadPalette` (~2428-2650): inverse of #1.
3. `useEffect` keyed on `[baseColors.length]` (~1907-1924): sets `sbsOpen`
   (panel-layout domain) alongside `collapsedRamps`/`harmonizeBaseline` (ramps).
4. Harmonize handler (~1680-1710): reads/writes ramps state, calls
   `tagNextLabel` (history domain) and `setExportFeedback` (export domain) inline.
5. Ramp-reorder `onDrop` (~4087-4099): `reorderRamps()` + `setGamutPerRamp`
   (ramps) + `tagNextLabel` (history) inline.

`liveRampSnapshot` (~522-537) and `buildWorkingSnapshot` (~2125-2145), the #62
mirror pair, are both currently clean: 13-14 matching ramps-only fields, no
foreign-domain leakage. The store migration is exactly the kind of change that
could desync them (per the project's mirror/round-trip review lens), so this is
flagged as a required check, not optional.

`useHistory`'s snapshot watcher consumes ramps state only via injected
`buildSnapshot`/`applySnapshotFields` callbacks, a clean adapter boundary already;
the store migration must keep those callbacks pointed at the new source.

## Baseline measurement (pre-spec verification)

Using the phase-a `renderCount` harness: rendered `<App>`, expanded History,
opened a ramp's base-color editor, reset counts, then fired one `hue` slider
change. Result: `HistoryPanel` → 0 renders (memo holding), `PlaygroundPanel` → 1
render (legitimate: it previews live ramp colors, not excess).

The real excess-render problem is structural, not something this baseline needed
to prove further: `SavedPalettesPanel`/`ExportPanel`/`HarmonyPanel`/`RampsPanel`/
`VizComparePanel` have no `React.memo` wrapper at all, so they unconditionally
re-render on **every** state change in `App.tsx`, ramps-related or not. Phase b's
new test (below) targets this directly.

## Scope: first PR (thin vertical slice)

1. **Move `usePaletteState`'s ~26 fields into a Zustand store slice.** Field names
   and the hook's public shape (`buildSnapshot`, `applySnapshotFields`,
   `resetTransientEditors`, `reorderRamps`) stay the same where possible, to
   minimize churn at call sites.
2. **Rewire the 5 tangled handler sites** in `App.tsx` so ramps-domain reads/
   writes go through the store while non-ramps setters stay exactly as they are
   today (still local `useState` / other hooks). Do not migrate export/viz/
   sprite/panel-layout/saved-palette state in this PR.
3. **Wrap `RampsPanel` + `HarmonyPanel` in `React.memo`** now that their state
   source is a stable store reference. (`SavedPalettesPanel`/`ExportPanel`/
   `VizComparePanel` memoization is a follow-up phase-b PR once their own state
   deps are similarly untangled, out of scope here.)
4. **Context coexistence**: wrap the store in the existing `PaletteContext` so
   current consumers (e.g. `usePalette()` in `HistoryPanel`) don't need call-site
   changes this PR. Whether to cut consumers over to direct store hooks and retire
   `PaletteContext` is a later, explicit decision, not assumed here.
5. **#62 check**: after the migration, diff `liveRampSnapshot` and
   `buildWorkingSnapshot` field-by-field against their pre-migration field lists.
   Confirm no drift introduced.
6. **Test**: extend `tests/unit/render-isolation.spec.tsx` with a case proving a
   ramps-domain edit (e.g. hue change) does not re-render `SavedPalettesPanel`/
   `ExportPanel` (once memoized) or otherwise leak into unrelated panels.

## Out of scope (deferred to later phase-b PRs or phase c/d)

- Migrating export/viz/sprite/panel-layout/saved-palette state into the store.
- Memoizing `SavedPalettesPanel`/`ExportPanel`/`VizComparePanel`.
- Retiring `PaletteContext` / cutting consumers to direct store hooks.
- Trunk JSX extraction (phase c) and dropping `@ts-nocheck` (phase d).

## Verification

- `npm run build` + `npm test` + `npm run lint:hooks` + e2e (desktop + web).
- `npm run deadcode` (confirm no orphaned exports from the hook migration).
- Manual: confirm ramp editing, harmonize, save/load, and undo/redo all still work
  (these are exactly the handler sites being rewired).
