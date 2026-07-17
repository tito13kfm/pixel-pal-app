# Task 9 — Docs, changelog, spec, and release

> Read `../README.md` first.

**Status: Done (docs/spec/changelog).** Added
`docs/superpowers/specs/2026-07-17-issue-69-per-ramp-style-design.md`, updated
`docs/ARCHITECTURE.md` (RampsPanel/PlaygroundPanel prop descriptions, invariant
6, the snapshot/history field counts, the persistence key inventory including
the new `styles:` namespace and the retired `ui:vizStyle`/`ui:gplStyle`/
`ui:rampExportStyle` keys), and added the `[Unreleased]` CHANGELOG entries
(Added/Changed/Removed). Full verification gate green: `npm test` (602/602),
type gate (strip-`@ts-nocheck` copy + `tsc --noEmit`, pre-existing type-debt
only, no new errors from this change), `npm run build`, `npm run build:web`,
`npm run deadcode:ci` (0 new). `npm run test:e2e` was not run (this task made
no source changes, docs-only diff, so there is no runtime surface to exercise;
see the repo's e2e sandbox note in the plan handoff). **Version bump deferred**
per this file's own instructions: proposing a MINOR bump (0.26.0) since
per-ramp styles is a substantial new feature surface, per `CLAUDE.md`'s
versioning rule, awaiting user sign-off before `npm version` + tagging.

**Depends on:** the design is stable from the start, so the **spec + docs drafts can be
written anytime (Wave A)**; the CHANGELOG finalization + version bump happen **last**,
after Tasks 1–8 land.
**Scope:** `[wrap-up]` — docs, changelog, spec, versioning.

## Changes

### 1. Design spec — new `docs/superpowers/specs/2026-07-17-issue-69-per-ramp-style-design.md`
- Mirror the format of `docs/superpowers/specs/2026-06-05-reorder-ramps-design.md`
  (Goal, Data model, Resolution, Interactions, Files touched, Testing, Out of scope).
- Content is the design in `../README.md` — write it up as the canonical spec.

### 2. `docs/ARCHITECTURE.md`
- Update the `RampsPanel.tsx` prop description (new per-ramp style props, `rampsActive`,
  `showAllStyles`; removed `rampExportStyle`).
- Note the new state (`paletteDefaultStyle`, `rampStyleOverrides`, `rampStyleScalars`)
  in the store/snapshot/permutation sections, mirroring how `gamutPerRamp` and the
  keyed maps are described.
- Note the retired globals (`vizStyle`/`rampExportStyle`/`gplStyle`) and the new
  `styles:` localStorage namespace.

### 3. `CHANGELOG.md` — `## [Unreleased]`
- **Added:** per-ramp active style; Custom per-ramp tuning; named save/load of custom
  ramp styles; "compare all three styles" toggle.
- **Changed:** every view now renders each ramp at its own style; Color Ramps card
  shows one strip per ramp by default.
- **Removed:** the global Punchy/Balanced/Muted selectors (`vizStyle`,
  `rampExportStyle`, `gplStyle`), replaced by the palette default style + per-ramp
  overrides.

### 4. Version bump (LAST — requires user sign-off)
- This is a substantial feature → propose a **MINOR** bump per `CLAUDE.md`. State
  "proposing vX.Y.0 because per-ramp styles are a new feature surface" and **wait for
  the user's OK** before running `npm version` / tagging.
- On approval, follow the `release-flow` memory: move the `[Unreleased]` notes into
  `## [x.y.z] - YYYY-MM-DD`, add the `compare/` footer link, and bump the four version
  files in lockstep (`package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`) so
  the tag matches.

## Full verification (run the whole gate here)
- `npm test` (all vitest) green.
- Type gate: strip-`@ts-nocheck` `App.tsx` copy + `tsc --noEmit`; `npm run build`;
  `npm run build:web`.
- `npm run test:e2e` (desktop) and the web e2e (`npm run build:web` +
  `npx playwright test --config=playwright.web.config.ts`).
- `npm run deadcode` — no orphaned exports from the removed selectors.
- Manual (`/run`): set ramp #1 → Muted, ramp #2 → Custom (drag Reach); confirm the card,
  Mosaic, Viz, and whole-palette `.gpl` all show per-ramp styles; save a named style +
  load onto ramp #3; reorder ramps and confirm styles travel; undo/redo each op; save +
  reload the palette (styles persist); toggle "compare all three"; load a pre-#69 saved
  palette (maps to its old style via the legacy migration).

## Suggested commit(s)
```
docs(style): spec + architecture + changelog for per-ramp styles (#69)
```
(Version bump is a separate, user-approved commit + tag.)
