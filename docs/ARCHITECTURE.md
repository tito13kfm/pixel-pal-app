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
