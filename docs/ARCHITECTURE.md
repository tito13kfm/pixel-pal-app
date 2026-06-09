# PIXEL.PAL — Architecture Reference

On-demand reference for `CLAUDE.md`. Read the relevant section before working in
that area. CLAUDE.md keeps only the always-relevant constraints + terse landmine
warnings; the detail lives here.

---

## File Map

```
src/
  App.tsx               the god-component (// @ts-nocheck intentional). Being
                        decomposed: pure helpers → lib/ (Tier A, done), domain
                        state → hooks/ (Tier B), JSX → components (Tier C).
  main.tsx              entry; dynamic-imports Tauri bridge when in Tauri
  settings/
    AISettingsPanel.tsx provider selector, base URL, key, model
  components/
    WebKeyWarning.tsx   web-only: localStorage key-storage banner
    DesktopAppLink.tsx  web-only: footer link to releases page
    AdjacencyMatrix.tsx viz: pairwise ΔE_OK heatmap (canvas + hover readout)
    DitherBlend.tsx     viz: 2-color dither-blend preview (canvas)
    CurveEditor.tsx     SVG lightness/sat curve editor (drag anchors, presets)
    RampAdvancedPanel.tsx per-ramp Advanced disclosure: 2 CurveEditors + gamut
    PixelPlayground.tsx pixel drawing canvas (line/rect/ellipse/fill/eyedropper)
    TourOverlay.tsx     spotlight tour overlay (portal, SVG cutout, popover)
    TourPanel.tsx       help-center launcher modal
  hooks/                Tier B domain hooks (useDisplaySettings, useVizSettings,
                        useExportSettings, useTour, useSpriteImport, useAIAssist,
                        useImageExtract, useImageRemap, useSideBySide,
                        useSavedPalettes, usePanelLayout, useUpdater, …)
  lib/
    ai.ts               multi-provider OpenAI-compat client, provider filter
    color.ts            15 color math fns, // @ts-nocheck intentional
    oklch.ts            OKLab/OKLCH conversion, ΔE_OK distance, gamut mapping
    ramp-engine.ts      perceptual base-anchored generateRamp (reach/chroma falloff)
    curve.ts            Catmull-Rom evalCurve, curve presets
    hex-utils.ts        dedupeHexes
    pixel-brush.ts      pure brush-stamp library (Playground)
    viz-interaction.ts  adjacency-matrix metric + dither pattern logic
    strip-export.ts     flat-color PNG renderers + computeVizData (all 4 viz exports)
    tours.ts            tour step data + interactive guides
    tour-runtime.ts     tour geometry helpers (cutout + popover placement)
    constants.ts        WORD_POOL, sprites, CLASSIC_PALETTES, HARDWARE_PALETTES
    env.ts              IS_WEB build-time flag, isTauri() runtime check
    palette.ts          AIConfig, SavedPalettePayload, localStorage helpers
    save-file.ts        polymorphic save (Tauri native dialog OR browser anchor)
    tauri-bridge.ts     Tauri IPC, updater, plugin-store
    history-snapshot.ts pure inferLabel + SNAPSHOT_FIELDS (undo-history kernel)
    snapshot-ramps.ts   buildRampsForSnapshot (RampSnapshot → rendered ramps)
  vite-env.d.ts         incl. global Window.storage type

src-tauri/
  src/                  Rust shell: main.rs, lib.rs, command handlers
  Cargo.toml, Cargo.lock
  tauri.conf.json       Tauri config (window, bundle, updater)

tests/
  # LOCAL-ONLY dev files (gitignored, NOT in origin, absent on fresh clones;
  # absence is expected, not deletion — see the dev-environment memory note):
  pixel-pal.tsx         source artifact; legacy JS tests parse it, do not modify
  extract.js            text-extracts const-arrow fns by name
  test_*.js             legacy unit tests (read pixel-pal.tsx via fs + vm sandbox)
  package.json          {"type":"commonjs"} (CJS isolation from root ESM)
  # tracked (in origin, run in CI):
  test_contrast.js      WCAG AA contrast lint
  test_curve.ts         curve math unit test (run via npx tsx)
  unit/                 vitest unit tests (.spec.ts)
  e2e/                  Playwright: app.spec.ts, ai-settings.spec.ts, web-build.spec.ts

scripts/
  sync-tauri-version.mjs    TRACKED: syncs Cargo.toml/.lock + tauri.conf.json to
                            package.json version; wired into `npm version`
  verify_color_extraction.js  LOCAL-ONLY: checks color.ts matches pixel-pal.tsx
  package.json              LOCAL-ONLY: {"type":"commonjs"}

.github/workflows/
  ci.yml                push/PR → tsc, vitest, Playwright (desktop + web)
  release.yml           v* tags → Tauri 3-platform matrix + GitHub Release
  deploy-web.yml        v* tags → build:web + GH Pages deploy
```

---

## AI Client (`src/lib/ai.ts`)

- Uses `ChatCompletionCreateParamsNonStreaming` from `'openai/resources/chat/completions'`.
  Generic `Parameters<typeof client.chat.completions.create>[0]` does NOT work in
  openai SDK v6 (wrong overload, TS2339 on `.choices`).
- Anthropic endpoints skip `response_format: { type: 'json_object' }` (unsupported);
  all other providers get it.
- Response schema: `{ colors: [{hex, name}], description }` →
  `AIResponse { colors: string[], names: string[], description: string }`.
- `tauriFetch` is dynamically imported + cached via `loadTauriFetch()`; in Tauri
  windows it's preloaded from `main.tsx` via `ensureTauriFetchLoaded()`. In browser,
  `_tauriFetch` stays null and the OpenAI SDK uses `globalThis.fetch`.
- Anthropic + Ollama are filtered out of the web provider dropdown (Anthropic: CORS
  blocked; Ollama: https→http mixed-content). A saved AIConfig with either
  auto-migrates to OpenAI defaults on first web load (`migrateStaleProvider`).

---

## Playwright Gotchas

- Use `toBeAttached()` / `not.toBeAttached()` for conditionally rendered elements,
  NOT `toBeVisible()`: removed DOM nodes aren't visible OR attached.
- `getByTitle()` needs exact title text: `getByTitle('Light: off-white background')`,
  not `getByTitle('Light')`. Ambiguous button selectors: add `{ exact: true }`.
- `vite preview` for the web build MUST use `--base /pixel-pal-app/`; otherwise SPA
  fallback returns `index.html` for `/pixel-pal-app/assets/*.js`, the bundle never
  loads, and every selector times out. `playwright.web.config.ts` already does this.
- The AI Settings button (`[title="AI Settings"]`) only exists after switching to AI
  mode — click the AI tab first.

---

## Cross-cutting state-maintenance rules (App.tsx wiring)

`App.tsx` is the **wiring layer**: domain state lives in `hooks/`, the ramp pipeline
in `lib/`, but orchestration stays here — handlers, the JSX tree, the inline
`PixelSprite` / `Swatch` / `HarmonySwatch` components, the `window.storage` shim, and
the `themeTokens` map. `@ts-nocheck` means grep is the only gate (see the
`app-tsx-quirks` note). The file is mid-decomposition (Tier C is extracting JSX
panels), so verify current structure before relying on it.

Invariants that must hold across edits:

1. **`resetPaletteState` is the shared wipe for all 8 full-palette-replace paths**
   (New palette, AI generate, Surprise Me, image extract / re-extract, load saved,
   load classic, GPL import). It clears every per-ramp customization layer
   (overrides/pins, harmony anchor, size + sat overrides, per-ramp hue, hidden,
   shuffle offsets, locks, collapsed, curves, side-by-side slots, remap output) and
   resets `hueShiftStrength = 1.0`. Callers separately set `baseColors`, tag history
   via `tagNextLabel`, and bump the seed. **Add any new base-keyed or per-palette
   state's setter here**, or the 8 paths leak stale state.
2. **Hard-reset paths call `setShuffleSeed(s => s + 1)` directly, NOT
   `bumpShuffleSeed()`.** `bumpShuffleSeed` reads the *old* `lockedRamps` closure; on a
   render where reset just cleared locks in the same batch it would take the wrong
   (lock-aware) branch. Lock-aware paths (Generate non-reset, eyedropper-add) use
   `bumpShuffleSeed`, which re-jitters only unlocked ramps when anything is locked.
3. **`removeRamp` / `duplicateRamp` / `reorderRamps` must re-key every base-indexed
   structure.** Drop / shift / permute across `overrides`, `rampSizeOverrides`,
   `rampSatOverrides`, `hiddenShades`, `rampShuffleOffsets`,
   `hueShiftStrengthPerRamp`, `lightnessCurvePerRamp`, `satCurvePerRamp`,
   `gamutPerRamp`, the Sets `lockedRamps` / `collapsedRamps`, plus `editingIndex` /
   `pinEditor` / `compareAnchor` / `harmonyAnchor`. `reorderRamps` does this via
   `permuteRampState` + `permuteStringKeyMap` (`gamutPerRamp` is permuted separately
   in App.tsx since the hook does not own it). Miss one and pins / locks attach to the
   wrong ramp.
4. **Live ↔ snapshot ramp mirror (the #30 invariant).** Live ramps: App.tsx
   synthesizes `liveRampSnapshot` from state and calls `buildRamp(snapshot, style, i)`
   per base/style — the SAME function `buildRampsForSnapshot` (compare / export / PNG)
   calls. Never reintroduce a second generate→pin→snap path. The live memo
   deliberately OMITS `hiddenShades` (it hides at display via the component-scope
   `filterHidden`, so memos stay full-length) and `curvePerRamp` (migrated into
   `lightnessCurvePerRamp` on load; passing it would double-apply).
5. **`labelsForRamp` repositions the `base` label onto the slot actually holding the
   input base hex.** The engine anchors the base byte-exact, but style curves can sort
   a computed shade past it; the static label table would otherwise mislabel.
   Pin / hardware-locked ramps (base hex absent from output) fall back to the static
   `shadeLabelsFor(n)` table.
6. **Three independent style selectors, none in the undo snapshot:**
   `rampExportStyle` (per-ramp Copy / Download), `vizStyle` (Visualize & Compare +
   Playground), `gplStyle` (full-palette export bar).

History (undo/redo) lives in `useHistory`: whole-state snapshots, 50-entry cap,
300 ms debounce, session-only. Its watcher dep array is the **17** snapshot INPUTS and
deliberately omits `lightnessCurvePerRamp` / `satCurvePerRamp` (preserved verbatim — do
not "complete" it to 19). `usePaletteState` owns the document core (20 snapshot fields
+ 6 editor/compare fields) and the three snapshot helpers `useHistory` consumes.

---

## Theme system (`themeTokens` in App.tsx)

Three themes: `dark` (vaporwave neon), `neutral` (18% gray reference for unbiased color
judgment), `light` (cream "Jazz cup" SVG pattern). `const t = themeTokens[theme]` is the
single token source; every chrome color / className reads from `t`. **Color DATA
(swatches, sprites, mosaic, chromatic plot) is never themed — only chrome adapts.**

- `glowStrong` (1.0 / 0.3 / 0.2) gates neon: `accentGlow` / `accentTextGlow` return
  `'none'` when < 0.5. Many call sites branch on `t.glowStrong > 0.5` for the
  dark-vs-light treatment of a control.
- `ACCENT_MAP` maps each section-accent hex → `{ neutralText, neutralBorder, light }`.
  **Neutral inverts text vs border**: a light tint for text on the gray card, a dark
  tint for the border against the gray page. `themedAccent()` returns the text/heading
  color; `themedAccentBorder()` returns the card border. Use these (never a raw hex) for
  any chrome carrying a section accent.
- **Light theme uses a scoped `<style>` CSS-injection hack** (rendered only when
  `theme === 'light'`): it overrides hardcoded Tailwind `text-cyan-200` etc. (invisible
  on cream) to dark, with a `bg-black/` descendant carve-out that keeps text on dark
  panels light. **Neutral does NOT use this** — it is fully token-driven. Do not extend
  the CSS block for Neutral; point Neutral text at a token instead.
- CVD simulation: four SVG `feColorMatrix` filters (protan / deutan / tritan) wrap the
  main content. The header / theme / CVD selectors sit OUTSIDE the filter so they stay
  legible; floating panels (WCAG Check, GPL modal, update toast) also render outside it.

---

## Persistence & storage

`window.storage` is an async shim over `localStorage` installed at App.tsx module load
(a Tauri-native backend could swap in later — keep call sites async). Typed globally in
`vite-env.d.ts`. All persistence is `localStorage`; there is no IndexedDB.

Key inventory:

- **UI prefs** (each: load-on-mount effect + mountRef-guarded persist effect):
  `ui:theme`, `ui:cvdMode`, `ui:vizStyle`, `ui:gplStyle`, `ui:exportFormat`,
  `ui:rampExportStyle`, `ui:rampSize`, `ui:panels`, `ui:sectionOrder`, `ui:vizSubOpen`.
- **Palettes:** `palettes:{slug}` → full `SavedPalettePayload` JSON. No separate index;
  the list is rebuilt by scanning the prefix.
- **AI:** `ai:config` (web/browser only; desktop uses the OS keychain via Tauri).
- **One-shot flags:** `pixel-pal-tour-seen`, `webKeyWarningDismissed`,
  `v2EngineNoticeDismissed`.

`loadPalette` validates, clamps, and defaults **every** field (tolerates older
payloads); invalid entries are dropped, never fatal. Gates: `engineVersion !== 2` ⇒
pre-v2 save ⇒ `setV2NoticePending(true)` (one-time migration banner; saves always write
`engineVersion: 2`, so migration persists lazily on the next save). Missing
`shuffleSeed` ⇒ 0; missing `hueShiftStrength` ⇒ 1.0 (byte-identical to legacy). Legacy
`curvePerRamp` string presets migrate into `lightnessCurvePerRamp` via `presetToPoints`.
Old shared-style (non-per-style) `overrides` fail validation and are dropped
(intentional breaking change). Save snapshots the FULL `customSprites` library so a
loaded palette restores sprites it depended on. `SAVED_PALETTE_LIMIT = 100`.

---

## Image pipeline (two independent paths)

1. **Extract** (`lib/image-extract.ts`, the From Image tab): `extractDominantColors`
   (count map + HSL near-dup filter) → `quantizeToPalette` (HSL distance, hue weight
   2.0 but **fading to 0 as `min(sat) → 0` below S = 15**, so grays don't snap into a
   hue family and saturated colors don't snap to grays; lightness 1.5, sat 0.5). This is
   SEPARATE from Hardware Lock's `quantizeToHardware` (OKLCH ΔE_OK).
2. **Remap** (`lib/image-remap.ts`, Visualize & Compare → Image Preview + the
   side-by-side slots): `remapImageToPalette` snaps every pixel to the active palette.
   **Alpha policy:** α = 0 → transparent passthrough (no error in or out); α = 255 →
   remap RGB; 0 < α < 255 → composite over white, remap, write back the original α.
   Dither: `none` (uses a unique-color cache) or Floyd–Steinberg / Atkinson (¾ error,
   cleaner flats) / Stucki — error diffuses ONLY to α > 0 neighbors. The preview
   downsamples to 512 px longest axis (256 for SBS slots, which run two remaps); export
   re-runs at full resolution × scale. `computeRemapScaleOptions` caps output at
   8192 px/axis; `estimateRemapCost` warns above 50 M ops behind a 5 s two-click confirm.
   The active remap palette = current `vizStyle` ramps, hidden shades filtered, deduped
   — the same set the chromatic plot dots come from.

---

## Export & visualization

- **Single source of palette entries:** `collectPaletteEntries(style)` in App.tsx
  (every visible ramp shade + the harmony colors, deduped by hex). `buildGpl` /
  `buildJascPal` / `buildAse` (`lib/palette-export.ts`) all consume it, so the three
  file formats cannot describe different color sets (mirror rule). `.ase` is big-endian
  binary targeting **Photoshop / Illustrator / Krita, NOT Aseprite** (Aseprite users
  want `.gpl`, `.pal`, or the PNG strip). `buildAse` is byte-exact — do not reformat.
- **PNG renders** live in `lib/strip-export.ts` (off-screen canvas → Blob): lightness
  strip (markers placed by L on a 0→100 axis, so gaps read as missing tonal ranges),
  mosaic, adjacency matrix, dither-blend, palette strip. `computeVizData(ramps)` is the
  single derivation feeding both the on-screen views and the PNG exports.
- **The PNG palette strip intentionally diverges** from the `.gpl` / `.pal` / `.ase`
  files: NO dedup (one cell per shade per ramp — it is positional) and NO harmony
  colors. Do not "align" it.
- **Dither matrices** (`lib/viz-interaction.ts`): the `DITHER_PATTERNS` registry —
  Bayer 2×2 / 4×4 / 8×8 (4 / 16 / 64 levels), clustered-dot, scanline, cross-hatch.
  Adding a pattern is one matrix in the registry; it auto-wires the preview + PNG. The
  blend sweep tiles the matrix in BOTH axes (the #43 fix — keying to the column index
  alone collapsed it into vertical bands).

---

## Tour / onboarding system

Data in `lib/tours.ts`: `ONBOARDING_TOUR` (auto-fires once, gated on
`pixel-pal-tour-seen`) + `TASK_GUIDES` (seven how-to flows). Each step has a `target`
(`data-tour-id`), `advance: 'next' | 'detector'`, and optional `detector(appState)`
predicate + `setup` id. `TourOverlay.tsx` (a portal with an SVG even-odd cutout +
popover) per step: resets the detector baseline, runs `setup`, rAF-waits for the target
to mount (≤ 2 s, then degrades to a centered card + Next), captures the baseline AFTER
mount, positions via `lib/tour-runtime.ts` (floating-ui, `strategy: 'fixed'`,
viewport-clamped), and arms `autoUpdate`. It auto-advances on a detector false→true edge.
App.tsx wires `runTourSetup` (only the `export` / `harmony` panel setters),
`snapshotTourState` / `restoreTourState` (save + restore mode / panels / AI / compare
around a tour run), and feeds the live `appState`.
