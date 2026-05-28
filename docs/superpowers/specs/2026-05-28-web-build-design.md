# Hosted Browser Build (GH Pages) — Design

**Status:** Spec
**Date:** 2026-05-28
**Author:** Tim Kurash (designed via Claude Opus 4.7)

## Goal

Ship pixel.pal as a hosted browser app on every tagged release, alongside the existing Tauri desktop builds. Removes the unsigned-exe trust barrier when sharing the tool with others. Web is the trust onramp; desktop stays the power-user destination.

## Non-Goals

- Replacing the desktop build. Desktop continues.
- 100% feature parity. Provider list and storage are intentionally degraded.
- Backend proxy. App stays 100% client-side; user brings own API key.
- Authentication, user accounts, server-side palette sync.

## Constraints

- ESM project, Tauri v2 desktop (CLAUDE.md still says Electron — stale).
- `vite.config.ts` currently uses `base: './'` for Tauri file:// loading. Web build needs `/pixel-pal-app/` (or `/` for custom domain).
- Same git repo, same `src/`, same `index.html`. No fork, no separate package.
- Tauri APIs imported statically in `tauri-bridge.ts` and `ai.ts` — must not crash browser at import time, and should tree-shake out of the web bundle.

## Architecture

Single codebase, two build targets:

| Target  | Command                | base path           | env                       |
|---------|------------------------|---------------------|---------------------------|
| Desktop | `npm run dist`         | `./`                | `VITE_WEB=false` (default) |
| Web     | `npm run build:web`    | `/pixel-pal-app/`   | `VITE_WEB=true`           |

`vite.config.ts` reads `process.env.VITE_BUILD_TARGET` and branches `base` and `define`. `import.meta.env.VITE_WEB` is the single build-time flag consumed by app code.

Runtime gates (`window.__TAURI_INTERNALS__` checks) remain the source of truth for "am I in a Tauri window right now". `VITE_WEB` is only for build-time decisions (UI hiding, provider-list filtering, tree-shaking).

## Hosting

- **Target:** GitHub Pages, default org subdomain `https://tito13kfm.github.io/pixel-pal-app/`
- **Deploy trigger:** push of `v*` tag (matches existing desktop release cadence)
- **One-time repo setup:** Settings → Pages → Source = "GitHub Actions" (UI step, not in code)
- **Custom domain:** out of scope for this spec; if added later, `base` becomes `/` and the URL in the desktop footer link updates.

## Feature Parity

### Kept

- All input modes (hex, image upload/paste, eyedropper)
- All output controls (ramps, contrast styles, per-ramp HSV/sat/shade controls, pins, hide, shuffle, lock)
- Harmonize, Hardware Lock (all 5 hardware palettes), color harmony derivation
- All views (mosaic, lightness strip, polar plot, sprite previews, comparison)
- Accessibility tools (WCAG contrast, CVD simulation)
- Up to 100 palettes in localStorage, 20-entry undo/redo session history
- Curve editor, Playground, Piskel import
- Theme persistence (Dark/Neutral/Light)
- Export: plain text, GIMP `.gpl` (Punchy/Balanced/Muted)

### Dropped or degraded

| Feature                       | Web behavior                                                                 |
|-------------------------------|------------------------------------------------------------------------------|
| Native Save As dialog          | Browser anchor-tag download to user's Downloads folder (existing fallback)   |
| Per-file-type "last folder"   | Internal to `tauriSave()`, never reached in web (no UI change needed)         |
| OS-keychain AI key storage    | localStorage plaintext + one-time dismissable warning banner                  |
| Auto-update                   | Implicitly N/A (browser auto-loads latest deploy on refresh)                  |
| Anthropic provider             | Removed from dropdown (no CORS support)                                      |
| Ollama provider                | Removed from dropdown (https → http mixed-content blocked)                   |
| Custom provider                | Kept, but warns at config time: "CORS depends on your endpoint"              |

### CORS verified (2026-05-28)

Preflight tests from `Origin: https://tito13kfm.github.io`:

| Provider   | Access-Control-Allow-Origin | Status |
|------------|------------------------------|--------|
| OpenAI     | echoes Origin                 | ✅ OK  |
| xAI        | `*`                           | ✅ OK  |
| Gemini     | echoes Origin                 | ✅ OK  |
| OpenRouter | `*`                           | ✅ OK  |
| Anthropic  | absent (400)                  | ❌ drop|
| Ollama     | localhost http, not testable   | ❌ drop|

## Components

### New files

- `.github/workflows/deploy-web.yml` — on `v*` tag: checkout, `npm ci`, run unit + web e2e tests, `npm run build:web`, `actions/upload-pages-artifact`, `actions/deploy-pages`
- `src/lib/env.ts` — exports `IS_WEB = import.meta.env.VITE_WEB === true` and `isTauri()` helper (centralizes the existing inline `__TAURI_INTERNALS__` check)
- `src/components/WebKeyWarning.tsx` — dismissable banner above API key input in `AISettingsPanel`; dismiss flag persisted to localStorage key `webKeyWarningDismissed`
- `src/components/DesktopAppLink.tsx` — footer link to GitHub releases page (rendered only when `IS_WEB`)
- `tests/unit/provider-filter.test.ts` — vitest, asserts web filter drops `anthropic` and `ollama`
- `tests/unit/provider-migration.test.ts` — vitest, asserts stale-saved-provider guard resets to `openai`, preserves key
- `tests/e2e/web-build.spec.ts` — Playwright, runs against `vite preview` of web build

### Modified files

| File                              | Change                                                                                                                 |
|-----------------------------------|------------------------------------------------------------------------------------------------------------------------|
| `vite.config.ts`                  | Read `VITE_BUILD_TARGET`; branch `base` and `define: { 'import.meta.env.VITE_WEB': '...' }`                            |
| `package.json`                    | Add `"build:web": "cross-env VITE_BUILD_TARGET=web tsc --noEmit && vite build"`; add `cross-env` devDep                |
| `src/main.tsx`                    | Convert static `import { initTauriBridge }` to dynamic gated import; warn if module loads without `__TAURI_INTERNALS__` |
| `src/lib/ai.ts`                   | Convert static `import { fetch as tauriFetch }` to dynamic gated import; filter `PROVIDER_PRESETS` by `IS_WEB`         |
| `src/settings/AISettingsPanel.tsx`| Render `<WebKeyWarning>` when `IS_WEB`; on mount, if saved `provider` not in (web-filtered) list, reset to `openai` + show inline notice; when `IS_WEB && provider === 'custom'`, render inline hint below base-URL field: "Note: browser CORS may block your endpoint. If requests fail, use the desktop app." |
| `src/App.tsx`                     | Render `<DesktopAppLink>` in footer when `IS_WEB`                                                                       |
| `.github/workflows/ci.yml`        | Add `npm run build:web` step alongside existing `npm run build`                                                         |
| `CLAUDE.md`                       | Update stale "Electron 42" reference to "Tauri v2"; add web-build section (commands, deploy trigger, web-only constraints) |

## Data Flow

### Build pipeline (web)

```
git tag v0.x.y → git push --tags
  → .github/workflows/deploy-web.yml triggers
    → checkout → npm ci
    → npm run test:unit (vitest)
    → npm run build:web → dist/
    → npm run test:e2e -- web-build.spec.ts (against vite preview of dist/)
    → actions/upload-pages-artifact (dist/)
    → actions/deploy-pages
  → https://tito13kfm.github.io/pixel-pal-app/ live
```

Any failure aborts deploy; last successful build stays live.

### Runtime (browser, hosted)

```
GET https://tito13kfm.github.io/pixel-pal-app/
  → index.html → main.tsx
  → window.__TAURI_INTERNALS__ undefined → dynamic-import gate skipped, no tauri-bridge loaded
  → App.tsx mounts, loadAIConfigAsync() → window.electronAPI undefined → loadAIConfig() (localStorage)
  → AISettingsPanel opens
    → PROVIDER_PRESETS filtered (web): drops anthropic, ollama
    → if saved.provider not in filtered list → reset to 'openai', show notice
    → first-time: <WebKeyWarning> banner renders above API key input
    → on save: saveAIConfig() → localStorage AI_CONFIG_KEY
  → AI call: client.chat.completions.create
    → fetch: __TAURI_INTERNALS__ undefined → globalThis.fetch (browser-direct, CORS-allowed by verified providers)
    → response → AIResponse
  → palette saved → localStorage (existing path)
  → export .txt/.gpl → save-file.ts isTauri() false → browserFallback() → anchor click → user's Downloads
  → footer: <DesktopAppLink> visible → opens https://github.com/tito13kfm/pixel-pal-app/releases
```

### State boundaries (web)

- localStorage keys: `AI_CONFIG_KEY`, palette list, theme, `webKeyWarningDismissed`
- No Tauri store, no Rust IPC, no OS keychain, no `electronAPI` global
- In-memory: session history (undo/redo), pending AI request

## Error Handling

### Build / deploy

- `tsc --noEmit` failure → workflow fails before vite, no deploy
- `vite build` failure → workflow fails, no deploy
- Unit or e2e test failure → workflow fails, no deploy
- GH Actions step failure → tag exists, no site update, red X on commit

### CORS rejection on AI call (custom endpoint, or future provider regression)

- Browser CORS reject surfaces as `TypeError: Failed to fetch` (opaque)
- `ai.ts` catches, surfaces: "Provider blocked browser request. Try OpenAI / xAI / Gemini / OpenRouter, or use the desktop app for other providers."
- Existing AI-error UI path reused (same UI that handles 401, 429, etc.)

### Saved provider not in web list

- On `AISettingsPanel` mount: detect, set `provider = 'openai'`, surface inline notice: "Anthropic / Ollama unavailable in browser. Switched to OpenAI."
- API key field preserved (user may want it for desktop, or paste new)
- Save not auto-triggered; user must click Save to persist the reset

### localStorage quota exceeded

- Existing path unchanged. 100-palette cap stays well below browser limits.

### Tauri shim accidentally loaded in web (regression guard)

- `main.tsx` dynamic-import gate prevents this on the main path. If a future edit re-introduces a static Tauri import, the inner `__TAURI_INTERNALS__` checks still no-op all calls. Worst case: dead code in the bundle.
- Add `console.warn` if `tauri-bridge` module ever loads when `__TAURI_INTERNALS__` is undefined.

### Bad release deploys broken build

- Mitigation: workflow runs unit + web e2e tests before deploy step.
- If broken build does reach prod: revert by tagging the previous good version `v-rollback-N` and pushing, or re-running the workflow against the prior tag via `workflow_dispatch`.

## Testing

### Vitest unit (new)

- `provider-filter.test.ts` — asserts web filter drops `anthropic` and `ollama`, keeps OpenAI, xAI, Gemini, OpenRouter, custom
- `provider-migration.test.ts` — given a saved AIConfig with `provider: 'anthropic'`, when web build mounts `AISettingsPanel`, asserts provider resets to `openai` and key is preserved

### Existing JS unit tests (`tests/test_*.js`)

Unchanged. Color-math regression coverage.

### Playwright e2e (new)

- `tests/e2e/web-build.spec.ts` runs against `npm run build:web && vite preview`:
  - App loads at the configured base path, no console errors
  - AI settings panel: Anthropic and Ollama absent from `<select>` options
  - WebKeyWarning banner renders on first open of settings; dismiss persists across reload
  - Footer "Get desktop app" link present, href = releases URL
  - Save palette → `.txt` download triggers (`expect(download.suggestedFilename()).toMatch(/\.txt$/)`)
  - localStorage palettes survive page reload

### Existing Playwright e2e

`app.spec.ts`, `ai-settings.spec.ts` continue to run against the Tauri/dev build. The new web spec runs only against the web preview.

### CI

- `.github/workflows/ci.yml`: adds `npm run build:web` step alongside the existing `npm run build` step. Runs on every push and PR.
- `.github/workflows/deploy-web.yml`: runs unit tests + web e2e before the deploy step. Triggered only by `v*` tag push (and `workflow_dispatch` for rollback).

### Manual smoke (one-time, before first prod deploy)

- Deploy from feature branch via `workflow_dispatch`
- Hit each verified provider (OpenAI, xAI, Gemini, OpenRouter) with a low-quota real key from the hosted URL
- Confirm Anthropic and Ollama absent from dropdown
- Confirm no console errors in Chromium, Firefox, Safari (CORS preflight occasionally differs)
- Confirm `.gpl` export downloads correctly

## Out of Scope

- Custom domain. If added later, `base` config and `DesktopAppLink` URL update.
- Backend proxy for Anthropic / Ollama. Possible future work; would require hosting beyond static GH Pages.
- PWA / offline install. Trust ladder targets the "open URL once, see it work" use case, not repeat offline use (desktop covers that).
- Palette sync across devices. Out of scope; localStorage is per-browser-profile.
- Bundle-size budget. Worth checking post-impl; not blocking for v1.

## Open Questions

None known after CORS verification. Implementation plan should re-verify Tauri-import tree-shaking when the dynamic-import refactor lands.
