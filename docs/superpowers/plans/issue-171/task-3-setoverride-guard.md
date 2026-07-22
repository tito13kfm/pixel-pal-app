# Task 3 — setOverride guard + verification gate

**Status: not started**

> Read `../README.md` first.

**Depends on:** Task 2
**Scope:** `[wiring]`

## Context

`setOverride` in useRampEditing.ts line 389 guards with `if (!['punchy', 'balanced', 'muted'].includes(style)) return;`, preventing manual pinning of custom-style swatches. With the bake fix, custom pins exist in the data — the UI pin editor should also be able to write them.

## Changes

- **`src/hooks/useRampEditing.ts`:** `:389`
  - Widen guard to include `'custom'`: `if (!['punchy', 'balanced', 'muted', 'custom'].includes(style)) return;`

## Tests

No new tests required — the existing `isShadePinned`/`togglePinEditor`/`setOverride` cycle works generically over string keys. Manual verification: pin a custom-style swatch via the pin editor, confirm hex round-trips through serialize/deserialize.

## Acceptance criteria

- `npm test` green
- `npm run build` green  
- `npm run deadcode`: no new noise
- Manual: open pin editor on a custom-style ramp's swatch, set a hex, verify it persists under the `'custom'` key

## Suggested commit

`fix(ui): allow manual pinning of custom-style swatches (#171)`
