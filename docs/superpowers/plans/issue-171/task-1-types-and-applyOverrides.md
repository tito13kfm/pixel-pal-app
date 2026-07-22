# Task 1 — Widen override types + applyOverrides

**Status: not started**

> Read `../README.md` first.

**Depends on:** nothing
**Scope:** `[lib, type-only]`

## Context

`applyOverrides` and `SavedPalettePayload.overrides` define the per-shade pin shape as `{ punchy?: string; balanced?: string; muted?: string }`. Both need `custom?: string`. The `style` param type also needs widening.

## Changes

- **`src/lib/ramp-helpers.ts`:** `:148-160`
  - Change `style` param type from `'punchy' | 'balanced' | 'muted'` to `RampStyle` (import from `../lib/style-presets`).
  - Change per-shade map type from `{ punchy?: string; balanced?: string; muted?: string }` to `{ punchy?: string; balanced?: string; muted?: string; custom?: string }`.

- **`src/lib/palette.ts`:** `:25`
  - Same `custom?: string` addition to `SavedPalettePayload.overrides` per-shade shape.

## Tests

No new tests; existing type-checking and bake tests continue to pass. If `applyOverrides` callers pass `'custom'` it must compile.

## Acceptance criteria

- `npm test` passes
- `npm run build` passes
- `grep 'custom' src/lib/ramp-helpers.ts` shows the new type in the signature
- `grep 'custom' src/lib/palette.ts` shows the new field

## Suggested commit

`fix(types): add custom slot to pin-override schema (#171)`
