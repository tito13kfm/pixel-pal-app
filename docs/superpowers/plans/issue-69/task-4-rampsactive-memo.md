# Task 4 — `rampsActive` memo + snapshot producers

**Status: ✅ Done.** `App.tsx` now has `activeStyleFor` + the `rampsActive` memo
(defaults to `rampsPunchy` output since no consumer or override exists yet).
`buildWorkingSnapshot` carries the new fields via `workingRenderInputs`;
`buildClassicSnapshot` defaults them to punchy/empty. `npm test` (594 tests),
type gate, and `npm run build` all green; `npm run deadcode:ci` reports 0 new.

> Read `../README.md` first.

**Depends on:** Task 2 (buildRamp per-ramp) + Task 3 (store fields + `workingRenderInputs`).
**Scope:** `[App wiring]` — `App.tsx` memo + the side-by-side snapshot producers.

## Context you need

`rampsActive` is the single per-ramp render array everything downstream consumes. This
task creates it and makes the snapshot producers carry the new fields, but does **not**
yet rewire the consumers (that is Task 5) or the card UI (Task 6). After this task the
app still renders exactly as before (default punchy) — `rampsActive` just exists.

## Changes

### `src/App.tsx`
- Near the three memos (`:315-317`), add an `activeStyleFor` callback and the memo:
  ```ts
  const activeStyleFor = useCallback(
    (i) => resolveActiveStyle(rampStyleOverrides, i, paletteDefaultStyle),
    [rampStyleOverrides, paletteDefaultStyle],
  );
  const rampsActive = useMemo(
    () => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, activeStyleFor(i), i)),
    [liveRampSnapshot, activeStyleFor],
  );
  ```
  Import `resolveActiveStyle` from `./lib/style-presets`. `buildRamp` is already
  imported (`:33`). Keep `rampsPunchy`/`rampsBalanced`/`rampsMuted`.
- Confirm `rampStyleOverrides` / `paletteDefaultStyle` are destructured from
  `usePaletteState` (Task 3 exposed them) — add to the destructure at `App.tsx:130` if
  not already present.

### `src/hooks/useSideBySideCompute.ts`
- `buildWorkingSnapshot` (`:193-199`): include `rampStyleOverrides`, `rampStyleScalars`,
  `paletteDefaultStyle`. These come free if it spreads `workingRenderInputs`; otherwise
  add them explicitly.
- `buildClassicSnapshot` (`:202-218`): add defaults `paletteDefaultStyle: 'punchy'`,
  `rampStyleOverrides: {}`, `rampStyleScalars: {}` (classic palettes have no per-ramp
  styling).

## Acceptance criteria

- App builds and renders unchanged (default punchy everywhere) — `rampsActive` equals
  `rampsPunchy` when no overrides set. Verify with a quick `/run` or existing e2e.
- `npm test` green; type gate clean; grep `App.tsx` for `rampsActive` shows it defined
  and no dangling refs.

## Suggested commit

```
feat(app): add rampsActive memo + activeStyleFor; carry style fields in snapshots (#69)

Introduces the single per-ramp render array and threads the new style fields
into the side-by-side snapshot producers. No consumer rewired yet (identity to
current punchy output).
```
