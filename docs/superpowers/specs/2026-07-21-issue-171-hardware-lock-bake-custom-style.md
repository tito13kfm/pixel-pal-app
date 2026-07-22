# Issue #171: Hardware-Lock Bake silently loses snap for custom-style ramps

## Goal

`bakeHardwareLock` must permanently snap every shade, including ramps whose active style is `'custom'`. Currently it iterates only `['punchy', 'balanced', 'muted']` and writes nothing for custom-style ramps; on unlock those ramps revert to unsnapped hexes with no error or feedback.

## Root cause

Three independent gaps — the fix must touch all three:

1. **`applyOverrides` type signature** (`ramp-helpers.ts:148`) accepts only `'punchy' | 'balanced' | 'muted'` — cannot pass `'custom'` as a valid style. Per-shade type also omits `custom?: string`.

2. **`bakeHardwareLock` STYLES loop** (`useHardwareLock.ts:87`) hardcodes `['punchy', 'balanced', 'muted']` — never considers a ramp whose active style is `'custom'`.

3. **`setOverride` gate** (`useRampEditing.ts:389`) explicitly guards `if (!['punchy', 'balanced', 'muted'].includes(style)) return;` — prevents manual pinning of custom-style swatches.

## Data model changes

### Per-shade override map (two type sites)

```
// Before: { punchy?: string; balanced?: string; muted?: string }
// After:  { punchy?: string; balanced?: string; muted?: string; custom?: string }
```

Sites (both readonly/input types; the store itself stays `Record<string, unknown>`):
- `applyOverrides` second param type (ramp-helpers.ts)
- `SavedPalettePayload.overrides` (palette.ts)

### `style` parameter type

`applyOverrides` third param changes from `'punchy' | 'balanced' | 'muted'` to `string` (or `RampStyle`). The function body already reads `styleMap[style]` generically — no runtime change.

## Resolution rules

- `bakeHardwareLock`: for each ramp, resolve its effective style (same as `resolveActiveStyle`). If `'custom'`, bake pins under the `'custom'` key.
- `applyOverrides`: once typed to accept `'custom'`, the call from `buildRamp` already works — `buildRamp` reads `(styleMap as Record<string, unknown>)[style]`.
- `setOverride`: widen the style guard to include `'custom'` so the pin editor can also write custom-style pins manually.

## Interactions

| File | Change |
|------|--------|
| `src/hooks/useHardwareLock.ts` | `bakeHardwareLock`: resolve active style per ramp, include `'custom'` in bake loop |
| `src/lib/ramp-helpers.ts` | `applyOverrides`: add `custom?: string` to per-shade type, widen style param |
| `src/hooks/useRampEditing.ts` | `setOverride`: remove/style-widen the guard (line 389) |
| `src/lib/palette.ts` | `SavedPalettePayload.overrides`: add `custom?: string` |

## Out of scope

- Adding a `'custom'` style tab/button to the UI pin picker (the editor/disclosure already shows `style` as a free string). The pin editor opens per-style automatically; custom pins become writable through the existing togglePinEditor flow once the `setOverride` guard is widened.
- Baking non-custom ramps differently — the loop runs `['punchy', 'balanced', 'muted', 'custom']` but the first three write the same keys they already do.

## Testing

- Existing bake tests verify that baking a locked palette produces correct pins for non-custom ramps; add a case where one ramp has `rampStyleOverrides[i] = 'custom'` with scalars and assert its pins are written under the `'custom'` key.
