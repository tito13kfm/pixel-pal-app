# Movable, collapsible base-color dock (#80)

**Date:** 2026-06-09
**Issue:** #80 — Add ability to remove a base color from an easy-to-access location
**Approach:** A — self-contained `BaseColorDock` component + `useBaseDock` hook

## Problem

A user reported: while eyedropping colors from an image, a mis-click adds a junk base
color. Today the only delete control is the `×` button buried in each ramp card header
(`src/App.tsx` ~line 5168), so removing a stray base means scrolling down to find its
ramp or hitting Restart and starting over. There is no always-reachable way to drop a
base color.

## Goal

A floating, always-present dock listing every base color as a swatch with a delete
badge. The user can **drag it anywhere** on the page (position remembered across
reloads) and **collapse it** to a small pill when it is in the way. Deletion reuses the
existing `removeRamp(i)`, so it inherits the atomic per-ramp-state cleanup and undo
support already in place. The whole feature is presentational + drag + a small new
"scroll to ramp" jump; **no palette/ramp logic is duplicated.**

## What already exists (feasibility, verified 2026-06-09)

- **Delete:** `removeRamp(index)` in `src/App.tsx` (~line 1398) already filters
  `baseColors`/`aiColorNames` and atomically shifts every base-index-keyed structure
  (`overrides`, `rampSizeOverrides`, `rampSatOverrides`, `hiddenShades`,
  `rampShuffleOffsets`, `collapsedRamps`/`lockedRamps` Sets, `pinEditor`,
  `compareAnchor`, `harmonyAnchor`, `editingIndex`). The dock calls it unchanged.
- **Undo is free:** `useHistory` (`src/hooks/useHistory.ts`) captures snapshots via an
  effect that watches tracked state, not via explicit push calls. A dock delete mutates
  `baseColors`, so it auto-creates an undo entry exactly like the ramp `×`.
- **Delete floor:** the ramp `×` is wrapped in `{baseColors.length > 1 && (...)}`
  (line 5168), so the last base cannot be removed today. The dock mirrors this: the `×`
  badge is hidden when `baseColors.length === 1`.
- **Drag mechanics:** pointer-capture dragging (`onPointerDown` → `setPointerCapture`,
  track deltas on `pointermove`, release on `pointerup`) is already used in
  `CurveEditor.tsx` and `PixelPlayground.tsx`. Pointer events (not HTML5 drag) are the
  right choice and sidestep the Tauri `dragDropEnabled:false` file-drop interception.
- **UI persistence:** `usePanelLayout.ts` persists UI-only state under `ui:*`
  localStorage keys (`ui:sectionOrder`, `ui:vizSubOpen`). The dock adds `ui:baseDockPos`
  and `ui:baseDockCollapsed` the same way.

## Components

### `src/components/BaseColorDock.tsx`
Fixed-position floating widget, rendered once at the App root. Pure presentation + drag;
holds no palette state. Props:

- `baseColors: string[]`
- `onDelete(index: number): void` — wired to `removeRamp`
- `onJump(index: number): void` — wired to `scrollToRamp`

Renders:
- **Grab-bar** (drag handle) at the top, plus a **collapse** toggle.
- A vertical **swatch rail**: one swatch per base color (color fill).
  - Hover a swatch → **hex tooltip** (so the user knows which is which).
  - **`×` badge** on each swatch → `onDelete(i)`. Hidden when `baseColors.length === 1`.
  - **Swatch body** click → `onJump(i)`. Body is inert otherwise; it is never a delete
    target, so dragging or a careless click cannot delete.
- **Collapsed state:** a small pill showing mini color dots + base count
  (e.g. "4 bases"). Still draggable; click expands it back.

Only the grab-bar and the collapsed pill are drag handles; swatches are not.

### `src/hooks/useBaseDock.ts`
Owns the dock's own UI state only:
- `pos: { x, y }` and `collapsed: boolean`, persisted to `ui:baseDockPos` /
  `ui:baseDockCollapsed`.
- **Viewport clamping:** on mount and on `window` resize, clamp `pos` so the dock stays
  fully on-screen (it can never be stranded off the edge after a resize or a
  smaller-screen reload).
- Exposes drag handlers (pointer-capture) that update `pos` live and persist on release.

### Wiring in `App.tsx`
- Render `<BaseColorDock baseColors={baseColors} onDelete={removeRamp} onJump={scrollToRamp} />`
  at the App root, as a sibling overlay (alongside the existing fixed updater toast).
- `baseColors` and `removeRamp` already exist in this scope.

### Layering (z-order)
The dock is always present, so its stacking must not fight the app's other overlays.
It sits **below** the export/AI-settings modals and the onboarding-tour spotlight, and
above normal page content. Concretely: pick a dock `z-index` lower than the modal/tour
layers (the updater toast uses `z-40`; modals/tour sit above that — the dock should be
at or below the toast tier, e.g. `z-30`, never above the modal/tour tier). The dock must
never obscure a modal or the tour highlight.

### Drag handle hygiene
The grab-bar and collapsed pill set `touch-action: none` so pointer-drag is clean on
touch devices (no existing component sets this; it is a new addition here, not a mirror).

## The one new bit: `scrollToRamp(i)`

The swatch-body jump needs a target the dock can scroll to.

- Tag each ramp card in the Color Ramps section with `data-ramp-index={i}` (or a ref map).
- `scrollToRamp(i)`: find that node, `scrollIntoView({ behavior: 'smooth', block: 'center' })`,
  and apply a **transient highlight** (a ring/glow class for ~1s via a short-lived
  `highlightedRamp` state) so the eye lands on the right ramp.
- If the Color Ramps section or that ramp is collapsed, the jump still scrolls to the
  card; expanding collapsed ramps on jump is out of scope for v1.

## Default position + dev calibration

The user wants to physically place the dock in the dev build and have that spot become
the shipped default for new users.

- **Default constant:** `DEFAULT_DOCK_POS` expressed as an **anchor + offset**
  (`{ anchor: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left', dx, dy }`),
  **not** raw pixels, so it resolves sensibly on any viewport. `useBaseDock` resolves
  the anchor against the current viewport when no persisted `ui:baseDockPos` exists
  (i.e. for new users).
- **Dev calibration (dev-only, never ships):** gated on `import.meta.env.DEV`. After a
  drag release in dev, log a ready-to-paste line, e.g.
  `[base-dock] DEFAULT_DOCK_POS candidate: { anchor: 'top-right', dx: 24, dy: 72 }`,
  computed from the nearest corner. Because `import.meta.env.DEV` is statically `false`
  in production builds, Vite dead-code-eliminates this block — zero prod cost.
- **Workflow:** run `npm run tauri:dev` → drag the dock to the preferred spot → read the
  console line → hand the value over → it is hardcoded into `DEFAULT_DOCK_POS`. The
  dev-gated readout stays in the source (harmless, tree-shaken from prod).

- **Calibration localStorage trap:** once *anyone* (including the developer) drags the
  dock, `ui:baseDockPos` is persisted and **masks `DEFAULT_DOCK_POS`** on reload. To
  verify the new-user default renders correctly, clear `ui:baseDockPos` from localStorage
  first. (Otherwise you hardcode a default, reload, see your own persisted position, and
  wrongly conclude the default didn't take.)

## Compare mode (OPEN DECISION — needs user sign-off)

The app has a side-by-side **compare** view, and `removeRamp` already mutates
`compareAnchor`/`compareResult`. An always-on dock that deletes live `baseColors` has no
defined behavior while compare is active. Precedent: the reorder-ramps spec (2026-06-05)
scoped its feature "Main view only. Compare mode is unaffected."

**Recommended default: hide the dock while compare mode is active.** Compare is a focused
review view; deleting a base mid-comparison would shift what is being compared and is a
likely source of confusion. Re-show the dock on exit. (Alternative: keep it live in
compare — only if the user wants delete reachable from every view.) **This choice is
settled with the user before the plan is written.**

## States summary

- **First load (new user):** expanded, parked at `DEFAULT_DOCK_POS`.
- **After interaction:** position + collapsed/expanded persist across reloads via `ui:*`.
- **One base left:** `×` hidden (mirrors ramp behavior); body-jump still works.
- **Window resized smaller:** dock re-clamps inside the viewport.
- **Compare mode active:** dock hidden (per the decision above).

## Edge cases

- `removeRamp` already keeps the dock list and all ramp state consistent (it owns the
  index shift); the dock needs no extra reconciliation.
- Deleting via the dock and via the ramp `×` are the same call, so undo/redo and history
  labels are identical.
- Web and desktop both: pointer events cover mouse and touch; persistence uses
  localStorage (available in both runtimes).

## Out of scope (YAGNI for v1)

- Reordering bases from the dock (that is #52's concern).
- Editing a color from the dock (the ramp editor stays the place to edit).
- Expanding a collapsed ramp on jump.
- Multi-select / bulk delete.

## Testing

### Harness sequencing vs #74 (OPEN DECISION — needs user sign-off)

Component and hook tests both need `@testing-library/react` (`renderHook` lives there
too). This dock is **not** a Tier-C panel, so #74 ("land the harness with the first
Tier-C panel") may not be done when this ships. Three ways to sequence, given the user
wants this ASAP:

- **(a) Pull the harness in now** — add `@testing-library/react` as the first step of
  this feature (effectively lands #74's core). Best coverage; adds a little setup time.
- **(b) Ship with pure-logic unit tests only** — extract the clamp / anchor-resolution /
  persistence-shape logic out of `useBaseDock` as pure functions and test those with
  plain vitest (no harness). Defer the component + hook-render tests until #74 lands.
  Fastest path; the rendered component goes untested for now.
- **(c) Manual-verify only for now** — ship behind the live dev build, file the component
  tests as a follow-up on #74.

Recommendation: **(a)** if a few extra steps are acceptable (the harness is wanted
anyway), else **(b)**.

### Planned tests
- **`useBaseDock`** (unit): persistence round-trip (`ui:baseDockPos` / `ui:baseDockCollapsed`);
  viewport clamping on resize; anchor→pixel resolution for a fresh user. Pure-logic parts
  run under plain vitest (path b); `renderHook` parts need the harness (path a).
- **`BaseColorDock`** (component, needs the `@testing-library/react` harness):
  renders N swatches for N base colors; `×` hidden at exactly 1 base; `×` click calls
  `onDelete(i)`; swatch-body click calls `onJump(i)`; collapse toggle flips state.
- **e2e (optional, Playwright):** add a base, then delete it via the dock, assert the
  ramp count drops.

## Files

- New: `src/components/BaseColorDock.tsx`, `src/hooks/useBaseDock.ts`.
- New test(s): `src/components/BaseColorDock.test.tsx` (+ `useBaseDock` unit test).
- Edit: `src/App.tsx` — render the dock at root; add `scrollToRamp` + `highlightedRamp`
  state; add `data-ramp-index` to ramp cards; `DEFAULT_DOCK_POS` constant.
- Possible: `docs/ARCHITECTURE.md` — note the dock in the relevant subsystem section
  (per the doc-sync directive) if it touches a documented invariant.

## Relationship to other issues

- **#74** (React component-test harness) is the natural first consumer here; if #74 has
  not landed when this is built, the component test depends on it.
- **#52** (reorder ramps) owns base ordering; the dock only lists/deletes, no reorder.
