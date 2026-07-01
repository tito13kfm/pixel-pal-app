# PIXEL.PAL: Architecture Rebuild Roadmap

Status: active north-star. Last updated 2026-06-10.

This is the program-level framing for getting PIXEL.PAL off its artifact origin and
onto a properly-built foundation. Individual efforts each get their own spec → plan
→ PR; this doc exists so those efforts stay aimed at one target and don't drift into
symptom-patching.

## North star (definition of done)

> **`App.tsx` small + typed + state-sliced.**

Concretely:
- `App.tsx` is a thin composition root, not a 5000-line god component.
- No `@ts-nocheck` anywhere in `src/` (today: `App.tsx` + `color.ts`).
- State is sliced so an interaction re-renders only the panels that depend on it,
  not the whole tree.

Reaching that single end-state resolves all three concerns below at once; they are
not separate projects.

## Why (root cause)

The app was ported whole from a ~7820-line single-file Claude artifact
(`tests/pixel-pal.tsx`, local-only). Two consequences are the root of everything:

1. **`@ts-nocheck`** on `App.tsx` + `color.ts`: the type checker is blindfolded on
   the most-edited file. Every refactor is grep-gated, not compiler-gated (the exact
   hand-guarding the AI-removal spec has to do).
2. **One monolithic component**: `PixelPalGenerator` (~4986 lines: ~4016 logic +
   ~970 JSX) holding centralized state, with **0 `React.memo` / 0 `useCallback`**
   (true when this doc was first written; phase a/b have since added both, see SP2
   below). Any state change re-renders all panels.

The two original complaints trace here:
- **"Size goal underdelivered"**: the decomposition pulled *leaves* (panels/hooks/
  lib helpers) into files but left the *logic* (handlers, effects, static data) in
  `App.tsx`. **Corrected 2026-06-30/07-01** (see SP2 phase c below): the JSX
  `return` block is only ~970 lines and already delegates to the 7 extracted
  panels; the actual remaining bulk is ~4016 lines of inline handler logic, most
  of it never covered by Tier A/B despite that tier being marked done.
- **"Perf goal underdelivered"**: file boundaries are not render boundaries. Moving
  JSX to another file does nothing for re-renders; that needs memoization + sliced
  state, which the decomposition never included.

## Sub-projects (in order)

### SP1: Remove AI assist  ·  status: merged to master (PR #96, 2026-06-11); releases as 0.22.0

Full-stack delete of the AI palette feature (frontend `ai.ts` / `AISettingsPanel` /
`useAIAssist` / `WebKeyWarning` + `mode === 'ai'`; Rust `ai_config.rs` + `plugin-http`
+ `keyring`; `openai` dep). Keeps `aiColorNames` (the ramp name labels, a misnomer,
not AI-only). Removes `aiReasoning`.

Why first: it deletes a chunk of the monolith and its state, shrinking what SP2 then
rebuilds. Low risk, your firm directive.

Spec: `docs/superpowers/specs/2026-06-10-remove-ai-assist-design.md`
Ships as: **0.22.0** (MINOR, feature removal).

### SP2: Properly built (perf + size + types)  ·  status: active, phases a+b done

The umbrella that reaches the north star. Decomposes into phases (exact ordering is
decided at SP2's own brainstorm; they interleave):

- **Phase a: stabilize callbacks + memoize panels.** DONE, merged PR #102
  (2026-06-11). `useCallback` on handlers passed down; `HistoryPanel` +
  `PlaygroundPanel` wrapped in `React.memo`. Precondition for everything else
  (memo is useless while every handler is a fresh closure).
- **Phase b: slice hot state.** DONE, merged to master 2026-06-30. Zustand ramps
  store (`src/store/rampsStore.ts`); `usePaletteState` rewritten as a thin wrapper;
  `HarmonyPanel` callback-stabilized + memoized. `RampsPanel` direct-store-
  subscription and the other 3 unmemoized panels deliberately deferred, not this
  PR. See `docs/superpowers/specs/2026-06-30-sp2-phase-b-state-slicing-design.md`.
- **Phase c: extract logic to `lib/`/`hooks/`.** NEXT (renamed/inserted
  2026-07-01, corrects the original phase-c framing below; re-scoped again
  2026-07-01 after per-function verification). A structural dig found the
  ~4016-line logic block in `App.tsx` (not the JSX) is the real remaining
  bulk. Per-function verification (not just line counts) found only ~1000
  lines are genuinely clean-extract across 3 slices (themeTokens,
  export+hook, a narrow ramp pure-helper cluster); the rest of the original
  5-domain estimate turned out either interleaved with unrelated handlers
  (tour/pixel-picker/image-import inside "ramp core") or blocked by an
  existing Tier-B decision to keep sprite-import/image-remap handlers in
  `App.tsx` (those hooks already exist and already own the domain's state).
  See `docs/superpowers/specs/2026-07-01-sp2-phase-c-logic-extraction-design.md`.
- **Phase d: extract the trunk JSX.** Break the remaining `return` block (~970
  lines, not the ~4211 originally estimated: most of it already delegates to the
  7 Tier C panels) into layout sub-components. Much smaller than originally
  scoped; likely ~200-300 lines of genuine extraction (theme/CVD/zoom control
  cluster, floating overlays) once phase c lands.
- **Phase e: drop `@ts-nocheck`.** Once `App.tsx` is small, remove the directive and
  fix the residual type errors (few by then, most code already moved to typed files).
  Then the same for `color.ts`.

### Background (already done)

The leaf-extraction pulled real weight into typed files, but **did not cover
`App.tsx`'s handler logic** as thoroughly as originally believed (corrected
2026-07-01, see SP2 phase c above: a structural dig found ~4016 lines of
inline handlers/effects/static-data still in `App.tsx`, only partially
overlapping with Tier A/B's scope):
- Tier A: pure helpers → `lib/` (31 modules).
- Tier B: 14 stateful hooks → `hooks/`.
- Tier C: 7 panels → `components/` + a thin memoized context layer
  (Theme/Layout/Palette/Editor).

What remains is the logic block + the (much smaller than believed) trunk JSX +
state model + de-`nocheck`, i.e. SP2 phases c-e.

## Guardrails

- **Stay in React + TypeScript.** A framework or language change (SolidJS, Svelte,
  Rust/Dioxus, etc.) is a SEPARATE, explicit decision with its own ROI case; it is
  NOT assumed by "build it properly." The current problems are React-*usage* problems
  (missing memo, centralized state, `@ts-nocheck`), all fixable in place. Only revisit
  the stack if SP2 empirically proves React's ergonomics insufficient (not expected).
- **Incremental, never big-bang.** A wholesale retype/rearchitect on an untyped
  5000-line file produces an unreviewable diff (behavior changes hidden in noise).
  Each phase is behavior-preserving where possible and lands as its own small PR.
- **Verification while `@ts-nocheck` is live:** grep is the correctness gate for
  `App.tsx`/`color.ts` (the build can't catch dangling refs there); Rust and the
  typed `lib/` files are compiler-gated. Always: `npm run build` + `npm test` + e2e
  (desktop + web) + `npm run deadcode`.
- **Process conventions hold:** SemVer with explicit bump approval, CHANGELOG entry
  per release, branch-per-chunk, advisor at the two gates (approach-commit + done),
  ARCHITECTURE.md updated in the same PR when JSX moves out of `App.tsx`.

## Open decisions (resolved at each sub-project's brainstorm, not now)

- **SP2 phase b, state-slicing mechanism:** RESOLVED, Zustand. See
  `docs/superpowers/specs/2026-06-30-sp2-phase-b-state-slicing-design.md`.
- **SP2 phase ordering:** RESOLVED as a → b → c → d → e (see phase list above,
  corrected 2026-07-01). c (logic extraction) precedes d (trunk JSX extraction)
  because most of d's original scope turned out to already be delegated to Tier C
  panels; c is now the bigger lever.
- **Stack revisit:** out of scope unless SP2 surfaces a hard ceiling.

## Where things live

- This roadmap: `docs/architecture-rebuild-roadmap.md` (north-star, keep current).
- Per-effort specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
- Subsystem detail + landmines: `docs/ARCHITECTURE.md`.
- Review checklists: `docs/review-lenses.md`.
