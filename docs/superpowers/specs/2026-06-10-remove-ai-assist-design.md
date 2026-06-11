# Remove AI Assist (full-stack) — Design

Date: 2026-06-10
Status: Approved (brainstorming) — pending spec review
Branch: `feat/remove-ai-assist`

## Why

The AI-assisted palette generation feature draws sustained backlash from the
artistic community, and it is the most fragile surface in the app: it rarely
saves its config and frequently fails to work. It is being removed completely,
not disabled. Git history preserves the implementation if it is ever wanted back,
so a feature flag would only leave fragile dead code — rejected.

This also shrinks the app and simplifies the state surface ahead of the separate
perf/size architecture work (its own later spec).

## Scope

Hard delete of the entire AI path, frontend and backend, plus its dependencies.
The input `mode` collapses from `color | image | ai` to `color | image`.

### Frontend — delete files

- `src/lib/ai.ts` (225 lines) — provider client + CORS-proxy loader
- `src/settings/AISettingsPanel.tsx` (148) — provider/key config UI
- `src/components/WebKeyWarning.tsx` (32) — web-only "key stored in localStorage" banner (AI-only)
- `src/hooks/useAIAssist.ts` — AI state hook

### Frontend — edit `src/App.tsx`

`App.tsx` is `@ts-nocheck`, so `tsc` will NOT catch dangling references here.
Grep is the correctness gate (see Verification).

- Remove imports: `AISettingsPanel` (line 18), `useAIAssist` (line 60).
- Remove the `useAIAssist()` destructure (line 175) and its 9 state vars
  (`aiInput/setAiInput`, `aiLoading/setAiLoading`, `aiError/setAiError`,
  `showAISettings/setShowAISettings`, `aiConfigured/setAiConfigured`).
- Remove the `mode === 'ai'` UI blocks: the AI input panel and submit
  (around 4479), the result/branch render (4572), `aiReasoning` (4597),
  `aiError` (4602).
- Remove the AI option from the input mode-selector control (the button that
  sets `mode` to `'ai'`).
- Remove the `{showAISettings && <AISettingsPanel ... />}` render (line 5180)
  and its `handleAISettingsClose` handler if it has no other use.
- Any AI-generation handler bodies (the call into `ai.ts`) go with the above.

### Frontend — edit `src/lib/tours.ts`

- Remove the tour step whose `detector` is `(s) => s.mode === 'ai'` (line 113),
  and any AI-settings tour step. Renumber/relink remaining steps as needed so the
  tour still flows.

### Frontend — keep (NOT AI-dependent)

- `src/components/DesktopAppLink.tsx` — generic "Get the desktop app →" link
  (native save, updater, offline). No AI copy. Stays.
- `src/lib/env.ts` `IS_WEB` — build-time flag for base path + the desktop link.
  Its AI-only consumers (provider filtering, key warning) go, the flag stays.

### Backend (Rust) — delete

- `src-tauri/src/commands/ai_config.rs` (keychain get/set via `keyring`).
- `src-tauri/src/commands/mod.rs` line 1: `pub mod ai_config;`.
- `src-tauri/src/lib.rs`:
  - line 20: `.plugin(tauri_plugin_http::init())` (present ONLY for the AI
    provider CORS proxy; the updater uses its own path).
  - lines 32-33: `commands::ai_config::ai_config_get` and `..._set` from the
    `invoke_handler!` list.
- `src-tauri/capabilities/default.json`: remove the `http:default` permission
  block (scoped `https://**` + `http://localhost:**/**`) — that grant exists for
  the provider proxy.

Rust IS compiler-checked, so `cargo build` catches any dangling reference here.

### Dependencies — drop (after confirming AI-only)

- `package.json`: `openai` (^6.39.0). Only consumer is `ai.ts`.
- `src-tauri/Cargo.toml`: `tauri-plugin-http` (line 21) and `keyring` (all three
  platform blocks: windows-native / apple-native / linux-native).
- `Cargo.lock` updates in lockstep.

Gate: grep each dependency name across the repo and confirm zero non-AI consumers
before removal.

## Stored user data

Leave orphaned. The desktop keychain entry and the web `localStorage` AI key are
simply no longer read or written. They are inert; no migration/cleanup code is
added. (Chosen over a one-time purge: zero risk, zero throwaway code.)

## Tests

- Remove the AI-settings Playwright e2e specs (already flaky / timing out per
  recent session notes). Add none.
- Unit suite: remove any AI-specific tests; the rest must stay green.

## Verification gates

1. **Grep gate (frontend dangling refs — `@ts-nocheck` blind spot):** after the
   edits, zero surviving references to any of: `useAIAssist`, `AISettingsPanel`,
   `WebKeyWarning`, `ai.ts` exports, `aiInput`, `aiError`, `aiReasoning`,
   `aiLoading`, `aiConfigured`, `showAISettings`, `mode === 'ai'`.
2. **`cargo build`** clean (catches Rust dangling refs after module/handler removal).
3. **Dependency check:** `openai`, `tauri-plugin-http`, `keyring` each have zero
   non-AI consumers before being dropped.
4. **`npm run build`** (tsc --noEmit + vite) clean.
5. **`npm test`** green.
6. **e2e** green (desktop + web configs).
7. **`npm run deadcode`** (ts-prune): no new orphans introduced by the removal.

## Docs

Update `docs/ARCHITECTURE.md`: remove the AI-Client deep-dive section and any AI
references in the file map. Update `CLAUDE.md` AI-client landmine notes and the
`IS_WEB` description (drop provider-filtering / key-warning bullets, keep the
desktop-link + base-path purpose). Remove the `ai.ts` breadcrumb.

## Versioning

Removing a feature pre-1.0 is a **MINOR** bump (backward-incompatible behavior
change). At release time: propose the version explicitly, add a CHANGELOG
`Removed` entry plus a breaking note, move `[Unreleased]` → `[x.y.z]`, add the
`compare/` footer link, and bump the four version files in lockstep.

## Risk

Low. The AI surface is cleanly severable: the Rust side is compiler-checked, the
frontend side is grep-gated, and no non-AI feature depends on the deleted pieces
(`DesktopAppLink` / `IS_WEB` explicitly retained). No data migration.
