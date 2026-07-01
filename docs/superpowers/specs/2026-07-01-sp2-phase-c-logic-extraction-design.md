# SP2 Phase c: Logic Extraction (lib/hooks) Design

Status: approved for slice 1; slices 2-5 re-scoped 2026-07-01 (see "Second correction" below)
after per-function verification found the domain-breakdown table imprecise. Ready for
implementation plan on the reduced scope.
Parent: `docs/architecture-rebuild-roadmap.md` (SP2 phase c, corrected 2026-07-01).

## Second correction (2026-07-01, pre-plan verification)

Writing the implementation plan required pulling every function's actual body and closure
list (grep, not just line-count estimates). Three of the five findings-table rows turned out
wrong:

- **Export (row 2):** not "pure formatting reading params." Every handler calls
  `setExportFeedback`/`setCopiedHex`/`setLastSavedPath`/`setSessionRampGplFolder`. Those setters
  already live in `useExportSettings` (Tier B), so this is a `useExport` **hook** wrapping
  existing state, not a pure `lib/export.ts` module. Still clean, just a different shape than
  planned.
- **Ramp core (row 3):** the original range (from `shadeLabelsFor` down through the
  ramp-lock toggles) is not one domain. Grepped function list shows tour setup
  (`runTourSetup`/`startTour`/`exitTour`), pixel-picker (`getPixelColorFromImage`/
  `handleImageHover`), and image-import (`handleImageUpload`/`reExtractFromImage`)
  interleaved inside it, on top of the already-flagged harmony/compare tangle. Only the
  pure helper cluster (`shadeLabelsFor`/`labelsForRamp`/`applyOverrides`/`filterHidden`/
  `resolveBaseForRamp`/`resolveSizeForRamp`/`resolveHueShiftForRamp`/`generateRamp`,
  the block right after the `useState`/`useRef` declarations, ending at `liveRampSnapshot`)
  is actually clean; the ramp-editing handlers (pin/override/shuffle/lock/reset, from
  `removeRamp` through `toggleRampLock`) are not verified clean and are pulled from this
  spec's scope pending their own dig.
- **Sprite import (row 4) and image remap (row 5):** both `hooks/useSpriteImport.ts` and
  `hooks/useImageRemap.ts` already exist (Tier B), already hold all the domain's *state*. Each
  file's own doc comment states its handlers deliberately stay in App.tsx: remap because they
  "read the live working palette + canvas refs," sprite because they "reach into the
  export-feedback domain." Moving the handlers into the hooks now would reverse a documented
  Tier-B decision, not perform a mechanical extraction, that's a design call (does the hook
  take the ramp-computation surface as injected params, or does the wiring stay in App.tsx),
  not a bite-sized clean-extract task. Pulled from this spec's mechanical scope.

Slices 4 and 5 as originally specified are dropped. Slice 3 is narrowed to the verified-pure
helper cluster only. See the revised Decision section below.

## Problem

The roadmap originally scoped phase c as "extract the trunk": break the JSX
`return` block into layout sub-components. A structural dig (2026-06-30/07-01)
found that stale: `App.tsx`'s `PixelPalGenerator` function is one giant
component, and the JSX `return` block (the final ~1/5 of the file, already
delegating to the 7 Tier C panels wrapped in `SectionCard`) is far smaller
than the logic section above it.

The real remaining bulk is the **logic section** (everything in
`PixelPalGenerator` above the `return`): ~85 top-level handler/helper
functions plus a large inline `themeTokens` data object. Tier A/B
("leaf-extraction largely complete") did not cover this as thoroughly as
documented: most of it is still inline in `App.tsx`.

Note on locators: this spec identifies code by function/const name, not line
number. `App.tsx` changes on nearly every commit; a line number is stale by
the time a slice actually executes. Locate everything below with
`grep -n '<name>' src/App.tsx` at execution time, not by trusting a number
written here.

## Findings (domain breakdown)

A read-only investigation (Serena `get_symbols_overview`/`find_symbol` for typed
files, Grep for structural mapping since this one giant function defeats
LSP-symbol granularity) categorized the logic block:

| Domain | Anchor functions | Verdict |
|---|---|---|
| `themeTokens` static data | the `themeTokens` const (dark/neutral/light keys), immediately before the `const t = useMemo(...)` line | clean-extract, confirmed zero closures over state (grepped for `theme[`/`=>`/`useMemo`/`useState`/`props.`/`baseColors`/`setBase`, zero matches) |
| Export (clipboard/PNG/GPL/PAL/ASE) | `copyHex` through `downloadSingleRampGpl`, ending right before `themeTokens` | clean-extract as a hook, calls already-Tier-B-owned setters (see Second correction) |
| Ramp core (generate/pins/overrides/shuffle) | `shadeLabelsFor` through `generateRamp`/`liveRampSnapshot` | narrowed, see Second correction: only the pure-helper prefix is clean |
| Sprite import | `handleSpriteFile` through `copySpriteSource` | state already owned by `hooks/useSpriteImport.ts`; handlers blocked, see Second correction |
| Image remap preview (state+handlers) | `getActiveRemapPalette` through `downloadRemap` | state already owned by `hooks/useImageRemap.ts`; handlers blocked, see Second correction |
| Harmony/compare | `addHarmonyColor`/`addHarmonyPair`/`addHarmonyMany`/`harmonize`/`restoreHarmonizeBaseline`, interleaved with ramp-editing handlers | **tangled, out of scope**: `harmonize` mixes ramps state, history (`tagNextLabel`), export-feedback UI, and compare-mode state in one closure |
| Saved-palette CRUD (save/load/rename/delete) | `saveCurrentPalette`/`loadPalette` | **tangled, out of scope, worst offender**: serializes ~20 fields spanning ramps + panel-layout + style-presets + export-UI state in one payload |
| Hardware-lock bake | the hardware-lock quantize/bake handler(s) near the saved-palette CRUD cluster | **out of scope, undug**: likely tangled, needs its own investigation before any extraction attempt |
| Theme/accent/drag-handle helpers + context-value memos | helpers between `themeTokens` and the JSX `return` | mixed: color-math helpers extractable, `themeValue`/`layoutValue`/`paletteValue`/`editorValue` memo construction stays (composition-root wiring, not a leaf) |

One duplicate-of-already-extracted helper found in passing, unrelated to this
design: `slugify` (App.tsx local const duplicates the exported `slugify` in
`lib/palette.ts`). Free, zero-risk import-swap; folded into slice 1 below
rather than a separate PR, since it's trivial and touches no design decisions.
(A second suspected duplicate, an inline `isTauri` check, was checked and does
not exist in App.tsx; dropped.)

## Decision: 3-slice sequence, thin vertical slices (same pattern as phase b)

Each slice is its own small PR: move one domain to `lib/` (pure functions) or
`hooks/` (stateful), update `App.tsx` call sites in the same PR, zero behavior
change. Order chosen for ascending risk/coupling, so the pattern is validated on
the safest slice first:

1. **`themeTokens` → `lib/theme.ts`.** Pure data literal, verified zero state
   closures. Fold in the `slugify` duplicate-import fix here (unrelated but
   trivial, touches App.tsx imports in the same PR anyway).
2. **Export → `lib/export.ts` + a thin `useExport` hook.** Verified: every
   export handler (`copyHex`, `buildPaletteText`, `exportPalette`,
   `exportLightnessPng`, `exportMosaicPng`, `exportMatrixPng`,
   `exportDitherPng`, `copyPaletteToClipboard`, `collectPaletteEntries`,
   `buildPaletteGpl`, `exportPaletteGpl`, `exportPalettePal`,
   `exportPaletteAse`, `exportPaletteStripPng`, `exportActiveFormat`,
   `revealLastSaved`, `_selectRampsForStyle`, `_filteredRamp`,
   `buildSingleRampText`, `buildSingleRampGpl`, `copyRampToClipboard`,
   `downloadSingleRampGpl`, ending right before `themeTokens`) calls
   `setExportFeedback`/`setCopiedHex`/`setLastSavedPath`/
   `setSessionRampGplFolder`, all already owned by `useExportSettings()`
   (Tier B). The hook takes the read-only ramp/palette values it needs as
   params (`baseColors`, `aiColorNames`, `rampsPunchy`/`rampsBalanced`/
   `rampsMuted`, `harmony`, `resolveBaseForRamp`, `labelsForRamp`,
   `filterHidden`, `buildRampsForSnapshot`, plus the `useExportSettings()`
   values/setters) and returns the handler functions.
3. **Ramp pure-helper cluster → `lib/ramp-helpers.ts`.** Narrowed from the
   original "ramp core" domain after finding tour/pixel-picker/image-import
   handlers interleaved among the same functions. Only the verified-pure
   cluster moves: `shadeLabelsFor`, `labelsForRamp`, `applyOverrides`,
   `filterHidden`, `resolveBaseForRamp`, `resolveSizeForRamp`,
   `resolveHueShiftForRamp`, `generateRamp` (the block starting right after
   the top-of-component `useState`/`useRef` declarations, ending at
   `liveRampSnapshot`). These take ramp/base/style values as params and
   return computed data, no state closures. `generateRamp` wraps the
   already-extracted `generateRamp as generateRampNew` import from
   `lib/ramp-engine.ts`; confirm the wrap is a thin pass-through when
   moving, not a second implementation.

## Dropped from mechanical scope (design questions, not clean-extract)

- **Ramp-editing handlers** (pin/override/shuffle/lock/reset/duplicate/remove:
  `removeRamp` through `toggleRampLock`, minus the harmony/compare portion
  already flagged tangled): not verified clean, closures span ramps state,
  history (`tagNextLabel`), and highlight/scroll timers. Needs its own dig
  before a future slice.
- **Sprite import handlers** (`handleSpriteFile`, `handleSpriteDragOver/Leave/
  Drop`, `importSprite`, `removeCustomSprite`, `copySpriteSource`):
  `hooks/useSpriteImport.ts` already exists and already owns all
  state for this domain (Tier B). Its own doc comment states handlers stay in
  App.tsx because they "reach into the export-feedback domain." Moving them
  now reverses a documented Tier-B decision and requires deciding whether the
  hook takes `setExportFeedback` as an injected param, that is a design
  decision for a future brainstorm, not a mechanical task here.
- **Image remap handlers** (`getActiveRemapPalette`, `buildRemapSignature`,
  `handleRemapImageUpload`, `clearRemapImage`, `refreshRemap`, `downloadRemap`):
  same situation. `hooks/useImageRemap.ts` already exists
  and already owns all state; its doc comment states handlers stay in App.tsx
  because they "read the live working palette + canvas refs." Same
  design-decision blocker as sprite import.

Each slice below was already re-verified with a full-body read (not just the
findings-table line counts) before being written into this spec; the same
caution that caught phase b's tangled handlers applies to any future slice
added to this domain.

## Explicitly out of scope (carried forward, not forgotten)

Harmony/compare (~200 lines), saved-palette CRUD (~1150 lines), and
hardware-lock bake (~190 lines) are tangled cross-domain handlers. They need a
designed boundary (event bus, or explicit multi-hook composition) before
extraction is safe, same category of problem phase b solved for the ramps
domain specifically, that design work is a future phase, not phase c. Do not
attempt mechanical extraction on these three domains under this spec.

## Testing / verification (same gate as phase b)

- `App.tsx` keeps `@ts-nocheck`; grep is the correctness gate, not `tsc`. For
  every moved symbol, grep confirms it appears only as import + call site, never
  a leftover redefinition.
- Per slice: `npm run build` + `npm test` + e2e (desktop + web) + `npm run
  deadcode`.
- `docs/ARCHITECTURE.md` updated in the same PR each slice lands (existing
  project convention for any JSX/logic that moves out of `App.tsx`).
- Branch-per-slice, not one branch for all 3 (small reviewable diffs, matches
  phase b's PR-per-chunk pattern).

## Out of scope for this design doc

- The 3 tangled/blocked domains above (ramp-editing handlers, sprite import
  handlers, image remap handlers).
- Phase d (trunk JSX extraction, ~970 lines, now much smaller than originally
  scoped): separate future design.
- Phase e (`@ts-nocheck` removal).
