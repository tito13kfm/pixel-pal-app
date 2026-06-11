# SP2 Phase a — Memoize panels + stabilize callbacks

Status: design, approved 2026-06-11. Part of the architecture-rebuild program
(`docs/architecture-rebuild-roadmap.md`), sub-project SP2, phase **a**.

## Goal

Give PIXEL.PAL a perf floor by making render boundaries real: wrap the extracted
panels in `React.memo` and stabilize the props they receive (`useCallback` /
`useMemo`) so an unrelated state change no longer re-renders every panel. This is
the precondition for the rest of SP2 — memo is inert while every handler passed
down is a fresh closure.

This phase is **behavior-preserving**. No state moves, no JSX restructures. The
only observable change is *fewer re-renders*.

## Background / why now

`App.tsx` (5091 lines, `@ts-nocheck`) holds all state in one component body with
**0 `React.memo` and 0 `useCallback`**. The 7 panels were extracted to
`src/components/panels/` (Tier C) and a 4-context layer
(Theme/Layout/Palette/Editor) already publishes App's state with narrow,
correctly-memoized `useMemo` deps. But the panels receive most data via **props**,
and because App re-renders its whole body on any state change, those prop
references are recreated every render — so even a memo'd panel would re-render.

Phase a closes that gap for the panels where it is cheap and high-value.

## Verified facts (spike, 2026-06-11)

- **`<App>` mounts in jsdom.** A throwaway mount test rendered App fully (to the
  footer); canvas `getContext('2d')` returns null but every call site null-guards,
  so it is jsdom noise, not a throw. Tauri is skipped (`__TAURI_INTERNALS__`
  undefined). The only prereq is stubbing the Vite `define` globals
  `__APP_VERSION__` / `__BUILD_DATE__` in `vitest.config.ts`.
  → The render-count harness can mount the **real** App and fire a **real**
  interaction, which is the only way a render-count test proves anything (mounting
  a panel in isolation just re-proves `React.memo` exists).
- **Context consumption:** 6/7 panels consume only `useTheme()` (rare changes);
  HistoryPanel consumes `usePalette()`. Hot data flows via **props**, not context.
- **`react-hooks/exhaustive-deps` is configured** (`eslint.config.js` extends
  `reactHooks.configs.flat.recommended`) but **nothing runs it** — no `lint`
  script, no CI step. `@ts-nocheck` does not blind ESLint.

## Per-panel input map (verified at call sites in App.tsx)

| Panel | Props | Hot inputs (HSV-drag / ramp-rebuild)? | Phase-a verdict |
|---|---|---|---|
| HistoryPanel | 0 (pure `usePalette()`) | context-only; re-renders on history change (correct) | **memo — pure win, no useCallback** |
| SavedPalettesPanel | ~18 | none (saved-domain state + handlers) | **cold → memo** |
| ExportPanel | ~20 | none (`exportActiveFormat`/`getSnapshotForSlot` are click handlers, not render values) | **cold → memo** |
| PlaygroundPanel | 7 | `rampsPunchy/Balanced/Muted` (rebuild) | hot but small → memo |
| HarmonyPanel | ~14 | `baseColors`, `harmony` (not HSV-drag) | hot-ish → memo |
| RampsPanel | ~70 (~40 handlers) | `editorHsv`/`editingIndex` + ramps (the active editor) | **deferred** |
| VizComparePanel | ~55 (~40 handlers) | ramps via `getSnapshotForSlot` | **deferred** |

### Why RampsPanel + VizCompare are deferred (user-approved)

To memo a panel, *every* prop must be referentially stable. Stabilizing ~40
handlers each on these two is a large brittle diff with high stale-closure risk —
and **SP2 phase b (state slicing) + phase c (trunk extraction) will collapse that
prop surface**, so doing it now means doing it twice. RampsPanel re-renders on HSV
drag regardless (it is the editor); the only residual waste is VizCompare redrawing
its canvases on drag *when the Viz section is expanded*. The 5 memo'd panels stop
re-rendering on unrelated changes — the bulk of the win, cheaply. Ramps + Viz get
memo'd in phase b/c once their props have shrunk.

## Scope

In scope:
- `React.memo` on HistoryPanel, SavedPalettesPanel, ExportPanel, PlaygroundPanel,
  HarmonyPanel (5 panels).
- `useCallback` / `useMemo` on **only** the props threaded into those 5 panels —
  not blanket wrapping (cargo-culted memo on values not passed to a memo'd child is
  pure overhead).
- Render-count test harness (mount real App, count per-panel renders).
- `npm run lint:hooks` (scoped exhaustive-deps) + CI wiring.

Out of scope (later SP2 phases): RampsPanel/VizCompare memo, any state relocation,
trunk JSX extraction, dropping `@ts-nocheck`.

## Verification

### Render-count harness
- `vitest.config.ts`: add `define` for `__APP_VERSION__` / `__BUILD_DATE__`
  (permanent — required for any App-mount test).
- `useRenderCount(name: string)`: a hook each memo'd panel calls as its first line.
  It increments a module-scoped registry **only when a test flag is set** (no-op in
  prod — zero runtime cost, no visual/behavior change). Test reads/resets the
  registry.
- Tests mount real `<App>`, fire a **real** interaction via Testing Library, and
  assert:
  - each cold panel (History/Saved/Export) does **not** re-render on an interaction
    provably orthogonal to its deps (e.g. toggle export format → Saved/History
    unchanged; change a viz control → Export unchanged);
  - each memo'd panel **does** re-render on its own input change (ramp rebuild for
    Playground; harmony change for Harmony).
- Note: `React.memo` does not stop **context**-driven re-renders. HistoryPanel
  re-renders when `usePalette()` changes (correct) — its test must pick an
  interaction that does not touch that context.

### Dep-array safety net
- `npm run lint:hooks`: ESLint over `src/` with only `react-hooks/*` rules active
  (legacy `tseslint` backlog suppressed via a minimal flat config or `--rule`
  overrides; time-boxed — if fiddly, a separate config file is the escape hatch).
- **Baseline-diff, not zero:** `exhaustive-deps` is `warn` by default and the
  artifact carries pre-existing warnings, so a naive `--max-warnings 0` fails on day
  one. Gate blocking via `eslint ... --max-warnings <baseline-count>` where baseline =
  today's pre-existing count; any *new* warning my `useCallback`s introduce pushes the
  total over baseline and fails CI. Mirrors the tsc completeness gate.
  - Ratchet note (one-line CI comment): if a future change *removes* a warning, shrink
    the baseline number so it can't silently mask a new one. Phase d (drop `@ts-nocheck`)
    will clear App.tsx's backlog and let this go to `--max-warnings 0`.
- Wire `lint:hooks` into CI as a **blocking** gate (not advisory — advisory lints get
  ignored; guards must be mechanical, per the dash-guard precedent).

### Standard gates (unchanged)
`npm run build` (tsc --noEmit + vite) + `npm test` + e2e (desktop + web) +
`npm run deadcode`. Grep remains the dangling-ref gate inside `@ts-nocheck` files.

## PR plan (risk-ordered, one fresh session per chunk)

- **PR1 — infra + cold trio.** vitest `define`; `useRenderCount` hook; `lint:hooks`
  script + CI; baseline warning snapshot. Memo HistoryPanel (zero props),
  SavedPalettesPanel, ExportPanel; `useCallback` their ~19 handler props. Render-count
  tests for the trio. Update `docs/ARCHITECTURE.md` (note memo boundaries).
- **PR2 — small hot panels.** Memo PlaygroundPanel + HarmonyPanel; stabilize their
  props. Render-count tests (re-render on own input, not on unrelated toggle).

Each PR: branch off master, advisor at the two gates, ARCHITECTURE.md updated in the
same PR, CI green before merge, branch deleted after.

## Risks

- **Stale closure from a wrong `useCallback` dep array** — the main hazard;
  `@ts-nocheck` won't catch it. Mitigated by `lint:hooks` + render-count tests +
  advisor review of dep arrays.
- **`lint:hooks` scoping turns fiddly** on the legacy file — escape hatch is a
  separate minimal flat config; time-box it.
- **Memo gives a smaller win than hoped** because RampsPanel/Viz stay unmemo'd —
  accepted tradeoff; full HSV-drag isolation lands in phase b/c.

## Definition of done (phase a)

5 panels memo'd; their props stabilized; render-count tests prove idle panels skip
unrelated re-renders; `lint:hooks` green (no new warnings) and in CI; all standard
gates green; ARCHITECTURE.md updated. RampsPanel/VizCompare explicitly carried to
phase b/c.
