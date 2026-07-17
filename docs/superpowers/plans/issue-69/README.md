# Issue #69 — Per-ramp style presets — implementation plan (shared context)

**Read this file first.** Each `task-N-*.md` in this folder is a self-contained unit
of work that assumes the context below. A task session needs only its own task file +
this README — not the design conversation that produced them.

- **Issue:** #69 — Per-ramp style presets: show only the active style, custom
  overrides, named save/load.
- **Branch:** `claude/issue-69-investigation-ob8qnd` (all tasks commit here).
- **Sibling done:** #52 (drag-to-reorder ramps) — its permutation machinery is the
  extension point new per-ramp maps must join. See
  `docs/superpowers/specs/2026-06-05-reorder-ramps-design.md`.

---

## The problem (what we're changing and why)

Today the **Color Ramps** card renders **all three** styles (Punchy/Balanced/Muted)
stacked per ramp (`src/components/panels/RampsPanel.tsx:588-660`). "Which style" is a
single global choice split across three session-level selectors:

- `vizStyle` (`src/hooks/useVizSettings.ts`) → Visualization / Playground / Remap /
  Side-by-side.
- `rampExportStyle` (`src/hooks/useExportSettings.ts`) → per-ramp Copy/Download `.gpl`.
- `gplStyle` (`src/hooks/useExportSettings.ts`) → whole-palette export.

`stylePresets` (`src/lib/style-presets.ts`) — the `{reach, chromaFalloff}` knobs
behind each style — is global per-palette, keyed by style *name* only. There is **no**
per-ramp style concept.

Issue #69 reframes style as a **per-ramp property**: each ramp picks its own active
style, the app shows only that style, editing the knobs for one ramp flips it to a
bespoke **Custom** style (the named presets stay pristine), and custom looks can be
saved/loaded by name like saved palettes.

## Decisions locked with the user (do not relitigate)

1. **Authoritative everywhere.** The per-ramp active style drives *every* view — the
   Color Ramps card, per-ramp export, Visualization, Mosaic, Adjacency, Dither,
   whole-palette export, Side-by-side, Remap, and sprite previews. The three global
   selectors are **retired**.
2. **Keep a "show all three" comparison toggle** on the Color Ramps card only
   (default **off**), so the old stacked view is available on demand.
3. **Named-styles UI is compact in-editor** — a load `<select>` + save-name input
   inside the per-ramp Adjust Base editor. No dedicated section card.

---

## Data model (the heart of the feature)

Three new fields, owned by the Zustand store `src/store/rampsStore.ts` next to
`rampSizeOverrides` etc. Unlike the retired UI-pref globals, these are **palette
identity** → they join undo history **and** the saved-palette payload.

| Field | Shape | Notes |
|---|---|---|
| `paletteDefaultStyle` | `RampStyle` (default `'punchy'`) | fallback active style for any ramp without an override; a **scalar** (not part of the reorder permutation) |
| `rampStyleOverrides` | `Record<number, RampStyle>` (sparse, keyed by baseIndex) | per-ramp active style |
| `rampStyleScalars` | `Record<number, StyleScalars>` (sparse, keyed by baseIndex) | per-ramp `{reach, chromaFalloff}`, only meaningful when that ramp's override is `'custom'` |

`RampStyle = 'punchy' | 'balanced' | 'muted' | 'custom'`.
`StyleScalars = { reach: number; chromaFalloff: number }` (exists in
`src/lib/style-presets.ts`).

### Resolution rules (pure, live in `src/lib/style-presets.ts`)

- **Active style for a ramp:** `activeStyleFor(i) = rampStyleOverrides[i] ?? paletteDefaultStyle`
- **Scalars inside `buildRamp`:**
  `style === 'custom' ? (rampStyleScalars[i] ?? fallback) : styleToScalars(style, stylePresets)`
  — fallback when a custom ramp has no scalars yet = the `balanced` preset scalars.

### The single new render array

`rampsActive[i] = buildRamp(liveRampSnapshot, activeStyleFor(i), i)` — one strip per
ramp at its active style. **Every** ramp consumer switches from picking one of the
three global sets to reading `rampsActive`. The three memos
(`rampsPunchy`/`rampsBalanced`/`rampsMuted`) are **kept** only for (a) the card's
"show all three" comparison view and (b) the pin editor, which needs a specific
style's ramp. Do not delete them.

### Backward compatibility (free)

With `paletteDefaultStyle='punchy'` and empty overrides, `rampsActive === rampsPunchy`,
so the ramp-pipeline characterization test stays **byte-identical**. Old saved
palettes carry `vizStyle`/`gplStyle` but no per-ramp fields → on load, map the saved
`vizStyle` (falling back to `gplStyle`) into `paletteDefaultStyle` and set
`rampStyleOverrides = {}`.

### Named styles persistence

New `styles:{slug}` localStorage namespace holding `{ name, savedAt, reach,
chromaFalloff }`, managed by a hook mirroring `src/hooks/useSavedPalettesActions.ts`.
Loading a named style **stamps a copy** into `rampStyleScalars[i]` and sets that ramp
to `'custom'` (snapshot-copy semantics, like saved palettes — not a live reference).

---

## The three "keep in sync" field lists (a new map must join all of them)

A new per-ramp map silently desyncs unless it is added to every one of these:

1. Store `buildSnapshot` + `applySnapshotFields` (`src/store/rampsStore.ts`).
2. `SNAPSHOT_FIELDS` (`src/lib/history-snapshot.ts`).
3. `snapshotInputs` dep array (`src/App.tsx:247`) — triggers a history entry.
4. `MAP_FIELDS` + `RampStatePlain` (`src/lib/permute-indexed-state.ts`) — the reorder
   permutation. **Only the two `Record<number,…>` maps go here; the scalar
   `paletteDefaultStyle` does not.**
5. `RampSnapshot` (`src/lib/snapshot-ramps.ts`) + `workingRenderInputs`
   (`src/App.tsx:296-311`) — the render pipeline.
6. Saved-palette payload write + validated read (`src/hooks/useSavedPalettesActions.ts`,
   `src/lib/palette.ts`).

---

## Dependency graph / execution order

```
Task 1 (types + helpers) ─┬─> Task 2 (buildRamp + snapshot resolution) ─┐
                          └─> Task 3 (store/undo/reorder/persistence) ───┼─> Task 4 (rampsActive memo) ─> Task 5 (thread views + retire globals)
                                                                          │                              └─> Task 6 (card UI) ─> Task 7 (custom sliders) ─> Task 8 (named save/load)
Task 9 (docs/spec/release) — draftable anytime, finalize last ───────────┘
```

- **Wave A (can start immediately, in parallel):** Task 1; Task 9 spec/docs draft.
- **Wave B (after Task 1):** Task 2 and Task 3 in parallel (they touch disjoint files
  except both add the `RampStyle` type usage — Task 1 provides it).
- **Wave C (after Tasks 2 + 3):** Task 4.
- **Wave D (after Task 4):** Task 5 and Task 6 in parallel (Task 5 = aggregate views +
  global-selector removal; Task 6 = card UI). They touch mostly different files;
  coordinate on `RampsPanel.tsx` (Task 6 owns it) and `App.tsx` prop wiring.
- **Wave E:** Task 7 (needs Task 6's picker), then Task 8 (needs Task 7's custom slot).
- **Finalize:** Task 9.

Each task is one commit. TDD wherever a `src/lib/` file is touched (write/adjust the
spec first, watch it fail, then implement).

---

## Reuse map (don't reinvent)

- **Permutation:** `permuteRampState` / `computePermutation` / `permuteStringKeyMap`
  (`src/lib/permute-indexed-state.ts`); wired by `reorderRamps` (`rampsStore.ts:187`).
- **Snapshot/history:** `buildSnapshot` / `applySnapshotFields`
  (`rampsStore.ts:136-181`), `SNAPSHOT_FIELDS` / `inferLabel`
  (`src/lib/history-snapshot.ts`), `tagNextLabel` (explicit history label; ~20 call
  sites, e.g. the reorder handler in `src/hooks/useDragReorder.tsx`).
- **Style scalars:** `StyleScalars`, `DEFAULT_STYLE_PRESETS`, `styleToScalars`
  (`src/lib/style-presets.ts`).
- **Ramp pipeline:** `buildRamp(snapshot, style, baseIndex)`
  (`src/lib/ramp-pipeline.ts:26`) — style enters only at line 83
  (`styleToScalars`) and the per-style pin lookup (line 109).
  `buildRampsForSnapshot(snapshot, style)` (`src/lib/snapshot-ramps.ts:72`) is the
  snapshot-side twin.
- **UI patterns:** segmented P/B/M toggle (`RampsPanel.tsx:317-322`); native
  `<select>` (`SavedPalettesPanel.tsx:242-251`); saved-list hook
  (`useSavedPalettesActions.ts`); `slugify` + the `window.storage` shim
  (`src/App.tsx:66-93`, typed in `src/vite-env.d.ts`).
- **State surface:** `src/hooks/usePaletteState.ts` re-exports store fields to `App.tsx`.

---

## Repo conventions (apply to every task)

- **`// @ts-nocheck` in `App.tsx` is intentional.** `tsc`/`npm run build` will NOT
  catch dangling refs to removed locals inside `App.tsx` — **grep is the real gate**
  there. `color.ts`/lib files are typed normally.
- **Type gate:** per `CLAUDE.md`, correctness is verified by `sed`-stripping
  `@ts-nocheck` from a copy of `App.tsx` + `tsc --noEmit`, plus `npm run build`.
- **ESM project.** Config files use `export default`. Tailwind **v3**.
- **Commit style:** one commit per task, imperative subject, body explaining the
  change. End every commit message with the two trailer lines the harness requires
  (`Co-Authored-By:` and `Claude-Session:`). **Do not** put the model identifier in
  commits/PRs/code.
- **Do not bump the version** in any task except Task 9's release step, and only after
  the user approves the bump level.

## Verification gate (each task runs the slice relevant to its files; Task 9 runs all)

- `npm test` (vitest unit suite) — green.
- Type gate (above) + `npm run build`.
- `npm run deadcode` (ts-prune) — confirm removed exports (`selectRampsForStyle`, the
  retired setters) are gone, not left orphaned.
- `npm run test:e2e` (Playwright, desktop) for UI tasks.
- Playwright landmines (see `docs/ARCHITECTURE.md` → Playwright Gotchas):
  `toBeAttached()` not `toBeVisible()` for conditional nodes; `getByTitle()`/buttons
  need exact text + `{ exact: true }`.
