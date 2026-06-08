# PIXEL.PAL: Project Context

Pixel-art palette generator. Vite 8 + React 19 + TS 6, packaged as Tauri v2
desktop; also a static browser build on GitHub Pages. Multi-provider AI, user
brings own key. Ported from a 7820-line Claude artifact (`tests/pixel-pal.tsx`,
local-only/gitignored).

**Detailed file map + AI-client/Playwright deep-dives:** `docs/ARCHITECTURE.md`
(read the relevant section before working in that area).

What it does: hex/image/AI input → 4-8 shade ramps (Punchy/Balanced/Muted) with
pixel-art slot labels; per-ramp HSV/sat/pin/hide/shuffle/lock; global Harmonize +
Hardware Lock (NES/GB/CGA/EGA/C64) + harmony derivation; mosaic/lightness/polar/
adjacency views; sprite previews; side-by-side compare; WCAG check + CVD sim;
≤100 saved palettes + 50-entry undo/redo history; export gpl/pal/ase/png-strip/txt.

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

Web e2e runs separately: `npm run build:web` then
`npx playwright test --config=playwright.web.config.ts`.

Legacy JS tests (`tests/test_*.js`, vm-sandbox) are local-only/gitignored — if the
glob matches nothing that's expected, not an error:
`foreach ($f in Get-ChildItem tests\test_*.js) { node $f }`

---

## Versioning & Releases

**SemVer, enforced from 0.13.0 on.** Pre-1.0 (standard): features → MINOR;
backward-compatible fixes → PATCH; breaking → MINOR (no MAJOR until 1.0). Choose
the bump from what changed, not by habit. (Pre-0.13.0 history was inconsistent —
see `CHANGELOG.md` `Versioning notes`.)

**Every release gets a CHANGELOG entry.** Before tagging, move notes from
`## [Unreleased]` into `## [x.y.z] - YYYY-MM-DD` (Keep-a-Changelog buckets:
Added/Changed/Fixed/Removed) + add the `compare/` footer link.

**Never bump a version without releasing it** — don't commit a version change to
`package.json`/`tauri.conf.json`/`Cargo.toml`/`Cargo.lock` unless it'll be tagged.

**Four version files move in lockstep, tag must match.** See `release-flow.md`
memory for the exact file list + tag/push procedure.

---

## Code Navigation & Edits: use Serena

This repo has Serena (`.serena/project.yml`, TypeScript LSP) activated. **For any
`src/**` code file, use Serena tools, not the built-in Read/Edit:**

- **Navigate/read:** `get_symbols_overview` → `find_symbol` (`include_body`). No
  Read-for-discovery on code files.
- **Edit:** `replace_content` (regex, for a few lines inside a big symbol) /
  `replace_symbol_body` / `insert_before_symbol` / `insert_after_symbol`. **A
  `PreToolUse` hook hard-blocks the built-in Edit tool on `src/**/*.ts(x)`** — it
  is enforced, not advisory.
- **Cross-refs:** `find_referencing_symbols` first; keep `grep` as a *backup*
  completeness check (some refs in untyped files aren't type-linked).

`@ts-nocheck` does **not** blind Serena — the LSP still parses symbol structure
(it only suppresses *type diagnostics*). So Serena navigates `App.tsx`/`color.ts`
fine. But `get_diagnostics_for_file` is muted by `@ts-nocheck`, so the
**`sed`-strip-nocheck + `tsc` type-gate + grep stays the correctness gate** — Serena
replaces navigation/edits, not verification.

---

## Architecture

**Build target:** Vite → `dist/`. `base: './'` for Tauri (file://) or
`/pixel-pal-app/` for GH Pages, branched on `VITE_BUILD_TARGET=web` in
`vite.config.ts`. Custom domain would change web base to `/`. Do not flatten.

**Desktop runtime:** Tauri v2, Rust shell in `src-tauri/`. Secure AI-config storage
(OS keychain via `keyring`), native Save-As (plugin-dialog), HTTP proxy for
CORS-blocked providers (plugin-http). AI calls run in the renderer; user's own key,
`dangerouslyAllowBrowser: true` is safe.

**Web runtime:** plain browser — `window.__TAURI_INTERNALS__` is undefined. ALL
Tauri imports must be dynamic + gated on that check (`main.tsx`, `lib/ai.ts`); static
imports bloat the bundle / defeat tree-shaking. The `IS_WEB` build flag
(`src/lib/env.ts`) drives provider filtering + the key-warning banner + the desktop
footer link; runtime `isTauri()`/`__TAURI_INTERNALS__` drives storage/dialog/IPC
fallbacks.

**Persistence:** Tauri plugin-store for desktop settings; localStorage for palette
list, theme, web-only AI key. The `window.storage` shim in `src/App.tsx` bridges the
artifact's async storage API to localStorage — **do not remove**. (Typed globally in
`vite-env.d.ts`.)

---

## Critical Constraints

- **ESM project** (`"type": "module"`). Config files use `export default`, never
  `module.exports` (tailwind/postcss/vite/playwright configs).
- **`// @ts-nocheck` in `color.ts` + `App.tsx` is intentional — do not remove.**
  `color.ts` = 15 color-math fns extracted verbatim from the artifact (untyped). A
  consequence for refactors: `tsc`/`npm run build` does NOT catch dangling refs to
  removed locals inside these files — grep is the real gate.
- **`tests/package.json` + `scripts/package.json` = `{"type":"commonjs"}`** to scope
  CJS without touching root ESM. Do not delete — but both are LOCAL-ONLY (gitignored,
  absent on fresh clones).
- **Tailwind v3, not v4.** PostCSS integration (tailwind.config.js + postcss.config.js),
  3 `@tailwind` directives in `src/index.css`. No Tailwind plugin in vite.config.ts.
  Don't upgrade to v4 without config rework.

**AI-client landmines** (full detail: `docs/ARCHITECTURE.md` → AI Client; a breadcrumb
is at the top of `ai.ts`): use `ChatCompletionCreateParamsNonStreaming` (the generic
`Parameters<…create>[0]` breaks under openai SDK v6); Anthropic skips
`response_format: json_object`; Anthropic + Ollama are filtered from the web dropdown
and auto-migrate to OpenAI defaults on web load.

**Playwright landmines** (full detail: `docs/ARCHITECTURE.md` → Playwright Gotchas):
use `toBeAttached()` not `toBeVisible()` for conditional nodes; `getByTitle()`/buttons
need exact text + `{ exact: true }`; web preview needs `--base /pixel-pal-app/`.

---

## Known Issues / Deferred

- **No custom icon**: default Tauri icon; need a 256x256 set in `src-tauri/icons/`
  before customizing the bundle.

---

## Bug Report Protocol

When the user reports anything broken/wrong/missing, **before writing any response**
run: (1) `git log --oneline <base>..HEAD`, (2) `git diff <base>..HEAD -- <file>`,
(3) read the file if the diff isn't enough. Then respond, grounded in the code.

Never open with "can you share the error / is this pre-existing / have you tried" or
anything redirecting toward user error. The user is the source of truth on what they
see; the code is the source of truth on why. Investigate the code.
