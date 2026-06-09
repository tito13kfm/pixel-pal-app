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

Legacy JS tests (`tests/test_*.js`, vm-sandbox) are local-only/gitignored. If the
glob matches nothing that's expected, not an error:
`foreach ($f in Get-ChildItem tests\test_*.js) { node $f }`

---

## Code Exploration

This repo is indexed by **Serena** (LSP semantic tools, TypeScript). Prefer Serena over
reading whole files. `App.tsx` is ~6,700 lines and string-match edits there are fragile:
- `get_symbols_overview` / `find_symbol`: locate a component/function by name or path.
- `find_referencing_symbols`: exact "who uses this" before a change.
- `replace_symbol_body` / `insert_after_symbol`: surgical edits addressed by symbol, not
  by quoting a unique string out of a huge file.

Fall back to `Read` with `offset`+`limit` for non-symbol context, Grep for literal matches.
Note: `App.tsx` + `color.ts` carry `// @ts-nocheck`, so Serena's symbol nav still works but
the LSP won't surface type errors there, so grep remains the real gate for dangling refs.

**Serena setup** (per machine): `uv tool install -p 3.13 serena-agent` → `serena init` →
`claude mcp add --scope user serena -- serena start-mcp-server --context claude-code --project-from-cwd`.
Index once after clone: `serena project create . --language typescript --index`. `.serena/` is
gitignored (memories kept local-only).

---

## Versioning & Releases

**SemVer, enforced from 0.13.0 on.** Pre-1.0 (standard): features → MINOR;
backward-compatible fixes → PATCH; breaking → MINOR (no MAJOR until 1.0). Choose
the bump from what changed, not by habit. (Pre-0.13.0 history was inconsistent,
see `CHANGELOG.md` `Versioning notes`.)

**Never pick the bump level silently. Default to PATCH; reserve MINOR for genuinely
substantial features.** State "proposing vX.Y.Z because ..." and wait for the user's OK
BEFORE `npm version` + tag. (One small toggle/control or a bugfix is a patch; a whole
feature like the spotlight-tour redesign is a minor.) Do not unwind an already-published
tag just to change the notch, apply going forward.

**Every release gets a CHANGELOG entry.** Before tagging, move notes from
`## [Unreleased]` into `## [x.y.z] - YYYY-MM-DD` (Keep-a-Changelog buckets:
Added/Changed/Fixed/Removed) + add the `compare/` footer link.

**Never bump a version without releasing it**, don't commit a version change to
`package.json`/`tauri.conf.json`/`Cargo.toml`/`Cargo.lock` unless it'll be tagged.

**Four version files move in lockstep, tag must match.** See `release-flow.md`
memory for the exact file list + tag/push procedure.

---

## Git Workflow

The user does not operate git directly. Every commit, merge, and branch op is the
agent's. **A merge is not "done" until its branch is gone, in the same session.**
This repo has GitHub "Automatically delete head branches" enabled, so the remote
ref is normally deleted on merge. Check what still exists, then delete only that.
Do not blind-delete: `git push origin --delete <name>` on an already-gone ref errors.

```powershell
git fetch --prune                                # drop stale remote-tracking refs
# remote: delete only if it survived the auto-cleanup
if (git ls-remote --heads origin <name>) { git push origin --delete <name> }
# local: -d (safe, refuses if unmerged) then -D fallback
git branch -d <name> 2>$null; if ($LASTEXITCODE) { git branch -D <name> }
```

---

## Code Navigation & Edits: use Serena

This repo has Serena (`.serena/project.yml`, TypeScript LSP) activated. **For any
`src/**` code file, use Serena tools, not the built-in Read/Edit:**

- **Navigate/read:** `get_symbols_overview` → `find_symbol` (`include_body`). No
  Read-for-discovery on code files.
- **Edit:** `replace_content` (regex, for a few lines inside a big symbol) /
  `replace_symbol_body` / `insert_before_symbol` / `insert_after_symbol`. **A
  `PreToolUse` hook hard-blocks the built-in Edit tool on `src/**/*.ts(x)`**, it
  is enforced, not advisory.
- **Cross-refs:** `find_referencing_symbols` first; keep `grep` as a *backup*
  completeness check (some refs in untyped files aren't type-linked).

`@ts-nocheck` does **not** blind Serena, the LSP still parses symbol structure
(it only suppresses *type diagnostics*). So Serena navigates `App.tsx`/`color.ts`
fine. But `get_diagnostics_for_file` is muted by `@ts-nocheck`, so the
**`sed`-strip-nocheck + `tsc` type-gate + grep stays the correctness gate**, Serena
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

**Web runtime:** plain browser, `window.__TAURI_INTERNALS__` is undefined. ALL
Tauri imports must be dynamic + gated on that check (`main.tsx`, `lib/ai.ts`); static
imports bloat the bundle / defeat tree-shaking. The `IS_WEB` build flag
(`src/lib/env.ts`) drives provider filtering + the key-warning banner + the desktop
footer link; runtime `isTauri()`/`__TAURI_INTERNALS__` drives storage/dialog/IPC
fallbacks.

**Persistence:** Tauri plugin-store for desktop settings; localStorage for palette
list, theme, web-only AI key. The `window.storage` shim in `src/App.tsx` bridges the
artifact's async storage API to localStorage, **do not remove**. (Typed globally in
`vite-env.d.ts`.)

---

## Critical Constraints

- **ESM project** (`"type": "module"`). Config files use `export default`, never
  `module.exports` (tailwind/postcss/vite/playwright configs).
- **`// @ts-nocheck` in `color.ts` + `App.tsx` is intentional, do not remove.**
  `color.ts` = 15 color-math fns extracted verbatim from the artifact (untyped). A
  consequence for refactors: `tsc`/`npm run build` does NOT catch dangling refs to
  removed locals inside these files, grep is the real gate.
- **`tests/package.json` + `scripts/package.json` = `{"type":"commonjs"}`** to scope
  CJS without touching root ESM. Do not delete (but both are LOCAL-ONLY: gitignored,
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
