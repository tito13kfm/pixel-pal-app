# PIXEL.PAL: Project Context

Pixel art palette generator. Vite 8 + React 19 + TS 6, packaged as Tauri v2 desktop. Also hosted as a static browser build on GitHub Pages.
Multi-provider AI, user brings own key. Ported from 7820-line Claude artifact (`tests/pixel-pal.tsx`).

---

## Feature Inventory

**Input modes:** single hex color, image upload/paste (extracts 3-6 colors,
eyedropper with 8x zoom), AI Assist (text prompt to language model)

**Output:** 4-8 shade ramps, 3 contrast styles per ramp (Punchy, Balanced,
Muted), pixel-art slot labels (outline/shadow/base/highlight/bright)

**Per-ramp controls:** HSV sliders, saturation multiplier, shade count
override, per-shade pins (lock to custom hex), hide shades, shuffle, lock
ramp from global ops

**Global tools:** Harmonize (rotate unlocked ramps to color-theory positions
relative to anchor), Hardware Lock snaps all shades to nearest legal color
(NES, Game Boy DMG, CGA 16, EGA 64, C64), color harmony derivation
(complementary, analogous, triadic, split-complementary, tetradic, square)

**Views:** Mosaic, lightness distribution strip, chromatic polar plot,
sprite previews (4 built-in 32x32 sprites, Piskel import), side-by-side
palette comparison

**Accessibility:** WCAG contrast check with Compare Mode picker, CVD
simulation (protanopia, deuteranopia, tritanopia)

**State:** up to 100 palettes in localStorage, 20-entry session history
(undo/redo/jump). Theme persists via Tauri plugin-store (desktop) or
localStorage (web).

**Export:** plain text, GIMP .gpl (Punchy/Balanced/Muted selectable)

---

## Commands

```powershell
npm run tauri:dev      # dev (Vite + Tauri window)
npm run dev            # web only (plain browser, no Tauri)
npm run build          # tsc --noEmit + vite build (desktop assets)
npm run build:web      # web build for GH Pages (base: /pixel-pal-app/)
npm run dist           # release build (Tauri) → src-tauri/target/release/
npm test               # vitest unit suite
npm run test:e2e       # Playwright (desktop dev server)
```

Run the web e2e suite separately:

```powershell
npm run build:web
npx playwright test --config=playwright.web.config.ts
```

JS unit tests in `tests/test_*.js` (legacy, parsed via vm sandbox) run individually:

```powershell
foreach ($f in Get-ChildItem tests\test_*.js) { node $f }
```

---

## Architecture

**Web build target:** Vite → `dist/`. `base: './'` for Tauri (file:// loading)
or `/pixel-pal-app/` for GH Pages, branched on `VITE_BUILD_TARGET=web` in
`vite.config.ts`. Do not flatten that branch.

**Desktop runtime:** Tauri v2. Rust shell in `src-tauri/`. Window management,
secure AI-config storage (OS keychain via `keyring` crate), native Save As
dialogs (plugin-dialog), HTTP proxy for CORS-blocked providers
(plugin-http). All AI calls run in the renderer; user's own key,
`dangerouslyAllowBrowser: true` is safe.

**Web runtime:** plain browser. `window.__TAURI_INTERNALS__` is undefined.
All Tauri imports are dynamic and gated on that check (`src/main.tsx`,
`src/lib/ai.ts` for `tauriFetch`). Tree-shaker drops the Tauri runtime
from the web bundle.

**Persistence:** Tauri plugin-store for desktop settings (AI config,
last-folder), localStorage for palette list, theme, and (web-only)
AI key. `window.storage` shim in `src/App.tsx` bridges the artifact's
async storage API to localStorage. Do not remove.

---

## File Map

```
src/
  App.tsx               ~7200 lines, // @ts-nocheck intentional
  main.tsx              entry; dynamic-imports Tauri bridge when in Tauri
  settings/
    AISettingsPanel.tsx provider selector, base URL, key, model
  components/
    WebKeyWarning.tsx   web-only: localStorage key-storage banner
    DesktopAppLink.tsx  web-only: footer link to releases page
  lib/
    ai.ts               multi-provider OpenAI-compat client, provider filter
    color.ts            15 color math fns, // @ts-nocheck intentional
    constants.ts        WORD_POOL, sprites, CLASSIC_PALETTES, HARDWARE_PALETTES
    env.ts              IS_WEB build-time flag, isTauri() runtime check
    palette.ts          AIConfig, SavedPalettePayload, localStorage helpers
    save-file.ts        polymorphic save (Tauri native dialog OR browser anchor)
    tauri-bridge.ts     Tauri IPC, updater, plugin-store
  vite-env.d.ts

src-tauri/
  src/                  Rust shell: main.rs, lib.rs, command handlers
  Cargo.toml, Cargo.lock
  tauri.conf.json       Tauri config (window, bundle, updater)

tests/
  pixel-pal.tsx         source artifact; JS tests parse this, do not modify
  extract.js            text-extracts const-arrow fns by name
  test_*.js             34 unit tests, each reads pixel-pal.tsx via fs + vm sandbox
  package.json          {"type":"commonjs"} (CJS isolation from root ESM)
  unit/                 vitest unit tests (.spec.ts)
  e2e/
    app.spec.ts          Playwright: app load, palette ops
    ai-settings.spec.ts  Playwright: AI settings panel
    web-build.spec.ts    Playwright: web build (vite preview at :4173)

scripts/
  verify_color_extraction.js  checks color.ts fns match pixel-pal.tsx verbatim
  package.json               {"type":"commonjs"}

.github/workflows/
  ci.yml                push/PR → tsc, vitest, Playwright (desktop + web)
  release.yml           v* tags → Tauri 3-platform matrix + GitHub Release
  deploy-web.yml        v* tags → build:web + GH Pages deploy
```

---

## Critical Constraints

**ESM project.** `"type": "module"` in package.json. Config files: `export default`,
never `module.exports`. Affects tailwind.config.js, postcss.config.js,
vite.config.ts, playwright.config.ts, playwright.web.config.ts.

**`// @ts-nocheck` in `color.ts` and `App.tsx` is intentional.** `color.ts`
functions extracted verbatim from artifact; type annotations break the verify
script. Do not remove.

**`tests/package.json` and `scripts/package.json` contain `{"type":"commonjs"}`.** 
Scopes CJS to those dirs without touching root ESM. Do not delete.

**Web build runtime is plain browser, not Tauri.** `window.__TAURI_INTERNALS__`
is undefined. All Tauri imports must be dynamic, gated behind that check
(`main.tsx`, `lib/ai.ts`). Static Tauri imports will bloat the bundle and
may defeat tree-shaking. The `IS_WEB` build-time flag (from `src/lib/env.ts`)
drives provider filtering, key-warning banner, and the desktop-app footer
link; runtime checks (`isTauri()` / `__TAURI_INTERNALS__`) drive
storage / dialog / IPC fallbacks.

**`base: '/pixel-pal-app/'` for web, `'./'` for Tauri.** `vite.config.ts`
branches on `VITE_BUILD_TARGET=web`. Custom domain would change web base to `/`.

**Anthropic and Ollama are filtered out of the web provider dropdown.**
Anthropic: CORS blocked. Ollama: https→http mixed-content blocked.
A saved AIConfig with either provider auto-migrates to OpenAI defaults
on first web load (`migrateStaleProvider` in `src/lib/ai.ts`).

---

## AI Client (`src/lib/ai.ts`)

Uses `ChatCompletionCreateParamsNonStreaming` from `'openai/resources/chat/completions'`.
Generic `Parameters<typeof client.chat.completions.create>[0]` does not work in
openai SDK v6 (wrong overload, TS2339 on `.choices`).

Anthropic endpoints skip `response_format: { type: 'json_object' }` (unsupported).
All other providers get it.

Response schema: `{ colors: [{hex, name}], description }` → `AIResponse { colors: string[], names: string[], description: string }`.

`tauriFetch` is dynamically imported and cached via `loadTauriFetch()`; in
Tauri windows it's preloaded from `main.tsx` via `ensureTauriFetchLoaded()`.
In browser, `_tauriFetch` stays null and the OpenAI SDK uses `globalThis.fetch`.

---

## Playwright Gotchas

- Use `toBeAttached()` / `not.toBeAttached()` for conditionally rendered
  elements, not `toBeVisible()`: removed DOM nodes aren't visible OR attached.
- `getByTitle()` needs exact title text: `getByTitle('Light: off-white background')`,
  not `getByTitle('Light')`.
- Ambiguous button selectors: add `{ exact: true }`.
- `vite preview` for the web build MUST be invoked with `--base /pixel-pal-app/`;
  otherwise SPA fallback returns `index.html` for `/pixel-pal-app/assets/*.js`,
  the JS bundle never loads, and every selector times out. The
  `playwright.web.config.ts` `webServer.command` already does this.
- AI Settings button (`[title="AI Settings"]`) is only present after switching
  to AI mode. Click the AI tab first.

---

## Known Issues / Deferred

- **No custom icon**: default Tauri icon. Need 256x256 icon set in
  `src-tauri/icons/` before customizing the bundle.
- **GitHub remote set** at `github.com/tito13kfm/pixel-pal-app`, branch `master`.
- **GH Pages source must be set to "GitHub Actions"** under repo Settings →
  Pages before the first `deploy-web.yml` run; otherwise the deploy step
  produces a 404. One-time UI step; not code.

---

## Tailwind

v3 not v4. PostCSS integration (tailwind.config.js + postcss.config.js). No
Tailwind plugin in vite.config.ts. Three `@tailwind` directives in
src/index.css. Do not upgrade to v4 without config rework.

---

## Bug Report Protocol

When user reports anything broken, wrong, or missing — **run these three tool calls before writing any response text:**

1. `git log --oneline <base>..HEAD` — see what changed
2. `git diff <base>..HEAD -- <relevant-file>` — see exactly what the branch changed
3. Read the file if diff isn't enough

Only then write a response, grounded in what the code actually shows.

**Never write before completing those steps:**
- "can you share the error"
- "is it possible this was pre-existing"
- "have you tried"
- anything that redirects toward user error

User is the source of truth on what they see. Code is the source of truth on why. Investigate the code.
