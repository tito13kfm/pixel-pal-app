# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project tries its best to adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Versioning notes.** The first public tag is `0.2.0`; there was no `0.1.0`
> release. `0.3.0` was bumped internally but never tagged or released (the
> first `0.3.x` release is `0.3.1`). `0.5.0` marks the rewrite from an Electron
> shell to **Tauri v2**; because that work branched from before `0.4.0`, the
> tag lineage resets there. The `0.5.x` line saw rapid patch releases while the
> new Tauri auto-updater signing was stabilized.
>
> Entries for `0.2.0` through `0.12.0` were backfilled from git history; the
> corresponding [GitHub Releases](https://github.com/tito13kfm/pixel-pal-app/releases)
> carry the build artifacts but no written notes.

## [Unreleased]

### Added
- Native OKLCH sliders (Light/Chroma/Hue) for the base-color editor, alongside
  the existing HSV sliders. An HSV/OKLCH toggle in the "Adjust Base" panel
  switches which color space the sliders show; both write through the same
  hex on `baseColors[i]` so they stay in sync. OKLCH edits are gamut-mapped
  (`auto` strategy, matching the ramp engine's default) before being written
  as hex, so out-of-sRGB chroma/lightness/hue combinations still produce a
  valid base color. (#129)

### Fixed
- Removing or duplicating a ramp now re-keys the per-ramp advanced settings
  (`hueShiftStrengthPerRamp`, `lightnessCurvePerRamp`, `satCurvePerRamp`,
  `gamutPerRamp`) like every other base-keyed structure. Previously,
  removing ramp 1 of 3 while ramp 2 had a per-ramp hue shift, Advanced
  curve, or gamut strategy silently attached those settings to the wrong
  ramp, and a duplicated ramp rendered differently from its source when the
  source used any of the four. (pre-existing, tracked on #113; regression
  test in `tests/unit/useRampEditing-rekey.spec.tsx`)
- Image Preview (Visualize & Compare) computes again: the debounced
  auto-remap effect was lost in the Tier-C `VizComparePanel` extraction, so
  an uploaded image sat on "Remapping..." forever. The effect is restored in
  the new `useImageRemapCompute` hook (300ms debounce keyed on the active
  palette signature + dither mode, exactly the pre-extraction behavior).

### Changed
- App.tsx decomposition (#113, slice 1): image-remap wiring (active-palette
  derivation, upload/clear/download handlers, download confirmation timer)
  extracted to `hooks/useImageRemapCompute.ts`; harmony add handlers
  (`addHarmonyColor`/`addHarmonyPair`/`addHarmonyMany`) extracted to
  `hooks/useHarmony.ts`. Both are typed (no `@ts-nocheck`). App.tsx drops
  from 3,846 to 3,500 lines. CI now enforces a 3,550-line ratchet on
  App.tsx to prevent regrowth between extraction slices.
- App.tsx decomposition (#113, slice 2): saved-palette persistence wiring
  (mount-time list refresh, save, the 240-line load/validate, classic-palette
  and .gpl import loaders, delete/rename with the two-click confirm timer,
  the `gplImport` modal state) extracted to `hooks/useSavedPalettesActions.ts`
  (typed, no `@ts-nocheck`); `formatHistoryAge` moved to
  `lib/history-snapshot.ts`. App.tsx drops from 3,500 to 2,962 lines; the CI
  ratchet lowers to 3,000. New Playwright regression test covers the
  save → load → rename → delete round-trip (previously zero e2e coverage).
- App.tsx decomposition (#113, slice 3): the per-ramp / per-shade editing
  handlers (remove/duplicate ramp with base-keyed re-keying, dock
  scroll-and-highlight, base-color editor, pin/override cluster,
  hide/restore shades, per-ramp + lock-aware shuffle, ramp lock, WCAG
  compare handlers, card collapse toggles) extracted to
  `hooks/useRampEditing.ts` (typed, no `@ts-nocheck`). The ramps store's
  `pinEditor` type gains its always-present-at-runtime `style` field.
  App.tsx drops from 2,962 to 2,496 lines; the CI ratchet lowers to 2,550.
  New Playwright regression test covers duplicate → edit base → pin →
  hide → lock → remove.
- App.tsx decomposition (#113, final slices): the remaining non-JSX logic
  moved into typed hooks (no `@ts-nocheck`): `useSideBySideCompute`
  (side-by-side payload fetches, slot → snapshot resolution, slot labels,
  SBS image-remap pipeline), `useImageExtractHandlers` (From Image
  upload/drag/paste decode + extract, re-extract, eyedropper),
  `useSpriteImport` (gains the import/drag/remove/copy-source handlers),
  `useHardwareLock` (toggle + bake-to-pins), `useGlobalShortcuts` (Escape
  dismiss + S/H), `useSessionPrefs` (ui:rampSize persistence + moodPreset
  state and ui:moodPreset persistence), `useGenerationActions` (New
  palette, random roller, Surprise Me / Around This, Add-to-Palette),
  `usePaletteReset` (shared 8-path reset + two-click Reset to defaults),
  `useHarmony` (gains harmonize / restore-baseline + mode/baseline state),
  `useTourOrchestration` (tour start/exit, pre-tour snapshot/restore,
  setup staging, first-visit auto-start), `useThemeHelpers` (theme token
  bag + accent chrome helpers + ThemeContext value), and `useDragReorder`
  (section-card + ramp-card drag reorder). App.tsx drops from 2,496 to
  1,298 lines (JSX layout + prop wiring plus the ramp memo pipeline); the
  CI ratchet lowers to 1,350.

## [0.25.0] - 2026-07-16

### Added
- One-click palette generator on the Single Color tab: "Surprise Me" replaces
  the palette with 5 base colors picked to work together (golden-angle hue
  spacing with perceptual ΔE_OK separation, pleasing lightness/chroma
  ranges), and "Around This" does the same while keeping the current hex
  verbatim as base 1. Non-AI, no key, instant; each base gets its own OKLCH
  ramps as usual. (backlog item F)
- Mood presets: six hand-authored genre envelopes (Cozy Farm, Cyberpunk Neon,
  Gothic Horror, Sun-Bleached Desert, Deep Ocean, Candy Pop) that bias the
  new generator and clamp Harmonize output into a hue/chroma/lightness range.
  Curated data in the spirit of Hardware Lock (and composable with it),
  deterministic, no AI. Selectable next to the generator buttons and next to
  Harmonize; persisted per session as `ui:moodPreset`. (#135)
- Cross-palette adjacency check: with two compare slots active, a rectangular
  ΔE_OK heatmap flags near-duplicate shades across slot A and slot B (rows =
  A, columns = B), with hover readout and closest-pair summary (#134).
- Palette Cycling designer in Visualize & Compare: mark a contiguous shade
  range in a ramp, preview classic index-rotation animation (settable fps,
  direction, sprite preview), and export the cycle as a
  `pixel-pal-cycle.json` sidecar. (#131)

### Fixed
- Base-color editor no longer snaps hue/saturation by up to ±0.5 when
  adjusting a single HSV slider. `editorHsv` previously rounded to integers
  on open (and on hex-picker input) and kept that rounded value as the live
  editing state; the next single-slider drag then wrote the *other* two
  rounded channels back into `baseColors`, silently drifting the color the
  engine (`hexToOklch`) generates the ramp from. Rounding now happens only at
  render time for the numeric slider labels (#112).
- Image remap (download export and side-by-side compare) no longer freezes
  the UI on large images or heavy dither modes. The per-pixel
  `remapImageToPalette` loop now runs in a dedicated Web Worker
  (`src/workers/remap.worker.ts`, via `src/lib/remap-worker-client.ts`)
  instead of on the main thread (#110).

### Changed
- Release workflow now builds macOS as a universal binary (`--target
  universal-apple-darwin`) instead of Apple-Silicon-only, so tagged releases
  ship an Intel-compatible `.dmg` and the updater's `latest.json` carries both
  `darwin-aarch64` and `darwin-x86_64` targets (#24).
- Release pipeline can now be driven from remote agent sessions, which can
  push branches but not tags: a new "Tag release" workflow creates annotated
  release tags from a signal branch (`release-tag/vX.Y.Z[/sha]` for tag-only,
  `release-run/vX.Y.Z` for tag + build), and the Release workflow's publish
  gates now key on the ref being a tag rather than on the push event, so a
  dispatch at a tag ref behaves exactly like a tag push. This also unblocked
  the v0.23.0 and v0.24.0 tags, which had been version-bumped on master but
  never tagged or released. Draft-Release manual publish gate unchanged.

## [0.24.0] - 2026-07-13

### Fixed
- Full WCAG AA contrast support for the **Neutral** and **Light** themes (#10).
  Re-auditing the current codebase (issue #10's original audit predated the
  `App.tsx` decomposition and its line numbers no longer applied) found
  hardcoded Dark-tuned text colors left illegible on Neutral's flat gray
  cards, which have no override mechanism, plus a couple of real gaps in
  Light's existing CSS-override hack (a bare `text-pink-300` class and
  `<select>` elements with a `bg-black/*` backing). Raised under-strength
  `bg-black/20`/`/30`/`/40` scrim wrappers to `bg-black/60` (needed even on
  Light's near-white cards, which a `/40` overlay doesn't actually darken
  enough), routed short card labels through the existing `themedAccent()`
  helper, added scrims to several previously-unwrapped paragraph captions,
  and wired RampsPanel's hardware-lock banner to the existing
  `alertWarnBg`/`Text`/`Border` tokens instead of literal classes.

### Added
- `tests/test_contrast.js`: new `cardBg*`, `themedAccent`, and `alertWarn*`
  pairs locking in the Neutral/Light contrast fixes above.

## [0.23.0] - 2026-07-13

### Changed
- `HistoryPanel` and `PlaygroundPanel` wrapped in `React.memo`; these panels now
  skip re-renders when unrelated state changes (PR #102, SP2 phase a).
- `ThemeContext` value stabilized: `themeTokens[theme]` lookup wrapped in
  `useMemo([theme])` so context identity is stable between theme changes,
  preventing unnecessary re-renders in all `useTheme()` consumers.

### Added
- `src/lib/renderCount.ts`: test-only render-count harness (`recordRender`,
  `getRenderCount`); no-op in production builds.
- `tests/unit/render-isolation.spec.tsx`: integration tests that mount the real
  `<App>` and assert memo'd panels do not re-render on orthogonal interactions.
- `npm run lint:hooks` (`eslint.hooks.config.js`): blocking
  `react-hooks/exhaustive-deps` gate; 18 pre-existing violations grandfathered
  inline with `TODO(sp2-d)` tags for cleanup when `@ts-nocheck` drops (phase d).
- Ramp sizes now span the engine's full **2-64 shade** range everywhere (#41):
  the global and per-ramp shade-count selectors are a slider + number input
  (replacing the 4-8 button rows), and all load/validation gates
  (`ui:rampSize`, saved-palette `rampSize`, `rampSizeOverrides`, pipeline size
  override) accept 2-64 via a shared `isValidRampSize` check in
  `src/lib/ramp-engine.ts`. Ramps larger than 8 shades use numeric slot labels
  (`shade 1..N`); sizes 2-3 get small semantic label tables.
- `src/components/ShadeCountControl.tsx`: shared shade-count picker used by
  `InputPanel` (global) and `RampsPanel` (per-ramp override).

## [0.22.0] - 2026-06-11

### Removed
- AI-assisted palette generation (multi-provider AI, settings panel, key storage)
  removed entirely, including the frontend, Tauri backend, and the `openai`/`keyring`/
  `tauri-plugin-http` dependencies. Existing stored AI config is left orphaned and
  ignored. Color-name labels (`aiColorNames`) are retained.

## [0.21.0] - 2026-06-09

### Added
- Floating base-color dock: delete a base color from anywhere on the page, or click
  a swatch to jump to its ramp. Draggable, collapsible, and anchored to the card
  column so it stays put on resize; reshapes into a grid for large palettes (#80).

## [0.20.0] - 2026-06-07

### Added
- Atkinson and Stucki error-diffusion dither kernels for image remapping, joining
  the existing Floyd-Steinberg option (#48).

### Changed
- Saved palettes now always render with the v2 perceptual shading engine. A
  palette saved under the original (v1) engine is auto-migrated on load (it may
  look slightly different), and a one-time, dismissible notice explains the
  change. **Breaking:** pre-v2 saves no longer render byte-identically (#70).

### Removed
- The legacy v1 ramp engine and all v1/v2 `engineVersion` branching across the
  engine, pipeline, render snapshots, palette state, and undo/redo history. New
  saves still record `engineVersion: 2` at the persistence boundary so the
  migration notice fires only for genuinely pre-v2 palettes (#70).

### Fixed
- The "Add base" confirmation feedback no longer shifts the button row when it
  appears (#68).

## [0.19.0] - 2026-06-05

### Added
- Color Ramps and Harmony Colors cards are now drag-reorderable by their grip
  handle, joining the existing movable cards (Playground/Visualize/Saved/
  History/Export). Saved layouts from before this change migrate by appending
  the two new cards to the end of the existing order rather than resetting the
  whole arrangement (#44).
- Individual ramps can be dragged to reorder within the Color Ramps card. The
  new order propagates everywhere ramps are used in order: ramp grid, Mosaic,
  Adjacency, Dither, and all exports (gpl/pal/ase/png-strip/txt). Every per-ramp
  setting moves with its ramp: pins, shade count, saturation, hue shift, hidden
  shades, shuffle offset, lightness/saturation curves, lock, collapse, harmony
  anchor, and gamut. Undoable as "Reorder ramps" (#52).

### Changed
- Drag handles are more legible across all themes: the ramp grip moved to the
  card's right edge, and every reorder handle (ramp and whole-card) was restyled
  from a faint low-opacity icon to high-contrast dots, fixing near-invisibility
  on the dark and 18% grey themes.

## [0.18.0] - 2026-06-05

### Added
- Dither-Blend Preview gains more ordered-dither patterns via a dropdown: 8×8
  Bayer plus clustered-dot, scanline, and cross-hatch textures, alongside the
  existing 2×2/4×4 Bayer (#47).
- Cross-ramp dither grid: a Per-ramp ↔ Cross-ramp toggle shows an N×N grid that
  dithers every ramp's base color against every other, previewing the perceived
  in-between hue of two ramps (e.g. red × blue reads as purple) (#46).
- 1×/2×/4× zoom control for the Dither-Blend preview: magnifies on screen while
  staying pixel-crisp; does not affect the exported PNG (#49).

### Changed
- Lightness Distribution now positions each swatch on a 0→100 lightness axis
  instead of equal-width cells, so gaps in tonal coverage are visible. The
  exported PNG matches the on-screen view (#51).
- Default **Punchy** preset retuned (reach 1.0→0.9, chroma falloff 0.1→0.15) for
  a slightly tamer look at the extremes. Affects new palettes only; existing
  saved palettes keep their stored preset values (#40).
- The Image Preview subsection in Visualize & Compare is now individually
  collapsible too, completing the per-subsection collapse work (#45).

### Fixed
- Visualize/export/compare of the working palette now honor per-ramp hue-shift
  overrides instead of falling back to the global value, matching the main
  color grid (#37).
- Freehand pencil/eraser strokes no longer leave gaps on fast drags: the path
  between pointer samples is interpolated, and pointer capture keeps the stroke
  alive when the cursor briefly leaves the canvas (#39).

## [0.17.0] - 2026-06-04

### Added
- Visualize & Compare is reorganized: each view (Chromatic Plot, Lightness
  Distribution, Mosaic, Adjacency Matrix, Dither-Blend) is now its own
  collapsible section with its controls inline, instead of one crammed control
  strip. Collapse state is remembered (#38, #45).

### Changed
- New sessions default to the Neutral theme with the CRT overlay off. Existing
  saved theme preferences are untouched (#42).
- The Dither-Blend preview now renders proper ordered-dither ramps: 2×2 (coarse)
  and 4×4 Bayer (smooth) sweep from one shade to the next so the dither texture is
  actually visible and the two are distinguishable (#43).

### Fixed
- The 4×4 Bayer dither preview no longer renders as vertical streaks; it now shows
  a real Bayer ordered-dither pattern, on screen and in the PNG export (#43).
- Pixel Playground tool labels and icons are legible on the Neutral theme (they were
  dark-on-dark) (#42).

## [0.16.0] - 2026-06-04

### Added
- Even shade distribution (v2 ramp engine): new palettes re-center the base
  color within its ramp, so perceptually light or dark bases get a balanced
  number of shadow and highlight shades instead of bunching toward one end.
  Existing saved palettes keep their original look on load and only adopt the
  new engine when you create fresh content (new color / AI / image / GPL /
  classic) (#35).

### Changed
- Loading a saved palette that used per-ramp hue-shift overrides now renders its
  ramps identically across the main grid, side-by-side compare, and undo/redo.
  Previously compare and undo could re-derive per-ramp hue slightly differently
  than the main view (#35, #30).

## [0.15.0] - 2026-06-02

### Added
- The remapped-image preview in Visualize & Compare now scales with the
  selected export scale, so larger pixels are shown at higher scales, easier
  to judge the remapped result before downloading (#28).

### Fixed
- Dither-blend preview now renders a distinct 4×4 Bayer gradient ramp instead of
  a pattern identical to the 2×2 checker, so the Bayer ordered-dither mode is
  visually distinguishable (#23).
- Pixel Playground canvas state (drawn pixels, undo stack, and active color)
  now survives collapsing and expanding the panel. Previously the component
  unmounted on collapse and wiped everything (#25).

## [0.14.0] - 2026-06-02

### Added
- Export to JASC `.pal` (GrafX2, Paint Shop Pro).
- Export to Adobe Swatch Exchange `.ase` (Photoshop, Illustrator, Krita, not
  Aseprite, despite the shared extension).
- Export a PNG palette strip: a flat swatch sheet for eyedropper import into
  any editor.
- Desktop "Reveal in folder" action after exporting.

### Changed
- Full-palette export is now a single format dropdown (`.gpl` / `.pal` / `.ase`
  / PNG strip / `.txt`) plus one Download button, replacing the separate `.txt`
  and `.gpl` buttons. The Punchy/Balanced/Muted selector now applies to every
  format.

## [0.13.0] - 2026-06-02

### Added
- **Adjacency matrix** view in Visualize & Compare: every palette color paired
  with every other. Toggle between a pair-split view and a ΔE_OK perceptual
  heatmap that surfaces clashing pairs and near-duplicate colors at a glance.
  Color set switches between all unique shades and ramp bases; hover (full-size)
  reads out the exact pair and ΔE.
- **Dither-blend preview** view: the 2-color optical mix of consecutive ramp
  shades, rendered at sprite scale, with a 2×2 checkerboard / 4×4 Bayer toggle,
  the "in-between" shade you get for free when dithering.
- PNG export for both new views, alongside the existing Mosaic and Lightness
  Distribution exports. Both views also render in the side-by-side compare slots.

## [0.12.0] - 2026-06-01

### Added
- PNG export for the **Mosaic** and **Lightness Distribution** views, wired into
  both the visualization toolbar and the export panel, backed by dedicated
  flat-color PNG renderers.

### Fixed
- Export-card PNG buttons now export the working palette while the visualization
  buttons mirror the on-screen slot.

### Changed
- Visualization rendering shares a `computeVizData` helper; `dedupeHexes`
  extracted into `src/lib/hex-utils`.

## [0.11.0] - 2026-05-29

### Added
- Collapse/expand toggle for the Color Ramps section.

### Fixed
- Harmonize guide adds a second ramp via the Complementary swatch instead of
  dead-ending at "Add base".

## [0.10.1] - 2026-05-29

### Fixed
- Default ramp size changed from 4 to 6 shades.
- Tour popover arrow pinned to the outer edge so it no longer covers the title.

## [0.10.0] - 2026-05-29

### Added
- **Guided tour redesign**: a spotlight onboarding overlay (SVG cutout, 69% dim,
  neon ring, floating popover with auto-advance) and a centered help-center
  launcher modal. Interactive guides cover the hex, AI, image, harmonize, and
  pin flows, retargeted to live action elements so no step dead-ends.

### Changed
- Tour copy audited against the current app UI; runtime geometry helpers for
  cutout and popover placement.

## [0.9.0] - 2026-05-28

### Added
- Per-style **reach** and **chroma-falloff** sliders with reset.
- Editable style presets saved per palette (with undo support).
- Undo history cap raised from 20 to 50 entries.

### Changed
- Base-anchored ramp generation driven by reach + chroma falloff; per-palette
  style presets feed the ramp adapter. Gamepad2 icon added to the Pixel
  Playground header.

### Fixed
- Build date stamped from local time instead of UTC.
- Style-preset changes now recorded in undo history.

## [0.8.5] - 2026-05-28

### Added
- Edge-aware section drag/drop, reset-layout control, and hover-reveal pins.

### Fixed
- Theme-aware `DesktopAppLink` readability.

### Changed
- Tauri bundle version synced to `package.json` on `npm version`.

## [0.8.4] - 2026-05-28

### Added
- **Hosted browser build** for GitHub Pages: `VITE_BUILD_TARGET=web` flag and
  `build:web` script, with the Tauri runtime dynamic-imported and tree-shaken
  out of the web bundle. Includes a `WebKeyWarning` banner, stale-provider
  migration, web provider filtering, a custom-provider CORS hint, and a
  `DesktopAppLink` footer. New `deploy-web` workflow publishes to GH Pages on
  `v*` tags; web build and web e2e added to CI.

## [0.8.3] - 2026-05-28

### Added
- Per-ramp hue-shift strength override.

## [0.8.2] - 2026-05-27

### Added
- Drag-to-reorder for the bottom sections.

## [0.8.1] - 2026-05-27

### Added
- **Pixel Playground**: a canvas drawing surface with line, rectangle, ellipse,
  fill, and eyedropper tools, a 3-column layout, and an icon toolbar, backed by
  a pure brush-stamp library.

### Fixed
- Clamp the active color when ramps shrink so strokes aren't silently lost.

## [0.8.0] - 2026-05-27

### Added
- **Curve editor**: a `RampAdvancedPanel` with side-by-side lightness and
  saturation `CurveEditor`s (Catmull-Rom interpolation, draggable anchors,
  preset chips). Per-ramp curves are saved and included in undo snapshots.

### Changed
- `CurvePreset` replaced with explicit `CurvePoints`.

### Fixed
- Export panel defaults to closed; curve state cleared on reset.

## [0.7.3] - 2026-05-27

### Fixed
- Restored jitter reshuffle for the perceptual engine.

## [0.7.2] - 2026-05-27

### Fixed
- Cross-ramp dedup in the mosaic; per-ramp curve and gamut settings included in
  the working snapshot.

## [0.7.1] - 2026-05-27

### Fixed
- Updater detects the Tauri NSIS per-user install path as installed.

## [0.7.0] - 2026-05-27

### Added
- Native Save As dialogs; Hardware Lock grouping (UI polish batch).

### Removed
- Legacy HSV engine and its migration code.

### Changed
- Vitest wired into CI; `workflow_dispatch` added to the release workflow.

## [0.6.0] - 2026-05-26

### Added
- **Perceptual OKLCH ramp engine**: `generateRamp` built on OKLab/OKLCH
  conversion, ΔE_OK perceptual distance, and gamut mapping
  (auto / clip / chroma-preserve). Per-ramp Advanced disclosure exposes curve
  and gamut controls. Identical hexes are deduped across viz, export, and copy.
  Legacy `hsv-legacy` → `oklch-v1` migration helpers and a migration banner ship
  alongside. Vitest added for unit testing.

### Changed
- Hardware Lock ΔE_OK snapping gated on `engineVersion`.

## [0.5.10] - 2026-05-26

### Added
- Expand/collapse chevron on the ramp header.

### Fixed
- Neutral-theme legibility for the theme switcher, CVD buttons, and ramp export
  label; reset Slot A to "working" instead of null.

## [0.5.9] - 2026-05-26

### Added
- Portable-build update popup; restored installer auto-update. Claude Code
  GitHub Action wired in for `@claude` mentions.

## [0.5.8] - 2026-05-25

### Added
- **Visualize & Compare** section and Harmonize modes.

## [0.5.7] - 2026-05-25

### Changed
- Hardware Lock merged into the Export row; classic palettes moved below the
  saved list.

### Fixed
- Closing the tour via X marks it seen and suppresses future auto-open.

## [0.5.6] - 2026-05-25

### Fixed
- Surface updater download errors so the UI no longer gets stuck.

## [0.5.5] - 2026-05-25

### Fixed
- Auto-updater signing.

## [0.5.4] - 2026-05-25

### Fixed
- Regenerated the update signing keypair (no-password key) so the bundled
  public key matches release signatures; removed the BOM from `tauri.conf.json`.

## [0.5.3] - 2026-05-25

### Added
- AI input populated with the generated subject after "Surprise Me".

## [0.5.2] - 2026-05-25

### Fixed
- Replaced garbled Unicode characters (arrow, bullet, checkmark) in `App.tsx`.

## [0.5.1] - 2026-05-25

### Added
- Screenshot, provider API-key placeholders, and GitHub metadata; comprehensive
  README rewrite and a LICENSE file.

### Fixed
- Garbled checkmark in the harmony "swatch added" overlay.

## [0.5.0] - 2026-05-25

### Changed
- **Rewrote the desktop shell from Electron to Tauri v2.** Full Rust scaffold
  with plugin wiring, AI-config storage in the OS keychain (`keyring` crate),
  a native HTTP proxy to bypass CORS for blocked providers, the updater public
  key in `tauri.conf.json`, and CI/release workflows rebuilt for Tauri.

### Removed
- Electron source files and dependencies.

## [0.4.0] - 2026-05-25

### Added
- First **guided tour**: a `TourPanel` onboarding flow with pulse-glow
  highlights, first-launch detection, and auto-advance.

## [0.3.8] - 2026-05-24

### Fixed
- Pass `--publish never` directly to electron-builder in CI.

## [0.3.7] - 2026-05-24

### Fixed
- Set `ELECTRON_BUILDER_PUBLISH=never` to prevent a publish error when no token
  is present.

## [0.3.6] - 2026-05-24

### Added
- User-controlled update prompt with skip / later / install options.

## [0.3.5] - 2026-05-24

### Added
- Export rows consolidated into a collapsible card with version/date display.

### Fixed
- Stop electron-builder from auto-publishing draft releases.

## [0.3.4] - 2026-05-24

### Fixed
- Auto-update filename mismatch; dropped the portable build target.

## [0.3.3] - 2026-05-24

### Changed
- Wired electron-log into the updater to surface errors.

## [0.3.2] - 2026-05-24

### Fixed
- "Copied!" swatch overlay font size now fits the 48px swatch.
- Vaporwave grid lines use pixel stops instead of percentages to avoid
  sub-pixel rendering.

## [0.3.1] - 2026-05-24

> `0.3.0` was bumped in `package.json` but never tagged or released.

### Added
- Auto-update via electron-updater, publishing to GitHub Releases.
- Collapsible harmony and tips sections, a hardware-lock picker, and export /
  hardware-lock rendered as full-width cards matching the section layout.

## [0.2.0] - 2026-05-24

### Added
- Initial public release: a color palette generator for pixel art, packaged as
  an Electron desktop app.

[Unreleased]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.25.0...HEAD
[0.25.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.8.5...v0.9.0
[0.8.5]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.7.3...v0.8.0
[0.7.3]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.10...v0.6.0
[0.5.10]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.9...v0.5.10
[0.5.9]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.8...v0.5.9
[0.5.8]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.7...v0.5.8
[0.5.7]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.8...v0.4.0
[0.3.8]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.7...v0.3.8
[0.3.7]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/tito13kfm/pixel-pal-app/compare/v0.2.0...v0.3.1
[0.2.0]: https://github.com/tito13kfm/pixel-pal-app/releases/tag/v0.2.0
