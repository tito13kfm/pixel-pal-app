# Task 8 — Named save/load of custom ramp styles

**Status: Done.** Added `src/hooks/useSavedStylesActions.ts` (storage namespace
`styles:{slug}`, payload `{ name, savedAt, reach, chromaFalloff }`), mirroring
`useSavedPalettesActions` but owning its own `savedStyles` list internally (a plain
`useState`, refreshed on mount) rather than taking one from App.tsx, since nothing
else needs to coordinate on it. `loadStyleOntoRamp` writes `rampStyleScalars[i]` and
`rampStyleOverrides[i] = 'custom'` directly through the raw store setters (not the
App-level `setRampStyleOverride` wrapper) so the stamped scalars can't get clobbered
by that wrapper's "seed from current value if undefined" branch. Wired into
`RampsPanel.tsx`'s Custom tuning group in the Adjust Base editor: a load `<select>` +
Load/Delete buttons, and a name input + Save button beneath the Reach/Falloff sliders.
`App.tsx` instantiates the hook next to `useRampStyleActions` and threads the four
values through to `RampsPanel`.

Test: `tests/unit/useSavedStylesActions.spec.ts` round-trips save (two styles, mocked
`Date.now` for a deterministic order) -> refresh (newest first) -> loadOntoRamp (stamps
scalars + sets 'custom', tags the history label) -> delete (removes one), plus an
empty-name-rejected case. `RampsPanel.spec.tsx`'s prop fixture got the four new
required props (`savedStyles: []`, no-op actions).

`npm test` (602/602), the type gate (55 App.tsx errors with `@ts-nocheck` stripped,
unchanged from the pre-task-8 baseline, confirmed by diffing against HEAD before this
task's commit), and `npm run build` are all clean. `npm run deadcode:ci` reports 0 new
(no forward-referenced exports needed here). `npm run test:e2e` could not run in this
sandbox (pinned Playwright browser revision mismatch, a known sandbox-only issue per
the task handoff notes, not a signal on this change); did a static read-through of
`tests/e2e/*.spec.ts` instead; none reference the per-ramp style picker, the
Reach/Falloff sliders, or button/title text overlapping the new Load/Save/Delete
controls, so nothing here appears to regress the existing e2e suite. Real CI's e2e run
is the actual gate for this task's UI surface.

> Read `../README.md` first.

**Depends on:** Task 7 (per-ramp custom slot) + Task 3 (`rampStyleScalars` setter).
**Scope:** `[persistence + UI]` — new hook + compact in-editor UI + hook test.

## Context you need

Capability 4: persist user-defined `{reach, chromaFalloff}` looks by name and apply
them to any ramp. Model this on the saved-palettes machinery, but far simpler (two
numbers + a name). Loading a named style **stamps a copy** into `rampStyleScalars[i]`
and sets that ramp to `'custom'` (snapshot-copy semantics — later edits to the ramp do
not mutate the saved style, and vice versa).

## Changes — new `src/hooks/useSavedStylesActions.ts` (+ light state bag)

Mirror `src/hooks/useSavedPalettesActions.ts` at small scale:
- Storage namespace `styles:{slug}`; payload `{ name, savedAt, reach, chromaFalloff }`.
- `refreshSavedStyles()` — `window.storage.list('styles:')` → parse → sort by
  `savedAt` desc into an in-memory `{ slug, name, reach, chromaFalloff }[]`.
- `saveStyle(name, scalars)` — slug via existing `slugify`; enforce a limit (e.g. 100
  like palettes); `window.storage.set`.
- `loadStyleOntoRamp(slug, i)` — read payload, then `setRampStyleScalars` to stamp
  `{reach, chromaFalloff}` at `[i]` and `setRampStyleOverride(i, 'custom')`; wrap in
  `tagNextLabel('Load ramp style')`.
- `deleteStyle(slug)` — `window.storage.delete`.
- Guard every call on `window.storage` (the shim, `src/App.tsx:66-93`).

## Changes — compact in-editor UI (in `RampsPanel.tsx`, beside the Task 7 sliders)

- A **load `<select>`** (pattern at `SavedPalettesPanel.tsx:242-251`) listing saved
  styles by name; onChange → `loadStyleOntoRamp(slug, i)`.
- A **name input + Save button** that calls `saveStyle(name, rampStyleScalars[i] ?? resolvedScalars)`
  to persist the ramp's current custom scalars.
- (Optional) a small delete affordance per saved entry; keep it minimal — the issue
  specified *compact in-editor*, not a full list card.

## Wiring — `src/App.tsx`
- Instantiate `useSavedStylesActions`, refresh on mount (mirror saved-palettes),
  thread `savedStyles` + the three actions into `RampsPanel`.

## Tests — `tests/unit/useSavedStylesActions.spec.ts`
- Round-trip against a mocked `window.storage`: save two styles → refresh lists both
  newest-first → loadOntoRamp stamps scalars + sets `'custom'` → delete removes one.

## Acceptance criteria

- Save a ramp's custom look as "Sunset", switch another ramp to it via the dropdown →
  that ramp becomes Custom with Sunset's scalars; editing it afterward does not change
  the saved "Sunset"; entries survive reload. `npm test` + `npm run test:e2e` green;
  type gate clean; `npm run deadcode` clean.

## Suggested commit

```
feat(styles): named save/load of custom ramp styles (#69)

Adds useSavedStylesActions (styles:{slug} localStorage) plus a compact in-editor
load/save UI; loading stamps scalars onto a ramp and switches it to Custom.
```
