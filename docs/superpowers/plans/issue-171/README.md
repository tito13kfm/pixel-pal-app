# Issue #171: Hardware-Lock Bake — custom style

## Problem

`bakeHardwareLock` iterates `['punchy', 'balanced', 'muted']` only. Ramps at `'custom'` style get no pins written. On unlock, those ramps revert to unsnapped hexes silently.

Full RCA in `docs/superpowers/specs/2026-07-21-issue-171-hardware-lock-bake-custom-style.md`.

## Dependency graph

```
Task 1 (types + applyOverrides) ─> Task 2 (bakeHardwareLock loop)
                                    └─> Task 3 (setOverride guard + verification gate)
```

## Data model

Three sites share the per-shade shape `{ punchy?: string; balanced?: string; muted?: string; custom?: string }`:
- `applyOverrides` param type (`ramp-helpers.ts`)
- `SavedPalettePayload.overrides` (`palette.ts`)
- Implicit shape at runtime in the store (`Record<string, unknown>` — no change needed)

## Files touched

| File | Task |
|------|------|
| `src/lib/ramp-helpers.ts` | 1 |
| `src/lib/palette.ts` | 1 |
| `src/hooks/useHardwareLock.ts` | 2 |
| `src/hooks/useRampEditing.ts` | 3 |

## Verification gate

- `npm test` — green
- `npm run build` — green
- `npm run deadcode` — no new false positives
- Manual: bake a custom-style ramp, verify pins written under `'custom'` key, unlock, verify hexes stay snapped
