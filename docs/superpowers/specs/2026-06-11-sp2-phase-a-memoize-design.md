# SP2 Phase a — Memoize the already-stable panels + render-count harness + hooks-lint gate

Status: design, approved 2026-06-11 (clean-subset scope). Part of the
architecture-rebuild program (`docs/architecture-rebuild-roadmap.md`), sub-project
SP2, phase **a**.

## Goal

Give PIXEL.PAL a perf floor by making render boundaries real for the panels where
it is **free of risk and free of rework**: wrap the two panels whose props are
*already referentially stable* (`HistoryPanel`, `PlaygroundPanel`) in `React.memo`
so an unrelated state change stops re-rendering them. Ship two durable pieces of
infrastructure alongside: a render-count test harness (mount real `<App>`, count
per-panel renders) and a blocking `react-hooks` lint gate — both reused by every
later SP2 phase.

This phase is **behavior-preserving** and adds **zero `useCallback`**. No state
moves, no JSX restructures, no dep-array risk. The only observable change is *fewer
re-renders*.

### Why this narrow (clean-subset decision, user-approved 2026-06-11)

memo only works if *every* prop is referentially stable. Only `HistoryPanel`
(0 props) and `PlaygroundPanel` (all props already stable: `useState` setters,
primitives, and the already-`useMemo`'d ramp arrays) qualify with no new code.
The other candidates (Saved ~7, Export ~10, Harmony ~5 handlers) would each need
`useCallback` wraps in `App.tsx` — and **phase b deletes that work**: whichever
state-slicing mechanism phase b picks (store or selector-context), handlers become
stable *by construction* (store/provider actions have stable identity), making the
wraps obsolete. So wrapping them now is guaranteed-throwaway *and* carries
stale-closure risk. Deferred. Ramps (~70 props) and Viz (~55) are deferred for the
same reason at larger scale.

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

| Panel | Props | All props already stable? | Phase-a verdict |
|---|---|---|---|
| **HistoryPanel** | 0 (pure `usePalette()`) | yes (no props) | **memo now — zero useCallback** |
| **PlaygroundPanel** | 7 | yes (setters + primitives + `useMemo`'d ramps) | **memo now — zero useCallback** |
| SavedPalettesPanel | ~18 | no (~7 raw handlers) | deferred (handler wraps = phase-b throwaway) |
| ExportPanel | ~20 | no (~10 raw handlers) | deferred (handler wraps = phase-b throwaway) |
| HarmonyPanel | ~14 | no (~5 raw handlers) | deferred (handler wraps = phase-b throwaway) |
| RampsPanel | ~70 (~40 handlers) | no | deferred (large; phase b/c shrinks props) |
| VizComparePanel | ~55 (~40 handlers) | no | deferred (large; phase b/c shrinks props) |

`PlaygroundPanel` props verified stable at the call site: `pgOpen` (primitive),
`vizStyle` (primitive), `setVizStyle` (`useState` setter — stable), `rampsBalanced`
/`rampsMuted`/`rampsPunchy` (already `useMemo`'d in App), `isDark` (`theme !== 'light'`
primitive). It correctly re-renders on ramp rebuild (its job); memo only stops the
*unrelated* re-renders.

### Why the other five are deferred

See "Why this narrow" above. Saved/Export/Harmony need `useCallback` wraps that
phase b's stable-by-construction actions delete; Ramps/Viz are the same at ~40-handler
scale plus a brittle diff. All five get memo'd later for free as phase b/c shrink and
stabilize their prop surface. RampsPanel re-renders on HSV drag regardless (it is the
editor).

## Scope

In scope:
- `React.memo` on **HistoryPanel and PlaygroundPanel only** (both already
  stable-prop; no `useCallback` added anywhere).
- Render-count test harness (mount real App, count per-panel renders) — durable,
  reused by later phases.
- `npm run lint:hooks` (scoped `react-hooks` lint) + grandfather the 19-warning
  backlog inline + blocking CI wiring — durable dep-array gate for later phases.

Out of scope (later SP2 phases): any `useCallback`; memo of
Saved/Export/Harmony/Ramps/Viz; any state relocation; trunk JSX extraction; dropping
`@ts-nocheck`.

## Verification

### Render-count harness
- `vitest.config.ts`: add `define` for `__APP_VERSION__` / `__BUILD_DATE__`
  (permanent — required for any App-mount test).
- `recordRender(name: string)`: a plain function (not a hook — avoids rules-of-hooks
  noise) each memo'd panel calls as its first body statement. It increments a
  module-scoped registry **only when a test flag is set** (no-op in prod — zero
  runtime cost, no visual/behavior change). Test enables/reads/resets the registry.
- Tests mount real `<App>` (no `StrictMode` wrapper — it double-renders and would
  double-count), expand the panel under test, reset counts, fire a **real**
  interaction via Testing Library, and assert:
  - **negative (the memo win):** toggling an orthogonal section (the **Tips** panel —
    `tipsOpen` is passed to no panel) re-renders neither HistoryPanel nor
    PlaygroundPanel (count 0);
  - **positive (memo not too aggressive):** PlaygroundPanel re-renders when its own
    input changes (a ramp rebuild, e.g. Generate); HistoryPanel re-renders when its
    `usePalette()` context changes (an undoable action).
- Note: `React.memo` does not stop **context**-driven re-renders. HistoryPanel
  re-renders when `usePalette()` changes (correct) — its *negative* test must pick an
  interaction that does not touch that context (Tips toggle qualifies).

### Dep-array safety net
- `npm run lint:hooks`: ESLint over `src/` with only `react-hooks/*` rules active
  (legacy `tseslint` backlog suppressed via a minimal flat config or `--rule`
  overrides; time-boxed — if fiddly, a separate config file is the escape hatch).
- **Grandfather the legacy backlog inline, gate at zero (no magic number).** The
  backlog is small and measured: **19 `exhaustive-deps` warnings** — 14 in `App.tsx`,
  1 each in `AdjacencyMatrix.tsx`, `CrossRampDither.tsx`, `DitherBlend.tsx`,
  `hooks/useHistory.ts`. Approach:
  1. Set `react-hooks/exhaustive-deps` to **`error`** (in the scoped `lint:hooks`
     config), `rules-of-hooks` stays error.
  2. Add `// eslint-disable-next-line react-hooks/exhaustive-deps` at each of the 19
     existing sites, annotated `// TODO(sp2-d): legacy dep array, verify when @ts-nocheck
     drops` — a grep-able worklist for phase d.
     - The 4 warnings in typed files (`useHistory.ts` + the 3 canvas components) are
       candidates to **fix** instead of grandfather — but only per-site, since adding a
       missing dep can re-run an effect and change behavior. Default: grandfather;
       upgrade to a real fix only where the diff is provably safe.
  3. CI runs `eslint --max-warnings 0` over the scoped config.
  - Why this over `--max-warnings <baseline>`: no drifting count to maintain. Clearing
    a warning means deleting its one disable line; introducing one is now a hard
    **error** (CI fails) until fixed or consciously disabled with a review-visible
    comment. New silent warnings become impossible. Phase d deletes the grandfather
    comments as it clears the backlog, reaching a clean zero with no config change.
- Wire `lint:hooks` into CI as a **blocking** gate (not advisory — advisory lints get
  ignored; guards must be mechanical, per the dash-guard precedent).

### Standard gates (unchanged)
`npm run build` (tsc --noEmit + vite) + `npm test` + e2e (desktop + web) +
`npm run deadcode`. Grep remains the dangling-ref gate inside `@ts-nocheck` files.

## PR plan

**One PR** (branch `sp2-phase-a-memoize`, already exists with the spec commits). It
is small and cohesive; no `useCallback` work means no per-panel risk to isolate.
Task order in the plan: (1) render-count harness, (2) vitest `define` + App-mount
smoke, (3) `lint:hooks` config + script + grandfather 19 + CI, (4) memo HistoryPanel
+ test, (5) memo PlaygroundPanel + test, (6) full gate + ARCHITECTURE.md + PR.

The lint-infra commits (task 3) are cleanly separable if review prefers a split, but
bundling is fine at this size.

PR conventions: advisor at the two gates, ARCHITECTURE.md updated in the same PR, all
gates green before merge, branch deleted after.

## Risks

- **`lint:hooks` scoping turns fiddly** on the legacy config — escape hatch is a
  separate minimal flat config (`eslint.hooks.config.js`); time-box it.
- **Harness false confidence** — a render-count test that mounts a panel in isolation
  proves nothing. Mitigated: tests mount real `<App>` (spike-confirmed it mounts) and
  fire real interactions. Reviewer checks the test actually drives App, not a stub.
- **Memo gives a deliberately small win** — only 2 panels; Saved/Export/Harmony/Ramps/
  Viz stay unmemo'd until phase b/c. Accepted: this phase buys the durable harness +
  lint gate and the zero-risk wins; the real isolation lands with state slicing.

## Definition of done (phase a)

HistoryPanel + PlaygroundPanel memo'd (zero `useCallback` added); `recordRender`
harness in place; render-count tests prove both skip an orthogonal re-render and still
re-render on their own input; `lint:hooks` is `error`-level, backlog grandfathered,
`--max-warnings 0` green and blocking in CI; all standard gates green; ARCHITECTURE.md
updated. Saved/Export/Harmony/Ramps/Viz explicitly carried to phase b/c.
