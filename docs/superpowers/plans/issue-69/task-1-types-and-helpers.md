# Task 1 — Types + pure resolution helpers

**Status: ✅ Done.** `RampStyle`/`RAMP_STYLES`/`resolveActiveStyle`/`resolveRampScalars`
added to `src/lib/style-presets.ts`; tests added to `tests/unit/style-presets.spec.ts`.

> Read `../README.md` first. This is Wave A (no prerequisites) — safe to start immediately.

**Depends on:** nothing.
**Scope:** `[lib, isolated]` — one small file + one new test file. TDD.

## Context you need

We are making ramp "style" a per-ramp property. This task adds the shared type and the
two pure resolution helpers every later task builds on. No state, no UI yet.

- `RampStyle = 'punchy' | 'balanced' | 'muted' | 'custom'`.
- Per-ramp active style = `rampStyleOverrides[i] ?? paletteDefaultStyle`.
- Per-ramp scalars: a `'custom'` ramp reads `{reach, chromaFalloff}` from
  `rampStyleScalars[i]`; a named-preset ramp reads `styleToScalars(style, stylePresets)`.

Existing exports in `src/lib/style-presets.ts` to reuse: `StyleScalars`
(`{reach, chromaFalloff}`), `StylePresets` (`Record<string, StyleScalars>`),
`DEFAULT_STYLE_PRESETS`, `styleToScalars(style, presets)`.

## Changes — `src/lib/style-presets.ts`

Add (do not modify the existing exports):

```ts
export type RampStyle = 'punchy' | 'balanced' | 'muted' | 'custom';

export const RAMP_STYLES: RampStyle[] = ['punchy', 'balanced', 'muted', 'custom'];

/** Resolve a ramp's active style: its override, else the palette default. */
export const resolveActiveStyle = (
  overrides: Record<number, RampStyle> | null | undefined,
  baseIndex: number,
  defaultStyle: RampStyle,
): RampStyle => {
  const o = overrides && (overrides[baseIndex] ?? overrides[String(baseIndex) as any]);
  return o ?? defaultStyle;
};

/** Resolve the {reach, chromaFalloff} a ramp renders at, honoring 'custom'. */
export const resolveRampScalars = (args: {
  style: RampStyle;
  baseIndex: number;
  stylePresets: StylePresets | null;
  rampStyleScalars: Record<number, StyleScalars> | null | undefined;
}): StyleScalars => {
  const { style, baseIndex, stylePresets, rampStyleScalars } = args;
  if (style === 'custom') {
    const s = rampStyleScalars && (rampStyleScalars[baseIndex] ?? rampStyleScalars[String(baseIndex) as any]);
    if (s && typeof s.reach === 'number' && typeof s.chromaFalloff === 'number') {
      return { reach: s.reach, chromaFalloff: s.chromaFalloff };
    }
    // No custom scalars yet → fall back to the balanced preset scalars.
    return styleToScalars('balanced', stylePresets);
  }
  return styleToScalars(style, stylePresets);
};
```

Notes:
- Accept both numeric and string keys in the maps (the codebase stores some
  index-keyed maps with string keys after JSON round-trips; being tolerant here avoids
  surprises for callers). Keep it non-throwing, mirroring `styleToScalars`'s
  layered-fallback style.

## Tests — new `tests/unit/style-presets.spec.ts`

Cover:
- `resolveActiveStyle`: override present (returns it), override absent (returns
  default), string-keyed override, empty/null map.
- `resolveRampScalars`: builtin style delegates to `styleToScalars`; `'custom'` with
  scalars present returns them; `'custom'` with no scalars returns the `balanced`
  preset scalars; respects a non-default `stylePresets`.

## Acceptance criteria

- `npm test tests/unit/style-presets.spec.ts` passes.
- No change to existing `style-presets.ts` exports (grep confirms `styleToScalars`,
  `DEFAULT_STYLE_PRESETS`, `StyleScalars` unchanged).
- `tsc --noEmit` clean for the file (it is fully typed, no `@ts-nocheck`).

## Suggested commit

```
feat(style): add RampStyle type and per-ramp style resolution helpers (#69)

Adds resolveActiveStyle + resolveRampScalars in style-presets.ts, the pure
foundation for per-ramp active styles. No behavior change yet.
```
