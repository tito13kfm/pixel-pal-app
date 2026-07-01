# SP2 Phase c: Logic Extraction (lib/hooks) Design

Status: approved, ready for implementation plan.
Parent: `docs/architecture-rebuild-roadmap.md` (SP2 phase c, corrected 2026-07-01).

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

## Decision: 5-slice sequence, thin vertical slices (same pattern as phase b)

Each slice is its own small PR: move one domain to `lib/` (pure functions) or
`hooks/` (stateful), update `App.tsx` call sites in the same PR, zero behavior
change. Order chosen for ascending risk/coupling, so the pattern is validated on
the safest slice first:

1. **`themeTokens` → `lib/theme.ts`.** Pure data literal, ~350 lines. Fold in the
   `slugify`/`isTauri` duplicate-import fixes here (unrelated but trivial,
   touches App.tsx imports in the same PR anyway).
2. **Export → `lib/export.ts`** (+ a thin `useExport` hook only if any function
   turns out to hold local UI-feedback state that can't be a plain param). ~500
   lines, 7 functions, pure formatting/file-write, params-in.
3. **Ramp core → `lib/` pure functions**, extending the phase-b ramps store
   where these are thin wrappers around store setters. ~600 lines. Natural
   continuation of phase b's ramps-domain work.
4. **Sprite import → `hooks/useSpriteImport.ts`.** ~120 lines, small and
   self-contained.
5. **Image remap preview → `hooks/useImageRemap.ts`.** ~890 lines, the largest
   and most involved slice (state + handlers + canvas work); saved for last so
   the extraction pattern is well-proven on smaller slices first.

Each slice must re-verify its "clean" classification with a full-body read
before moving code, not just trust the table above: the same caution that
caught phase b's tangled handlers applies here (a domain that looks clean from
function names alone can still closure over foreign state).

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
- Branch-per-slice, not one branch for all 5 (small reviewable diffs, matches
  phase b's PR-per-chunk pattern).

## Out of scope for this design doc

- The 3 tangled domains (above).
- Phase d (trunk JSX extraction, ~970 lines, now much smaller than originally
  scoped): separate future design.
- Phase e (`@ts-nocheck` removal).
