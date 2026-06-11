# PIXEL.PAL — Architecture Rebuild Roadmap

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

Reaching that single end-state resolves all three concerns below at once — they are
not separate projects.

## Why (root cause)

The app was ported whole from a ~7820-line single-file Claude artifact
(`tests/pixel-pal.tsx`, local-only). Two consequences are the root of everything:

1. **`@ts-nocheck`** on `App.tsx` + `color.ts` — the type checker is blindfolded on
   the most-edited file. Every refactor is grep-gated, not compiler-gated (the exact
   hand-guarding the AI-removal spec has to do).
2. **One monolithic component** — `PixelPalGenerator` (~5000 lines: ~678 logic +
   ~4211 JSX) holding centralized state, with **0 `React.memo` / 0 `useCallback`**.
   Any state change re-renders all panels.

The two original complaints trace here:
- **"Size goal underdelivered"** — the decomposition pulled *leaves* into files but
  left the *trunk* (the orchestration JSX) in `App.tsx`.
- **"Perf goal underdelivered"** — file boundaries are not render boundaries. Moving
  JSX to another file does nothing for re-renders; that needs memoization + sliced
  state, which the decomposition never included.

## Sub-projects (in order)

### SP1 — Remove AI assist  ·  status: merged to master (PR #96, 2026-06-11); releases as 0.22.0

Full-stack delete of the AI palette feature (frontend `ai.ts` / `AISettingsPanel` /
`useAIAssist` / `WebKeyWarning` + `mode === 'ai'`; Rust `ai_config.rs` + `plugin-http`
+ `keyring`; `openai` dep). Keeps `aiColorNames` (the ramp name labels — a misnomer,
not AI-only). Removes `aiReasoning`.

Why first: it deletes a chunk of the monolith and its state, shrinking what SP2 then
rebuilds. Low risk, your firm directive.

Spec: `docs/superpowers/specs/2026-06-10-remove-ai-assist-design.md`
Ships as: **0.22.0** (MINOR — feature removal).

### SP2 — Properly built (perf + size + types)  ·  status: not started

The umbrella that reaches the north star. Decomposes into phases (exact ordering is
decided at SP2's own brainstorm — they interleave):

- **Phase a — stabilize callbacks + memoize panels.** Add `useCallback` to handlers
  passed down; wrap extracted panels in `React.memo`. Cheap, low-risk perf floor.
  Precondition for everything else (memo is useless while every handler is a fresh
  closure).
- **Phase b — slice hot state.** The biggest lever and biggest decision (see Open
  Decisions). Move the hot editing state (ramps, per-ramp HSV, colors) out of the
  centralized `useState` block into per-domain slices that panels subscribe to.
  Fixes perf (scoped re-renders) AND size (collapses prop-drilling) together.
- **Phase c — extract the trunk.** Break the ~4211-line JSX `return` into layout
  sub-components. Much easier once state is sliced (panels pull their own slice
  instead of being threaded 10-20 props).
- **Phase d — drop `@ts-nocheck`.** Once `App.tsx` is small, remove the directive and
  fix the residual type errors (few by then — most code already moved to typed files).
  Then the same for `color.ts`.

### Background (already done)

The leaf-extraction is largely complete and IS properly built — those files are typed:
- Tier A: pure helpers → `lib/` (31 modules).
- Tier B: 14 stateful hooks → `hooks/`.
- Tier C: 7 panels → `components/` + a thin memoized context layer
  (Theme/Layout/Palette/Editor).

What remains is the trunk + state model + de-`nocheck` — i.e. SP2.

## Guardrails

- **Stay in React + TypeScript.** A framework or language change (SolidJS, Svelte,
  Rust/Dioxus, etc.) is a SEPARATE, explicit decision with its own ROI case — it is
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

- **SP2 phase b — state-slicing mechanism:** selector-based React Context vs a store
  (Zustand / Jotai). The real fork; pull advisor in there.
- **SP2 phase ordering:** a → b → c → d is the likely shape, but b (slicing) may need
  to precede parts of c (trunk extraction). Settled at SP2 brainstorm.
- **Stack revisit:** out of scope unless SP2 surfaces a hard ceiling.

## Where things live

- This roadmap: `docs/architecture-rebuild-roadmap.md` (north-star, keep current).
- Per-effort specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
- Subsystem detail + landmines: `docs/ARCHITECTURE.md`.
- Review checklists: `docs/review-lenses.md`.
