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

## The naming trap (read first)

The original artifact fused "AI output" with "palette metadata" under `ai`-prefixed
names. Two of those fields are NOT AI-only and must be treated carefully:

- **`aiColorNames` — KEEP.** Despite the name, this is the app's color-naming
  system: the name label rendered under every ramp (`RampsPanel`, `HarmonyPanel`,
  `VizComparePanel`), always shown, falling back to `Color N`. It is populated by
  non-AI paths (classic presets `App.tsx:2217/2745`, GPL import `2808`) and
  reordered with ramps (`permute-indexed-state.ts:84`). Deleting it would strip
  every ramp's name. It is retained verbatim. (Not renamed: the persisted palette
  schema stores the `aiColorNames` key, so a rename would break saved palettes.)
- **`aiReasoning` — REMOVE.** A palette-description string. Its only render site is
  `App.tsx:4597`, gated on `mode === 'ai'`. The non-AI setters (classic preset
  `2746` "Inspired by …", GPL import `2809` "Imported from …") write text that is
  never displayed (mode is not `'ai'` on those loads). Removing the AI mode makes
  it dead, so it is removed fully — field, state, snapshot, history, and all
  setters. See Decision Point below.

## Scope

Hard delete of the entire AI path, frontend and backend, plus its dependencies.
The input `mode` collapses from `color | image | ai` to `color | image`. `mode` is
ephemeral UI state (plain `useState` in `App.tsx`, NOT in the snapshot/history or
saved-palette schema — verified), so no saved palette can carry `mode === 'ai'`
and no load-time coerce guard is needed.

### Frontend — delete files

- `src/lib/ai.ts` (225) — provider client + CORS-proxy loader
- `src/settings/AISettingsPanel.tsx` (148) — provider/key config UI
- `src/components/WebKeyWarning.tsx` (32) — web-only "key in localStorage" banner
- `src/hooks/useAIAssist.ts` — AI state hook

### Frontend — surgical edits (shared files, keep the file)

These files hold non-AI code; remove only the AI parts.

- `src/lib/tauri-bridge.ts`: remove `getAIConfig`/`setAIConfig` (lines 108-112,
  the `invoke('ai_config_get'/'ai_config_set')` wrappers) and the
  `import type { AIConfig } from './palette'` (line 7). Keep all updater/portable
  logic. **This is the orphaned-`invoke` risk** — if the Rust commands are deleted
  but these wrappers survive, the app calls non-existent commands and the symbol
  grep gate would miss it (hence the broad-regex gate below).
- `src/types/electron-api.d.ts`: remove the `getAIConfig`/`setAIConfig` type
  declarations (lines 4-5). Keep `onUpdateAvailable` (line 7).
- `src/lib/palette.ts`: remove the `AIConfig` interface and the `aiReasoning?`
  field (line 27) from the palette/snapshot type. **Keep `aiColorNames?`
  (line 26).**
- `src/hooks/usePaletteState.ts`: remove the `aiReasoning` state (line 27),
  its snapshot write (84), restore (110), and the exported pair (175).
  **Keep all `aiColorNames` lines (26, 83, 109, 146, 153, 174).**
- `src/lib/history-snapshot.ts`: remove `'aiReasoning'` from the serialized field
  list (line 2). **Keep `'aiColorNames'`.**

### Frontend — edit `src/App.tsx`

`App.tsx` is `@ts-nocheck`, so `tsc` will NOT catch dangling references here.
The broad-regex grep gate is the correctness check (see Verification).

- Remove imports: `AISettingsPanel` (18), `useAIAssist` (60).
- Remove the `useAIAssist()` destructure (175) and its state vars
  (`aiInput`, `aiLoading`, `aiError`, `showAISettings`, `aiConfigured` + setters).
- Remove `aiReasoning`/`setAiReasoning` from the `usePaletteState` destructure
  (131) and from the snapshot/restore/export plumbing (268, 2442, 2521).
  **Leave `aiColorNames`/`setAiColorNames` in place.**
- Remove the AI handlers: `handleAiGenerate`/`handleAiRandom` (the bodies around
  584-633 that call into `ai.ts`) and their AI-only `setAiReasoning(...)` calls.
- Remove the **non-AI** `setAiReasoning(...)` calls that have no surviving reader:
  classic preset (2746) and GPL import (2809). Their sibling
  `setAiColorNames(...)` calls (2745, 2808) **stay** (names still render).
- In the other reset/load paths that currently clear both (568, 585, 614, 648,
  1699), drop the `setAiReasoning('')` clears, keep the `setAiColorNames([])`.
- Remove the `mode === 'ai'` UI blocks: AI input panel + submit (~4479), the
  result/branch render (4572), `aiReasoning` render (4597), `aiError` (4602).
- Remove the AI button from the mode-selector. Confirmed by code: the
  `data-tour-id="mode-tabs"` div (4459-4463) holds exactly three buttons —
  `setMode('color')` (4460), `setMode('image')` (4461), `setMode('ai')` (4462).
  Delete the `'ai'` button; `color | image` remain.
- Remove `{showAISettings && <AISettingsPanel ... />}` (5180) and
  `handleAISettingsClose` if unused elsewhere.
- Remove `showAISettings` from the tour state snapshot/restore:
  `snapshotTourState` (753-755) and `restoreTourState` (758-764) capture and
  restore `showAISettings`/`setShowAISettings` — drop those two lines. `mode` stays
  in the tour snapshot (still a valid `color|image` field); only the AI field goes.

### Frontend — edit `src/lib/tours.ts`

Remove the tour step whose `detector` is `(s) => s.mode === 'ai'` (line 113) and
any AI-settings step. Renumber/relink remaining steps so the tour still flows.

### Frontend — keep (NOT AI-dependent)

- `src/components/DesktopAppLink.tsx` — generic "Get the desktop app →" link. No
  AI copy. Stays.
- `src/lib/env.ts` `IS_WEB` — build-time flag for base path + the desktop link.
  Its AI-only consumers (provider filtering, key warning) go; the flag stays.

### Backend (Rust) — delete

- `src-tauri/src/commands/ai_config.rs` (keychain get/set via `keyring`).
- `src-tauri/src/commands/mod.rs` line 1: `pub mod ai_config;`.
- `src-tauri/src/lib.rs`:
  - line 20: `.plugin(tauri_plugin_http::init())`. **Confirmed AI-only by code:**
    the sole `@tauri-apps/plugin-http` consumer is `ai.ts:159`
    (`await import('@tauri-apps/plugin-http')` → `mod.fetch`). The updater path in
    `tauri-bridge.ts` imports `check` (plugin-updater), `load` (plugin-store),
    `relaunch`, `openUrl` — NOT plugin-http (imports read, lines 1-7) — and its
    GitHub call (line 50) uses the webview global `fetch`.
  - lines 32-33: `commands::ai_config::ai_config_get` and `..._set` from the
    `invoke_handler!` list.
- `src-tauri/capabilities/default.json`: remove the `http:default` permission
  block (scoped `https://**` + `http://localhost:**/**`) — that grant governs the
  plugin-http `fetch` (the provider proxy). **Confirmed safe for the updater:**
  `tauri.conf.json` CSP is `null` (no connect-src restriction) and the updater
  endpoint (`tauri.conf.json` plugins.updater) is served by plugin-updater's own
  bundled HTTP client, so neither the global `fetch` to GitHub nor `check()`
  depends on `http:default`.

Rust IS compiler-checked, so `cargo build` catches any dangling reference here.

### Dependencies — drop (sole consumers confirmed by code)

- `package.json`: `openai` (^6.39.0). **Sole importer is `ai.ts:3-4`**
  (`import OpenAI from 'openai'` + types). All other `openai` occurrences are
  string literals (`provider: 'openai'`), preset references, or tour copy — no
  other package import.
- `src-tauri/Cargo.toml`: `tauri-plugin-http` (line 21, sole consumer `ai.ts:159`,
  above) and `keyring` (all three platform blocks: windows-native /
  apple-native / linux-native — **sole consumer is `ai_config.rs:1`
  `use keyring::Entry;`**, deleted with the file).
- `Cargo.lock` updates in lockstep.

`cargo build` (Rust, compiler-checked) and the broad-regex grep gate are the
backstops after removal.

## Decision Point: aiReasoning — RESOLVED (drop it)

`aiReasoning` is removed entirely, which also drops the classic-preset
"Inspired by …" and GPL-import "Imported from …" description strings. Confirmed
against the code: the only renderer is `App.tsx:4597`, gated `mode === 'ai'`;
classic (2746) and GPL (2809) never call `setMode`, so their text only ever
appeared while the user was already in AI mode. Once AI mode is deleted, `mode` is
`color|image` only and the field is undisplayable — nothing the user can see today
is lost. User confirmed (2026-06-10): drop it. A palette-provenance feature, if
wanted later, is separate.

## Stored user data

Leave orphaned. The desktop keychain entry and the web `localStorage` AI key are
no longer read or written; they are inert. No migration/cleanup code is added.
(Chosen over a one-time purge: zero risk, zero throwaway code.) Saved palettes that
contain an `aiReasoning` key load fine — the extra key is ignored on parse.

## Tests

- Remove the AI-settings Playwright e2e specs (already flaky / timing out per
  recent session notes). Add none.
- Unit suite: remove any AI-specific tests; the rest must stay green. The
  `aiColorNames` rendering/permute tests stay.

## Verification gates

1. **Broad-regex completeness gate (not an enumerated list).** Re-run the original
   AI-surface regex across `src/` and `src-tauri/`:
   `useAIAssist|AISettingsPanel|WebKeyWarning|aiReasoning|setAiReasoning|AIConfig|getAIConfig|setAIConfig|ai_config|aiInput|aiError|aiLoading|aiConfigured|showAISettings|mode === 'ai'|anthropic|openai|ollama|apiKey|keyring|plugin-http`.
   Require zero hits except inside retained, non-AI contexts (`DesktopAppLink`,
   `env.ts`). **`aiColorNames` is explicitly allowed to remain** (kept by design).
2. **`cargo build`** clean (catches Rust dangling refs after module/handler removal).
3. **Dependency check:** `openai`, `tauri-plugin-http`, `keyring` each have zero
   non-AI consumers before being dropped.
4. **`npm run build`** (tsc --noEmit + vite) clean.
5. **`npm test`** green.
6. **e2e** green (desktop + web configs).
7. **`npm run deadcode`** (ts-prune): no new orphans introduced by the removal.

## Docs

Update `docs/ARCHITECTURE.md`: remove the AI-Client deep-dive section and AI
references in the file map. Update `CLAUDE.md` AI-client landmine notes and the
`IS_WEB` description (drop provider-filtering / key-warning bullets, keep the
desktop-link + base-path purpose). Remove the `ai.ts` breadcrumb.

## Versioning

Removing a feature pre-1.0 is a **MINOR** bump (backward-incompatible behavior
change). Current version is `0.21.0` (`tauri.conf.json:4`), so this lands as
`0.22.0`. At release time: propose the version explicitly, add a CHANGELOG
`Removed` entry plus a breaking note, move `[Unreleased]` → `[x.y.z]`, add the
`compare/` footer link, and bump the four version files in lockstep.

## Risk

Low-to-moderate. The pure-AI surface (ai.ts, AISettingsPanel, Rust ai_config,
deps) is cleanly severable and compiler/grep gated. The moderate part is the
shared state: `aiReasoning` threads through the palette hook, history snapshot,
and persisted schema, and its sibling `aiColorNames` must be preserved while
`aiReasoning` is removed — the broad-regex gate plus the explicit keep-list guard
against over- or under-deletion. No data migration; old palettes load unchanged.
