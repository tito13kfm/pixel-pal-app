# Task 6 — Color Ramps card: per-ramp picker + active-only display + comparison toggle + "set all"

> Read `../README.md` first.

**Depends on:** Task 4 (`rampsActive`, `activeStyleFor`) + Task 3 (setters). Can run in
parallel with Task 5; this task **owns `RampsPanel.tsx`**.
**Scope:** `[UI]` — `RampsPanel.tsx` + its props from `App.tsx` + spec.

## Context you need

The Color Ramps card must (a) show only each ramp's active style by default, (b) offer
a per-ramp style picker, (c) keep an optional "show all three" comparison view
(card-only, default off), and (d) replace the retired header `rampExportStyle` toggle
with a palette default-style selector + a "set all" bulk action.

The three memos (`rampsPunchy`/`rampsBalanced`/`rampsMuted`) stay — they feed the
comparison view and the pin editor.

## Changes — `src/components/panels/RampsPanel.tsx`

- **New props** (wired from `App.tsx:816-818` region): `rampsActive`, `activeStyleFor`,
  `rampStyleOverrides`, `setRampStyleOverride(i, style)`, `paletteDefaultStyle`,
  `setPaletteDefaultStyle`, and a card-local `showAllStyles` boolean + toggler.
  (Prefer defining `showAllStyles` as `useState` inside the panel; persist to a
  `ui:showAllStyles` key only if you want it sticky.)
- **Per-card render (`:377-394`, `:588-606`, `:635-660`):**
  - When `showAllStyles` is **off**: compute one block `active = rampsActive[i]` and
    render a single collapsed sprite + single expanded grid for it. The Swatch `style=`
    prop is `activeStyleFor(i)`.
  - When **on**: render the existing three stacked blocks unchanged.
- **Per-ramp style selector:** a segmented Punchy/Balanced/Muted/Custom control
  (reuse the pattern at `:317-322`) that calls `setRampStyleOverride(i, style)`. Place
  in the per-ramp control row (`:415-467`) or the Adjust Base editor header
  (`:469-584`). Selecting **Custom** when `rampStyleScalars[i]` is empty seeds it from
  the ramp's current resolved scalars (`resolveRampScalars({style: activeStyleFor(i), …})`)
  so the sliders (Task 7) start where the ramp was. Wrap each style change in
  `tagNextLabel('Change ramp style')`.
- **Header controls (replacing the old `rampExportStyle` toggle at `:316-322`):**
  - A palette **default-style** selector (segmented P/B/M) → `setPaletteDefaultStyle`.
  - A **"Set all ramps → default"** button that clears `rampStyleOverrides` (`{}`), so
    every ramp falls back to the default. `tagNextLabel('Set all ramp styles')`.
  - The **"Compare all 3 styles"** toggle → flips `showAllStyles`.
- **Pin editor (`:665-673`):** the source-ramp select keys on `pinEditor.style`; add a
  `'custom' → rampsActive[i]` branch so pinning a custom ramp uses its active render.
- Reword any tooltips that referenced the old per-ramp export style.

## Changes — `src/App.tsx`
- Add a `setRampStyleOverride(i, style)` helper (writes into `rampStyleOverrides`,
  handling the custom-seed logic) and pass the new props into `RampsPanel`.

## Tests — `tests/unit/RampsPanel.spec.tsx`
- Update for removed `rampExportStyle` buttons.
- Assert: default view shows one strip per ramp; toggling "Compare all 3" shows three;
  the per-ramp picker calls `setRampStyleOverride`; "Set all" clears overrides.
- Use `toBeAttached()` for conditionally-rendered nodes (Playwright/RTL gotcha noted in
  `../README.md`).

## Acceptance criteria

- Default card shows one strip per ramp at its active style; per-ramp picker switches a
  single ramp; "Compare all 3" restores the stacked view; default-style selector +
  "set all" behave; undo/redo covers each. `npm test` + `npm run test:e2e` green; type
  gate clean.

## Suggested commit

```
feat(ramps): per-ramp style picker, active-only display, compare toggle, set-all (#69)

Color Ramps card shows one strip per ramp at its active style, with a per-ramp
Punchy/Balanced/Muted/Custom picker, a palette default-style selector + set-all,
and an optional "compare all three" view.
```
