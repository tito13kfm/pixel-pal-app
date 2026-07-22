# Task 2 — bakeHardwareLock handles custom style

**Status: not started**

> Read `../README.md` first.

**Depends on:** Task 1
**Scope:** `[wiring]`

## Context

`bakeHardwareLock` in useHardwareLock.ts iterates `STYLES = ['punchy', 'balanced', 'muted']`. For ramps whose active style is `'custom'`, no pins are written.

Fix: resolve the effective style per ramp (via `resolveActiveStyle`), same as `buildRamp` does. For ramps at `'custom'`, include `'custom'` in the iteration.

## Changes

- **`src/hooks/useHardwareLock.ts`:** `:85-108`
  - Import `resolveActiveStyle` from `../lib/style-presets` (or access from `snapshot.rampStyleOverrides` / `paletteDefaultStyle`).
  - Within the outer `baseColors` loop, before the `STYLES` inner loop, resolve the effective style for ramp `i`.
  - Define the styles to iterate per-ramp: if `activeStyle === 'custom'`, iterate `['custom']` in addition to the three standard styles (so standard pins still get baked too, which maintains backward compat). Simpler: just add `'custom'` to `STYLES` unconditionally and write a `custom` key for every ramp — but that bloats pins (a `custom` pin written for a ramp that has no custom scalars is dead weight). Better: `STYLES = ['punchy', 'balanced', 'muted']; if (activeStyle === 'custom') STYLES.push('custom')`.

## Tests

Existing bake tests continue to pass. Add at least one assertion for a ramp with `rampStyleOverrides[i] = 'custom'`: after bake, verify pins under the `'custom'` key match snapped values.

## Acceptance criteria

- Bake on a palette with at least one custom-style ramp writes pins under `overrides[i][j]['custom']`.
- Standard ramps unaffected.
- `npm test` green, `npm run build` green.

## Suggested commit

`fix(bake): bake custom-style ramps during hardware-lock bake (#171)`
