# Remove AI Assist (full-stack) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the AI-assisted palette feature completely, frontend and backend, plus its dependencies — leaving `aiColorNames` (the non-AI ramp name labels) intact.

**Architecture:** Dependency-safe removal: strip consumers (`App.tsx`, `main.tsx`) before the modules they import, then delete the modules, then the Rust commands, then the dependencies. `App.tsx` + `color.ts` are `@ts-nocheck`, so the build cannot catch dangling refs there — a broad-regex `git grep` is the correctness gate, run per-task (targeted) and once at the end (complete).

**Tech Stack:** Vite 8 + React 19 + TS 6, Tauri v2 (Rust), Vitest, Playwright. Spec: `docs/superpowers/specs/2026-06-10-remove-ai-assist-design.md`.

---

## Ground rules (read before Task 1)

- **This is a removal.** There is no new behavior to test-first. "Green" means: targeted `git grep` returns zero for the removed symbols, `npm run build` passes, and (final task) `npm test` + e2e + `cargo build` pass. Where a task edits a test that covers changed code, edit the test to match new behavior and run it.
- **Serena is mandatory for `src/**/*.ts(x)`.** A `PreToolUse` hook hard-blocks the built-in Edit tool there. Use `mcp__serena__replace_content` / `replace_symbol_body` / `insert_*`. Rust (`.rs`), JSON, Markdown, and `package.json` use the normal Edit tool.
- **KEEP `aiColorNames`** everywhere. It is the per-ramp name label (fed by classic/GPL imports), NOT AI-only. Only `aiReasoning` is removed.
- **One commit per task.** Branch is `feat/remove-ai-assist` (already created off master).
- **No version bump in this plan.** Per project rules, never bump without releasing. The final task adds a CHANGELOG `[Unreleased] → Removed` entry only; the `0.22.0` MINOR bump is proposed to the user at release time.
- **Grep gate command** used throughout (tracked files only):
  `git grep -nE "<pattern>" -- src src-tauri` (expect no output = pass).

## File structure (what changes)

**Delete (frontend):** `src/lib/ai.ts`, `src/settings/AISettingsPanel.tsx`, `src/components/WebKeyWarning.tsx`, `src/hooks/useAIAssist.ts`
**Delete (Rust):** `src-tauri/src/commands/ai_config.rs`
**Delete (tests):** `tests/e2e/ai-settings.spec.ts`, `tests/unit/provider-migration.spec.ts`, `tests/unit/provider-filter.spec.ts`
**Modify (frontend):** `src/App.tsx`, `src/main.tsx`, `src/lib/tauri-bridge.ts`, `src/types/electron-api.d.ts`, `src/lib/palette.ts`, `src/hooks/usePaletteState.ts`, `src/lib/history-snapshot.ts`, `src/lib/tours.ts`
**Modify (Rust/config):** `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`, `package.json`
**Modify (tests):** `tests/unit/history-snapshot.spec.ts`, `tests/e2e/web-build.spec.ts`
**Modify (docs):** `docs/ARCHITECTURE.md`, `CLAUDE.md`, `CHANGELOG.md`

---

### Task 1: App.tsx — remove the AI generation path

**Files:**
- Modify: `src/App.tsx` (Serena) — import line 17; handlers `handleAiGenerate`/`handleAiRandom` (~584-633); `mode === 'ai'` UI blocks (~4479, 4572, 4597, 4602); the `setMode('ai')` mode-selector button (4462).

- [ ] **Step 1: Remove the AI mode-selector button.** In the `data-tour-id="mode-tabs"` div (4459-4463), delete the `<button onClick={() => setMode('ai')} …>` line (4462). Leave the `color` (4460) and `image` (4461) buttons.

- [ ] **Step 2: Remove the `mode === 'ai'` JSX blocks.** Delete the conditional blocks at ~4479 (`{mode === 'ai' && ( … AI input + submit … )}`), the `mode === 'ai' ?` branch at ~4572 (replace the ternary with its non-AI branch), the `{mode === 'ai' && aiReasoning && ( … ▸ VISION ▸ … )}` at 4597-4600, and `{mode === 'ai' && aiError && ( … )}` at 4602.

- [ ] **Step 3: Remove the AI handlers.** Delete `handleAiGenerate` and `handleAiRandom` (the functions around 584-633 that call `getCachedAIConfig()`, `createAIClient()`, `generatePaletteFromPrompt()`).

- [ ] **Step 4: Remove the `ai.ts` import.** Delete line 17: `import { getCachedAIConfig, createAIClient, generatePaletteFromPrompt } from './lib/ai';`

- [ ] **Step 5: Grep gate.**

Run: `git grep -nE "mode === 'ai'|handleAiGenerate|handleAiRandom|getCachedAIConfig|createAIClient|generatePaletteFromPrompt" -- src/App.tsx`
Expected: no output.

- [ ] **Step 6: Build.**

Run: `npm run build`
Expected: PASS (typed files unaffected; App.tsx is @ts-nocheck).

- [ ] **Step 7: Commit.**

```bash
git add src/App.tsx
git commit -m "refactor(ai-removal): drop AI generation path from App.tsx"
```

---

### Task 2: App.tsx — remove AISettingsPanel + useAIAssist wiring

**Files:**
- Modify: `src/App.tsx` (Serena) — imports 18, 60; `useAIAssist()` destructure 175; render 5180; `handleAISettingsClose`; tour-snapshot `showAISettings` (753-764); `setAiConfigured` usage 735.

- [ ] **Step 1: Remove the render.** Delete `{showAISettings && <AISettingsPanel onClose={handleAISettingsClose} />}` (5180).

- [ ] **Step 2: Remove `handleAISettingsClose`** (its definition) and the `setAiConfigured(getCachedAIConfig() !== null)` call at 735 (its enclosing effect/handler — remove the whole now-empty effect if nothing else remains in it).

- [ ] **Step 3: Remove `showAISettings` from the tour snapshot.** In `snapshotTourState` (753-755) delete `showAISettings` from the captured object; in `restoreTourState` (758-764) delete the `setShowAISettings(s.showAISettings)` line. Keep `mode` in both.

- [ ] **Step 4: Remove the `useAIAssist` destructure** (175): delete the whole `const { aiInput, … aiConfigured, setAiConfigured } = useAIAssist();` line.

- [ ] **Step 5: Remove the imports.** Delete line 18 (`import { AISettingsPanel } …`) and line 60 (`import { useAIAssist } …`).

- [ ] **Step 6: Grep gate.**

Run: `git grep -nE "AISettingsPanel|useAIAssist|showAISettings|setShowAISettings|aiInput|aiError|aiLoading|aiConfigured" -- src/App.tsx`
Expected: no output.

- [ ] **Step 7: Build, then commit.**

```bash
npm run build
git add src/App.tsx
git commit -m "refactor(ai-removal): drop AISettingsPanel + useAIAssist wiring from App.tsx"
```

---

### Task 3: App.tsx — remove aiReasoning threading (keep aiColorNames)

**Files:**
- Modify: `src/App.tsx` (Serena) — destructure 131; snapshot 268; export 2442; restore 2521-2522; setters at 568, 585, 590, 614, 619, 633, 648, 1699, 2746, 2809.

- [ ] **Step 1: Remove `aiReasoning`/`setAiReasoning` from the `usePaletteState` destructure** (131). Leave `aiColorNames, setAiColorNames` on line 130.

- [ ] **Step 2: Remove `aiReasoning` from the snapshot builder** (268, the object literal `{ baseColors, aiColorNames, aiReasoning, … }`) and from the export/save object (2442). **Keep `aiColorNames` in both.**

- [ ] **Step 3: Remove the restore line** 2522: `setAiReasoning(typeof parsed.aiReasoning === 'string' ? … );`. **Keep** 2521 (`setAiColorNames(…)`).

- [ ] **Step 4: Remove every `setAiReasoning(...)` call.** AI-path clears/sets at 568, 585, 590, 614, 619, 633, 648, 1699 (most already removed with Task 1's handlers — remove any survivors), and the non-AI setters at 2746 (`setAiReasoning(\`Inspired by …\`)`) and 2809 (`setAiReasoning(\`Imported from …\`)`). **Keep the sibling `setAiColorNames(...)` calls at 2745 and 2808.**

- [ ] **Step 5: Grep gate.**

Run: `git grep -nE "aiReasoning|setAiReasoning" -- src/App.tsx`
Expected: no output.
Run: `git grep -nc "aiColorNames" -- src/App.tsx`
Expected: non-zero (aiColorNames retained).

- [ ] **Step 6: Build, then commit.**

```bash
npm run build
git add src/App.tsx
git commit -m "refactor(ai-removal): remove aiReasoning threading from App.tsx (keep aiColorNames)"
```

---

### Task 4: main.tsx — remove the ai.ts boot preload

**Files:**
- Modify: `src/main.tsx` (Serena) — lines 12-14.

- [ ] **Step 1: Delete the preload block** (12-14):

```ts
  import('./lib/ai')
    .then(/* … */)
    .catch(e => console.error('[main] failed to preload ai:', e))
```

Keep the `import('./lib/tauri-bridge')` block (9-11).

- [ ] **Step 2: Grep gate + build.**

Run: `git grep -nE "lib/ai" -- src/main.tsx`  → no output.
Run: `npm run build`  → PASS (main.tsx is NOT @ts-nocheck; a leftover would fail here).

- [ ] **Step 3: Commit.**

```bash
git add src/main.tsx
git commit -m "refactor(ai-removal): drop ai.ts boot preload from main.tsx"
```

---

### Task 5: Delete the pure-AI test files

**Files:**
- Delete: `tests/e2e/ai-settings.spec.ts`, `tests/unit/provider-migration.spec.ts`, `tests/unit/provider-filter.spec.ts`

These import `ai.ts` exports (`migrateStaleProvider`, `getProviderPresets`, `DROPPED_WEB_PROVIDERS`); delete them BEFORE deleting `ai.ts` so the suite never has a broken import.

- [ ] **Step 1: Delete the three files.**

```bash
git rm tests/e2e/ai-settings.spec.ts tests/unit/provider-migration.spec.ts tests/unit/provider-filter.spec.ts
```

- [ ] **Step 2: Run the unit suite.**

Run: `npm test`
Expected: PASS (remaining tests; `history-snapshot.spec.ts` still asserts `aiReasoning` — it is edited in Task 11, so it still passes here because `ai.ts` and the field still exist).

- [ ] **Step 3: Commit.**

```bash
git commit -m "test(ai-removal): delete provider-migration/provider-filter/ai-settings specs"
```

---

### Task 6: Delete the pure-AI frontend modules

**Files:**
- Delete: `src/settings/AISettingsPanel.tsx`, `src/hooks/useAIAssist.ts`, `src/components/WebKeyWarning.tsx`, `src/lib/ai.ts`

All four are now unimported (App.tsx + main.tsx edited; AISettingsPanel was the only WebKeyWarning consumer).

- [ ] **Step 1: Confirm no importers remain.**

Run: `git grep -nE "from ['\"][^'\"]*(/ai|/AISettingsPanel|/useAIAssist|/WebKeyWarning)['\"]" -- src`
Expected: no output. (If any line appears, STOP — an earlier task missed a consumer.)

- [ ] **Step 2: Delete the files.**

```bash
git rm src/settings/AISettingsPanel.tsx src/hooks/useAIAssist.ts src/components/WebKeyWarning.tsx src/lib/ai.ts
```

- [ ] **Step 3: Build.**

Run: `npm run build`
Expected: PASS (no remaining imports of the deleted modules).

- [ ] **Step 4: Commit.**

```bash
git commit -m "refactor(ai-removal): delete ai.ts, AISettingsPanel, useAIAssist, WebKeyWarning"
```

---

### Task 7: tauri-bridge.ts — remove the AI config invoke wrappers

**Files:**
- Modify: `src/lib/tauri-bridge.ts` (Serena) — `AIConfig` import (line 7); `getAIConfig`/`setAIConfig` (108-112).

- [ ] **Step 1: Remove the wrappers.** Delete the `getAIConfig: () => invoke<…>('ai_config_get')` and `setAIConfig: (config: AIConfig) => invoke<…>('ai_config_set', { config })` properties (108-112) from the `electronAPI` object. Keep `onUpdateAvailable`, download/install/skip, and all updater logic.

- [ ] **Step 2: Remove the now-unused import.** Delete line 7: `import type { AIConfig } from './palette'`.

- [ ] **Step 3: Grep gate + build.**

Run: `git grep -nE "getAIConfig|setAIConfig|ai_config|AIConfig" -- src/lib/tauri-bridge.ts`  → no output.
Run: `npm run build`  → PASS (tauri-bridge.ts is typed; catches a missed ref).

- [ ] **Step 4: Commit.**

```bash
git add src/lib/tauri-bridge.ts
git commit -m "refactor(ai-removal): remove AI config invoke wrappers from tauri-bridge"
```

---

### Task 8: electron-api.d.ts — remove the AI config types

**Files:**
- Modify: `src/types/electron-api.d.ts` (Serena) — lines 4-5.

- [ ] **Step 1: Delete the two declarations** (4-5): `getAIConfig: () => Promise<…>` and `setAIConfig: (config: …) => Promise<…>`. Keep `onUpdateAvailable` (7) and the rest of the `electronAPI` interface.

- [ ] **Step 2: Grep gate + build.**

Run: `git grep -nE "getAIConfig|setAIConfig" -- src/types/electron-api.d.ts`  → no output.
Run: `npm run build`  → PASS.

- [ ] **Step 3: Commit.**

```bash
git add src/types/electron-api.d.ts
git commit -m "refactor(ai-removal): remove AI config types from electron-api.d.ts"
```

---

### Task 9: palette.ts — remove AIConfig + the aiReasoning field

**Files:**
- Modify: `src/lib/palette.ts` (Serena) — `AIConfig` interface (~7); `aiReasoning?` field (27). Keep `aiColorNames?` (26).

- [ ] **Step 1: Remove the `AIConfig` interface** and its `// ---------- AI Configuration ----------` comment header (3-5 + the interface, ~7 onward). It now has zero importers (ai.ts, AISettingsPanel, tauri-bridge all handled).

- [ ] **Step 2: Remove the `aiReasoning?: string` field** (27) from the palette/snapshot type. **Keep `aiColorNames?: string[]`** (26).

- [ ] **Step 3: Grep gate + build.**

Run: `git grep -nE "AIConfig|aiReasoning" -- src/lib/palette.ts`  → no output.
Run: `npm run build`  → PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/palette.ts
git commit -m "refactor(ai-removal): remove AIConfig + aiReasoning field from palette.ts"
```

---

### Task 10: usePaletteState.ts — remove aiReasoning (keep aiColorNames)

**Files:**
- Modify: `src/hooks/usePaletteState.ts` (Serena) — state 27; snapshot 84; restore 110; export 175.

- [ ] **Step 1: Remove the state** (27): `const [aiReasoning, setAiReasoning] = useState('');`. Keep `aiColorNames` (26).

- [ ] **Step 2: Remove `aiReasoning` from the snapshot object** (84) and the `setAiReasoning(snap.aiReasoning)` restore line (110). Keep the `aiColorNames` lines (83, 109).

- [ ] **Step 3: Remove `aiReasoning, setAiReasoning` from the returned object** (175). Keep `aiColorNames, setAiColorNames` (174).

- [ ] **Step 4: Grep gate + build.**

Run: `git grep -nE "aiReasoning|setAiReasoning" -- src/hooks/usePaletteState.ts`  → no output.
Run: `npm run build`  → PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/hooks/usePaletteState.ts
git commit -m "refactor(ai-removal): remove aiReasoning from usePaletteState (keep aiColorNames)"
```

---

### Task 11: history-snapshot.ts + spec — drop 'aiReasoning' from the field list

**Files:**
- Modify: `src/lib/history-snapshot.ts` (Serena) — field array line 2.
- Modify: `tests/unit/history-snapshot.spec.ts` (Serena) — remove `aiReasoning` assertions, keep `aiColorNames`.

- [ ] **Step 1: Edit the test first to the new expectation.** In `tests/unit/history-snapshot.spec.ts`, remove assertions that the snapshot field list contains `'aiReasoning'`; keep assertions for `'aiColorNames'`.

- [ ] **Step 2: Run it — expect FAIL** (source still lists `aiReasoning`).

Run: `npm test -- history-snapshot`
Expected: FAIL on the removed-field assertion (confirms the test exercises the field list).

- [ ] **Step 3: Remove `'aiReasoning'`** from the `SNAPSHOT_FIELDS` array (line 2) in `src/lib/history-snapshot.ts`. Keep `'aiColorNames'`.

- [ ] **Step 4: Run the test — expect PASS.**

Run: `npm test -- history-snapshot`
Expected: PASS.

- [ ] **Step 5: Grep gate + commit.**

Run: `git grep -nE "aiReasoning" -- src/lib/history-snapshot.ts`  → no output.

```bash
git add src/lib/history-snapshot.ts tests/unit/history-snapshot.spec.ts
git commit -m "refactor(ai-removal): drop aiReasoning from history snapshot fields"
```

---

### Task 12: tours.ts — remove both AI tour steps

**Files:**
- Modify: `src/lib/tours.ts` (Serena) — the `detector: (s) => s.mode === 'ai'` step (~113) and the AI-settings step at ~118 ("Open settings and paste in your API key…").

- [ ] **Step 1: Remove both steps** from the tour step array. Renumber/relink any step indices or `id`/`next` references so the remaining tour flows unbroken.

- [ ] **Step 2: Grep gate + build.**

Run: `git grep -nE "mode === 'ai'|API key|apiKey|OpenAI" -- src/lib/tours.ts`  → no output.
Run: `npm run build`  → PASS.

- [ ] **Step 3: Run tour tests if present.**

Run: `npm test -- tour`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/tours.ts
git commit -m "refactor(ai-removal): remove AI tour steps"
```

---

### Task 13: web-build.spec.ts — drop AI web assertions

**Files:**
- Modify: `tests/e2e/web-build.spec.ts` (Serena) — remove `WebKeyWarning` / provider-filter assertions; keep build / base-path / general web checks.

- [ ] **Step 1: Remove the AI-specific assertions** (anything checking the web key-warning banner or that AI providers are filtered on web). Keep the rest of the spec.

- [ ] **Step 2: Grep gate.**

Run: `git grep -nE "WebKeyWarning|key warning|provider|apiKey|AI " -- tests/e2e/web-build.spec.ts`
Expected: no AI-related output (eyeball any `provider` hits that are unrelated).

- [ ] **Step 3: Commit** (web e2e runs in the final gate / CI).

```bash
git add tests/e2e/web-build.spec.ts
git commit -m "test(ai-removal): drop AI web assertions from web-build spec"
```

---

### Task 14: Rust backend — remove the ai_config commands + plugin-http

**Files:**
- Modify: `src-tauri/src/lib.rs` (normal Edit) — line 20, lines 32-33.
- Modify: `src-tauri/src/commands/mod.rs` (normal Edit) — line 1.
- Delete: `src-tauri/src/commands/ai_config.rs`
- Modify: `src-tauri/capabilities/default.json` (normal Edit) — `http:default` block.

- [ ] **Step 1: Remove the invoke handlers.** In `lib.rs`, delete lines 32-33 (`commands::ai_config::ai_config_get,` and `commands::ai_config::ai_config_set,`) from the `generate_handler!` list. Keep `commands::runtime::runtime_is_portable`.

- [ ] **Step 2: Remove the plugin.** In `lib.rs`, delete line 20: `.plugin(tauri_plugin_http::init())`.

- [ ] **Step 3: Remove the module declaration.** In `commands/mod.rs`, delete line 1: `pub mod ai_config;`. Keep `pub mod runtime;`.

- [ ] **Step 4: Delete the file.**

```bash
git rm src-tauri/src/commands/ai_config.rs
```

- [ ] **Step 5: Remove the capability.** In `capabilities/default.json`, delete the `"http:default"` permission object (the one with the `https://**` + `http://localhost:**/**` allow list).

- [ ] **Step 6: Compile (the real gate — Rust is type-checked).**

Run: `cargo build --manifest-path src-tauri/Cargo.toml` (use `-j 1` on the low-RAM box if needed)
Expected: PASS, with NO `unused` warnings referencing keyring/http (those deps are removed in Task 15).

- [ ] **Step 7: Commit.**

```bash
git add src-tauri/src/lib.rs src-tauri/src/commands/mod.rs src-tauri/capabilities/default.json
git commit -m "refactor(ai-removal): remove ai_config commands, plugin-http, http capability"
```

---

### Task 15: Drop the dependencies

**Files:**
- Modify: `package.json` (normal Edit) — remove `openai`.
- Modify: `src-tauri/Cargo.toml` (normal Edit) — remove `tauri-plugin-http`, `keyring` (all 3 platform blocks).

- [ ] **Step 1: Confirm sole consumers are gone.**

Run: `git grep -nE "from ['\"]openai|tauri_plugin_http|keyring::" -- src src-tauri`
Expected: no output.

- [ ] **Step 2: Remove `openai`** from `package.json` `dependencies`, then refresh the lockfile.

Run: `npm install`
Expected: `package-lock.json` updated, `openai` gone.

- [ ] **Step 3: Remove `tauri-plugin-http`** (line 21) and the three `keyring = { … }` platform-gated lines from `src-tauri/Cargo.toml`.

- [ ] **Step 4: Rebuild Rust to refresh `Cargo.lock`.**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: PASS; `Cargo.lock` no longer lists `keyring` / `tauri-plugin-http`.

- [ ] **Step 5: Commit (lockfiles in lockstep).**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build(ai-removal): drop openai, tauri-plugin-http, keyring deps"
```

---

### Task 16: Docs — ARCHITECTURE.md, CLAUDE.md, CHANGELOG

**Files:**
- Modify: `docs/ARCHITECTURE.md` (normal Edit) — remove the AI-Client deep-dive section + AI entries in the file map.
- Modify: `CLAUDE.md` (normal Edit) — remove the AI-client landmine block + the `ai.ts` breadcrumb; trim the `IS_WEB` description to drop provider-filtering / key-warning bullets (keep desktop-link + base-path).
- Modify: `CHANGELOG.md` (normal Edit) — add a `Removed` entry under `## [Unreleased]`.

- [ ] **Step 1: ARCHITECTURE.md** — delete the AI-Client section and any `ai.ts` / `AISettingsPanel` / provider rows in the file map.

- [ ] **Step 2: CLAUDE.md** — delete the "AI-client landmines" paragraph and the `IS_WEB` bullets that reference provider filtering and the key-warning banner. Keep the `IS_WEB` → base-path + desktop-link purpose.

- [ ] **Step 3: CHANGELOG.md** — under `## [Unreleased]`, add:

```markdown
### Removed
- AI-assisted palette generation (multi-provider AI, settings panel, key storage)
  removed entirely — frontend, Tauri backend, and the `openai`/`keyring`/
  `tauri-plugin-http` dependencies. Existing stored AI config is left orphaned and
  ignored. Color-name labels (`aiColorNames`) are retained.
```

Do NOT edit version numbers. The `0.22.0` MINOR bump is proposed to the user at release time.

- [ ] **Step 4: Commit.**

```bash
git add docs/ARCHITECTURE.md CLAUDE.md CHANGELOG.md
git commit -m "docs(ai-removal): update ARCHITECTURE, CLAUDE, CHANGELOG"
```

---

### Task 17: Final verification gate

No code change — this is the completeness gate from the spec.

- [ ] **Step 1: Broad-regex completeness gate.**

Run:
```bash
git grep -nE "useAIAssist|AISettingsPanel|WebKeyWarning|aiReasoning|setAiReasoning|AIConfig|getAIConfig|setAIConfig|ai_config|aiInput|aiError|aiLoading|aiConfigured|showAISettings|mode === 'ai'|anthropic|openai|ollama|apiKey|keyring|plugin-http|tauri_plugin_http" -- src src-tauri
```
Expected: no output. (`aiColorNames` is intentionally NOT in the pattern — it is retained. Any hit is a real miss; fix before proceeding.)

- [ ] **Step 2: Import-path clause.**

Run: `git grep -nE "from ['\"][^'\"]*(/ai|/AISettingsPanel|/useAIAssist|/WebKeyWarning)['\"]" -- src`
Expected: no output.

- [ ] **Step 3: Frontend build + unit tests.**

Run: `npm run build` → PASS.
Run: `npm test` → PASS.

- [ ] **Step 4: Rust build.**

Run: `cargo build --manifest-path src-tauri/Cargo.toml` → PASS, no unused-dep warnings.

- [ ] **Step 5: Dead-code check.**

Run: `npm run deadcode`
Expected: no NEW orphans introduced by the removal (compare against the known pre-existing list).

- [ ] **Step 6: e2e (desktop + web).**

Run: `npm run test:e2e`
Then: `npm run build:web` and `npx playwright test --config=playwright.web.config.ts`
Expected: PASS (web-build spec reflects the AI removal).

- [ ] **Step 7: Manual updater smoke test (the one runtime check static analysis can't close).**

Build/run the desktop app and confirm the update check still works after removing `plugin-http` + the `http:default` capability (the updater uses `plugin-updater` + global fetch; CSP is `null`). Confirm no console error about missing `ai_config` commands or plugin-http.

- [ ] **Step 8: Update ARCHITECTURE.md subsystem sections** if any structural claim about App.tsx changed (per the doc-sync directive), then commit any final doc fix.

```bash
git add -A
git commit -m "chore(ai-removal): final verification pass"
```

- [ ] **Step 9: Open the PR.**

```bash
git push -u origin feat/remove-ai-assist
gh pr create --base master --title "Remove AI assist (full-stack)" --body "Implements docs/superpowers/specs/2026-06-10-remove-ai-assist-design.md. Ships as 0.22.0 (MINOR) — version bump proposed separately at release."
```

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — frontend deletes (T6), surgical edits (T1-T3 App, T4 main, T7 tauri-bridge, T8 d.ts, T9 palette, T10 usePaletteState, T11 history-snapshot), tours (T12), Rust (T14), deps (T15), tests (T5 delete, T11+T13 edit), docs (T16), gates (per-task + T17).
- **aiColorNames retained** — asserted in T3/T9/T10/T11 keep-steps and excluded from the T17 gate pattern.
- **Version:** no bump in-plan; CHANGELOG `[Unreleased]` only (T16); `0.22.0` proposed at release.
- **Ordering:** consumers (T1-T4) before module deletes (T6); AI tests deleted (T5) before `ai.ts` (T6) so the suite never breaks; Rust commands (T14) before deps (T15) so `cargo build` validates each.
