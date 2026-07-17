# Task 2 — `buildRamp` custom support + snapshot per-ramp resolution

> Read `../README.md` first.

**Depends on:** Task 1 (`RampStyle`, `resolveActiveStyle`, `resolveRampScalars`).
**Scope:** `[lib, TDD]` — `ramp-pipeline.ts`, `snapshot-ramps.ts`, and their tests.

## Context you need

`buildRamp(snapshot, style, baseIndex)` (`src/lib/ramp-pipeline.ts:26`) is the single
pure function that assembles one ramp. Style enters at exactly two places:
- **line 83:** `const { reach, chromaFalloff } = styleToScalars(style, stylePresets);`
- **line 109:** per-style pin lookup `styleMap[style]` inside `overrides[i][shade]`.

`buildRampsForSnapshot(snapshot, style)` (`src/lib/snapshot-ramps.ts:72`) maps
`buildRamp` over all base colors with one style. We make it resolve style **per ramp**
from the snapshot instead.

## Changes

### `src/lib/ramp-pipeline.ts`
1. Add `rampStyleScalars = {}` to the destructure block (`:27-44`).
2. Replace line 83 with per-ramp custom resolution:
   ```ts
   const { reach, chromaFalloff } = resolveRampScalars({
     style: style as RampStyle,
     baseIndex: i,
     stylePresets,
     rampStyleScalars,
   });
   ```
   Import `resolveRampScalars` (and `RampStyle` type) from `./style-presets`.
3. **Pins:** no change. A `'custom'` ramp's pins live under the `'custom'` key in
   `overrides[i][shade]`, and line 109 already reads `styleMap[style]` — so passing
   `style='custom'` looks up custom pins correctly.

### `src/lib/snapshot-ramps.ts`
1. Add optional fields to the `RampSnapshot` interface (`:52-70`):
   `rampStyleOverrides?: Record<number, RampStyle>;`
   `rampStyleScalars?: Record<number, StyleScalars>;`
   `paletteDefaultStyle?: RampStyle;`
   (import the types from `./style-presets`).
2. Rewrite `buildRampsForSnapshot` (`:72-80`) to resolve per ramp:
   ```ts
   export const buildRampsForSnapshot = (
     snapshot: RampSnapshot | null,
     styleOverride?: string, // optional: forces one style for all ramps (legacy callers)
   ): string[][] => {
     if (!snapshot || !snapshot.baseColors) return [];
     const def = snapshot.paletteDefaultStyle ?? 'punchy';
     return snapshot.baseColors.map((_, i) => {
       const style = styleOverride
         ?? resolveActiveStyle(snapshot.rampStyleOverrides, i, def);
       return buildRamp(snapshot, style, i);
     });
   };
   ```
   Keep the `styleOverride` param so callers not yet migrated (Task 5 removes them)
   still compile, but default behavior is per-ramp.

## Tests

- **`tests/unit/ramp-pipeline-characterization.spec.ts`** — must stay green
  **unchanged**: with no `rampStyleScalars` and default `'punchy'`, output is
  byte-identical. If it fails, the resolution fallback is wrong.
- **Add a custom-scalar case** (in the characterization or a new
  `ramp-pipeline-custom.spec.ts`): build a snapshot with `rampStyleScalars[0]` set to
  distinctive `{reach, chromaFalloff}`, call `buildRamp(snap, 'custom', 0)`, and assert
  it equals `buildRamp` run with those same scalars injected via `stylePresets.custom`
  (or assert it differs from the punchy output and matches an expected hex list).
- **`tests/unit/snapshot-ramps.spec.ts`** — existing calls pass an explicit style; they
  still work via `styleOverride`. Add a case with no style arg + `rampStyleOverrides`
  set per index, asserting each ramp used its own style.
- **`tests/unit/ramp-mirror.spec.ts`** — update the mirror assertion so
  `buildRampsForSnapshot(snap)` equals
  `snap.baseColors.map((_, i) => buildRamp(snap, resolveActiveStyle(...), i))`.

## Acceptance criteria

- Full `npm test` green; characterization test byte-identical.
- `buildRampsForSnapshot(snap)` with per-ramp overrides renders mixed styles.
- `tsc --noEmit` clean for both lib files.

## Suggested commit

```
feat(ramp): resolve style per-ramp in buildRamp/buildRampsForSnapshot (#69)

buildRamp now honors 'custom' via rampStyleScalars; buildRampsForSnapshot
resolves each ramp's active style from the snapshot. Punchy-default output is
byte-identical (characterization test unchanged).
```
