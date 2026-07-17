# Task 7 — Per-ramp custom scalar sliders + auto-switch to Custom

> Read `../README.md` first.

**Depends on:** Task 6 (per-ramp picker + custom-seed logic) + Task 3 (`rampStyleScalars`
setter).
**Scope:** `[UI]` — `RampsPanel.tsx` Adjust Base editor + `App.tsx` handler.

## Context you need

Capability 3 of the issue: editing a ramp's `reach`/`chromaFalloff` must immediately
flip that ramp to **Custom**, leaving the named presets pristine. These are per-ramp
knobs, distinct from the existing global "Style Tuning" block (`RampsPanel.tsx:334-366`),
which tunes what the *named* presets mean and **stays as-is**.

## Changes — `src/components/panels/RampsPanel.tsx`

- In the per-ramp Adjust Base editor (`:469-584`, near the `RampAdvancedPanel` call at
  `:567-581`), add two range sliders — **Reach** and **Chroma falloff** — bound to
  `rampStyleScalars[i]` (0–1, same slider styling as the global Style Tuning sliders at
  `:351-362`).
- The sliders are populated from the ramp's current resolved scalars
  (`resolveRampScalars({ style: activeStyleFor(i), baseIndex: i, stylePresets, rampStyleScalars })`)
  so they show the live value whether the ramp is a preset or already custom.
- On change, call a single handler `setRampScalar(i, key, value)` that:
  1. writes `rampStyleScalars[i] = { ...current, [key]: value }`, and
  2. sets `rampStyleOverrides[i] = 'custom'` (the auto-switch),
  3. wrapped in `tagNextLabel('Customize ramp style')`.
- Only show these sliders when the ramp's active style is `'custom'`, OR always show
  them and let the first edit trigger the switch — **pick "always show"** so the user
  can start customizing from any preset in one gesture (that is the auto-switch UX the
  issue asks for). Label the group "Custom tuning (switches this ramp to Custom)".

## Changes — `src/App.tsx`
- Add `setRampScalar(i, key, value)` (updates `rampStyleScalars` + sets the override to
  `'custom'`); pass it to `RampsPanel`.

## Tests — `tests/unit/RampsPanel.spec.tsx`
- Dragging Reach/Chroma on a Punchy ramp calls the handler and the ramp's picker
  reflects `'custom'`.
- The global Style Tuning block is untouched (still present, still writes
  `stylePresets`).

## Acceptance criteria

- Editing a preset ramp's Reach/Chroma flips it to Custom without altering the global
  preset definitions; other ramps on that preset are unaffected. Undo restores both the
  scalar and the previous style. `npm test` + `npm run test:e2e` green; type gate clean.

## Suggested commit

```
feat(ramps): per-ramp custom reach/chroma sliders with auto-switch to Custom (#69)

Editing a ramp's reach/chromaFalloff writes rampStyleScalars[i] and flips that
ramp to Custom, leaving the named presets pristine.
```
