# Task 7 — Per-ramp custom scalar sliders + auto-switch to Custom

**Status: Done.** The Adjust Base editor now always shows a "Custom tuning (switches
this ramp to Custom)" group with Reach/Falloff sliders (0-100%, yellow accent to match
the rest of the editor), populated via `resolveRampScalars` so they read the ramp's
live value whether it's on a preset or already Custom. A new `setRampScalar(i, key,
value)` writes `rampStyleScalars[i]` (seeding from the ramp's currently resolved
scalars so the untouched key keeps its live value, same seeding logic as
`setRampStyleOverride`) and sets `rampStyleOverrides[i] = 'custom'`; `RampsPanel.tsx`'s
onChange handlers call `tagNextLabel('Customize ramp style')` right before invoking it,
matching the existing convention (tag in the panel, not the setter). The global Style
Tuning block (`stylePresets`) is untouched, confirmed by a dedicated test. Renamed the
falloff row's label to "Falloff" (not "Chroma") to avoid colliding with the OKLCH
editor's existing "Chroma" slider label in `getByText` queries.

While this was in flight, a concurrent commit (`87543fa`) landed on the branch that
extracted `activeStyleFor`/`rampsActive`/`setRampStyleOverride` out of `App.tsx` into a
new typed `src/hooks/useRampStyleActions.ts`, to claw `App.tsx` back under the #113
1350-line ratchet after Task 6. Rebasing onto it applied cleanly, but `setRampScalar`
initially landed back inline in `App.tsx` (1361 lines, over budget) and called
`resolveRampScalars`, which that commit had removed from `App.tsx`'s imports. Moved
`setRampScalar` into `useRampStyleActions.ts` alongside its sibling `setRampStyleOverride`
instead (same seeding pattern, same dependency list shape); `App.tsx` now just
destructures it from the hook. Final size: 1344 lines.

`npm test` (600 tests, up from 596), the type gate (`tsc --noEmit` on a de-`@ts-nocheck`d
copy of `App.tsx`: diagnostic-only error count is 55, down from the pre-rebase baseline
of 58, since the extraction commit moved several previously-untyped handlers into the
typed hook file; `setRampScalar` living there too means it added zero new `App.tsx`
errors), `npm run build`, and `npm run deadcode:ci` (0 new) all green. `npm run test:e2e`
could not be run in this
sandbox: the pre-installed Playwright Chromium (rev 1194) doesn't match the pinned
`@playwright/test` 1.60.0's expected browser revision (1223), a pre-existing environment
mismatch, not a signal about this change. Static review of `tests/e2e/*.ts` found no
spec referencing the Adjust Base editor, Style Tuning, or any Reach/Chroma/Falloff
control, so nothing there depends on this change; real CI's fresh Playwright install
will be the actual e2e gate.

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
