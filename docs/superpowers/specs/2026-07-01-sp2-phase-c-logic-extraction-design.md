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
- **Ramp core (row 3):** the 291-1665 line range is not one domain. Grepped function list
  shows tour setup (671-737), pixel-picker (738-801), and image-import (582-670) interleaved
  inside it, on top of the already-flagged harmony/compare tangle. Only the pure helper
  cluster (~291-485: `shadeLabelsFor`/`labelsForRamp`/`applyOverrides`/`filterHidden`/
  `resolveBaseForRamp`/`resolveSizeForRamp`/`resolveHueShiftForRamp`/`generateRamp`) is
  actually clean; the ramp-editing handlers (pin/override/shuffle/lock/reset, 1355-1665) are
  not verified clean and are pulled from this spec's scope pending their own dig.
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

The roadmap originally scoped phase c as "extract the trunk": break the ~4211-line
JSX `return` block into layout sub-components. A structural dig (2026-06-30/07-01)
found that estimate stale: `App.tsx`'s `PixelPalGenerator` function spans lines
120-5106 (~4986 lines), and the JSX `return` is only ~970 lines (4136-5106),
already delegating to the 7 Tier C panels wrapped in `SectionCard`.

The real remaining bulk is the **logic section**, lines 120-4135 (~4016 lines):
~85 top-level handler/helper functions plus a ~350-line inline `themeTokens` data
object. Tier A/B ("leaf-extraction largely complete") did not cover this as
thoroughly as documented: most of it is still inline in `App.tsx`.

## Findings (domain breakdown)

A read-only investigation (Serena `get_symbols_overview`/`find_symbol` for typed
files, Grep for structural mapping since this one giant function defeats
LSP-symbol granularity) categorized the logic block:

| Domain | Lines | ~Count | Verdict |
|---|---|---|---|
| `themeTokens` static data | 3588-3937 | ~350 | clean-extract, confirmed zero closures over state (grepped for `theme[`/`=>`/`useMemo`/`useState`/`props.`/`baseColors`/`setBase`, zero matches) |
| Export (clipboard/PNG/GPL/PAL/ASE) | 3089-3588 | ~500 | clean-extract, mostly pure formatting reading ramp arrays as params |
| Ramp core (generate/pins/overrides/shuffle) | 291-1665 | ~600 | mostly clean-extract, thin wrappers around already-extracted `ramp-engine.ts`/`buildRamp` |
| Sprite import | 1766-1887 | ~120 | clean-extract, self-contained drag/drop + state |
| Image remap preview (state+handlers) | 228-1115 | ~890 | clean-extract → hook, self-contained around `imageRef`/remap canvas state, only reads `baseColors` as input |
| Harmony/compare | 1155-1766 (interleaved) | ~200 | **tangled, out of scope**: `harmonize` mixes ramps state, history (`tagNextLabel`), export-feedback UI, and compare-mode state in one closure |
| Saved-palette CRUD (save/load/rename/delete) | 1941-3089 | ~1150 | **tangled, out of scope, worst offender**: `saveCurrentPalette`/`loadPalette` serialize ~20 fields spanning ramps + panel-layout + style-presets + export-UI state in one payload |
| Hardware-lock bake | 2798-2985 | ~190 | **out of scope, undug**: likely tangled, needs its own investigation before any extraction attempt |
| Theme/accent/drag-handle helpers + context-value memos | 3937-4135 | ~200 | mixed: color-math helpers extractable, `themeValue`/`layoutValue`/`paletteValue`/`editorValue` memo construction stays (composition-root wiring, not a leaf) |

Two duplicate-of-already-extracted helpers found in passing, unrelated to this
design: `slugify` (App.tsx:1953 duplicates `lib/palette.ts:62`) and `isTauri`
(App.tsx has its own inline check duplicating `lib/env.ts:15`). Free, zero-risk
import-swaps; folded into slice 1 below rather than a separate PR, since they're
trivial and touch no design decisions.

## Decision: 3-slice sequence, thin vertical slices (same pattern as phase b)

Each slice is its own small PR: move one domain to `lib/` (pure functions) or
`hooks/` (stateful), update `App.tsx` call sites in the same PR, zero behavior
change. Order chosen for ascending risk/coupling, so the pattern is validated on
the safest slice first:

1. **`themeTokens` → `lib/theme.ts`.** Pure data literal, ~350 lines,
   line-verified zero state closures. Fold in the `slugify` duplicate-import
   fix here (unrelated but trivial, touches App.tsx imports in the same PR
   anyway; the spec's original `isTauri` duplicate claim was checked and does
   not exist, dropped).
2. **Export → `lib/export.ts` + a thin `useExport` hook.** Verified: every
   export handler (`copyHex`, `buildPaletteText`, `exportPalette`,
   `exportLightnessPng`, `exportMosaicPng`, `exportMatrixPng`,
   `exportDitherPng`, `copyPaletteToClipboard`, `collectPaletteEntries`,
   `buildPaletteGpl`, `exportPaletteGpl`, `exportPalettePal`,
   `exportPaletteAse`, `exportPaletteStripPng`, `exportActiveFormat`,
   `revealLastSaved`, `_selectRampsForStyle`, `_filteredRamp`,
   `buildSingleRampText`, `buildSingleRampGpl`, `copyRampToClipboard`,
   `downloadSingleRampGpl`; App.tsx:3089-3585) calls
   `setExportFeedback`/`setCopiedHex`/`setLastSavedPath`/
   `setSessionRampGplFolder`, all already owned by `useExportSettings()`
   (Tier B). The hook takes the read-only ramp/palette values it needs as
   params (`baseColors`, `aiColorNames`, `rampsPunchy`/`rampsBalanced`/
   `rampsMuted`, `harmony`, `resolveBaseForRamp`, `labelsForRamp`,
   `filterHidden`, `buildRampsForSnapshot`, plus the `useExportSettings()`
   values/setters) and returns the handler functions.
3. **Ramp pure-helper cluster → `lib/ramp-helpers.ts`.** Narrowed from the
   original "ramp core" domain after finding tour/pixel-picker/image-import
   handlers interleaved in the same line range. Only the verified-pure
   cluster moves: `shadeLabelsFor`, `labelsForRamp`, `applyOverrides`,
   `filterHidden`, `resolveBaseForRamp`, `resolveSizeForRamp`,
   `resolveHueShiftForRamp`, `generateRamp` (App.tsx:291-521). These take
   ramp/base/style values as params and return computed data, no state
   closures. `generateRamp` wraps the already-extracted
   `generateRamp as generateRampNew` from `lib/ramp-engine.ts` (App.tsx:8);
   confirm the wrap is a thin pass-through when moving, not a second
   implementation.

## Dropped from mechanical scope (design questions, not clean-extract)

- **Ramp-editing handlers** (pin/override/shuffle/lock/reset/duplicate/remove,
  App.tsx ~1116-1665, minus the harmony/compare portion already flagged
  tangled): not verified clean, closures span ramps state, history
  (`tagNextLabel`), and highlight/scroll timers. Needs its own dig before a
  future slice.
- **Sprite import handlers** (`handleSpriteFile`, `handleSpriteDragOver/Leave/
  Drop`, `importSprite`, `removeCustomSprite`, `copySpriteSource`, App.tsx
  1766-1839): `hooks/useSpriteImport.ts` already exists and already owns all
  state for this domain (Tier B). Its own doc comment states handlers stay in
  App.tsx because they "reach into the export-feedback domain." Moving them
  now reverses a documented Tier-B decision and requires deciding whether the
  hook takes `setExportFeedback` as an injected param, that is a design
  decision for a future brainstorm, not a mechanical task here.
- **Image remap handlers** (`getActiveRemapPalette`, `buildRemapSignature`,
  `handleRemapImageUpload`, `clearRemapImage`, `refreshRemap`, `downloadRemap`,
  App.tsx ~802-1114): same situation. `hooks/useImageRemap.ts` already exists
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
