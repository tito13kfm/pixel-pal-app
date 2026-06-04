# Handoff — Ramp Engine v2 (issue #35)

**Written:** 2026-06-03 (work machine) for continuation on the home machine.
**Branch:** `feat/ramp-engine-v2` (pushed to origin). Branched off `master` AFTER
PRs #33/#34 merged, so it already contains the Tier B decomposition + the #30
comment fix.

## What this is

Fix for **issue #35**: ramps for perceptually light bases (e.g. green `#37CD76`)
come out lopsided — 5 shadows, 1 stranded near-white highlight, because the base
slot is placed by absolute OKLCH lightness. Confirmed root cause in
`src/lib/ramp-engine.ts` (`baseIndex = round(frac·(N-1))`), and that the live and
snapshot paths already mirror (so the fix must preserve that).

## State of the world

- **DONE & on `master`:** Tier B decomposition complete (PR #33). #30 resolved as
  a comment fix (PR #34). #35 filed.
- **DONE & on this branch (not yet implemented, just designed):**
  - Spec: `docs/superpowers/specs/2026-06-03-ramp-engine-v2-distribution-design.md`
  - Plan: `docs/superpowers/plans/2026-06-03-ramp-engine-v2-distribution.md`
- **NOT STARTED:** the 9 implementation tasks in the plan. No code written yet.

## Design decisions already locked (do NOT re-litigate)

1. **v2 = re-center the slot split + smooth steps.** v1 and v2 differ in EXACTLY
   one function, `computeBaseIndex`. Everything else is shared.
2. **Old palettes must not change look.** `engineVersion` on the saved payload +
   snapshot; absent → 1 → byte-identical legacy render. New palettes = v2.
   Loading a v1 palette renders v1 until an (out-of-scope) explicit upgrade.
3. **Mirror is structural:** extract ONE shared `buildRamp` pipeline that both the
   live `App.tsx` memos and `buildRampsForSnapshot` call. Do not re-implement the
   pipeline in two places (that caused #30).
4. **Acceptance is VISUAL first, numbers second** (plan Task 7). Render v1-vs-v2
   strips, get the user's eye approval, THEN freeze the numbers as regression
   guards. Design target stated up front: *no adjacent ΔL > 1.5× median ΔL*.
   Do not tune the threshold to whatever the constants happen to produce.

## How to continue

Execute the plan with `superpowers:executing-plans` (NOT subagent-driven — Task 7
needs a live human visual gate). Recommended chunking (token-control: one chunk =
one fresh session, context never compounds):

- **Session A — Tasks 1–3** (zero behaviour change, safe): characterize v1 →
  extract shared `buildRamp` → thread `engineVersion`. All green, all committed.
- **Session B — Tasks 4–7** (the fix + visual sign-off): v2 allocation +
  threshold test → tiny-N edges → mirror at both versions → **render strips,
  get the user to approve the look**, then freeze v2 snapshots.
- **Session C — Tasks 8–9:** new=v2/old=v1 routing → integration, PR, green CI,
  finish.

## Exact prompt for the next Claude

> Execute the ramp-engine-v2 plan, Tasks 1–3. Read
> `docs/superpowers/plans/2026-06-03-ramp-engine-v2-distribution.md` and its spec
> `docs/superpowers/specs/2026-06-03-ramp-engine-v2-distribution-design.md` and this
> handoff first. Use superpowers:executing-plans. Branch `feat/ramp-engine-v2` is
> already checked out / pull it. Stop after Task 3 (the safe zero-behaviour-change
> refactor), commit each task, report.

## Gotchas / environment

- `src/App.tsx` is `@ts-nocheck` — grep per moved symbol is the real gate; build
  green is necessary but not sufficient. (For larger moves, the TS2304 baseline
  trick: temporarily drop `@ts-nocheck` line 1, `tsc --noEmit`, diff new
  `Cannot find name` hits, restore via **sed not `git checkout`** — git checkout
  wipes uncommitted work.)
- Windows work box: local Tauri build via `cargo build -j 1` (pagefile). For just
  seeing the app, `npm run dev` (browser). The dev server binds to the machine
  it runs on — if you're remote, screenshot it rather than expecting localhost.
- Local-only (won't have synced from the work box): `skill-observations/` log
  (obs #12 = "validate a filed issue's premise before implementing its suggested
  fix"; obs #11 = "verification gates restore by inverse, not git-checkout" — #11
  is already a rule in the synced global CLAUDE.md). Not needed to execute the plan.
- Empirical helper used during design (light-vs-dark inversion, per-step ΔL): a
  throwaway `npx tsx` script importing `generateRamp` + `styleToScalars`. The
  `#NaNNaNNaN` you may see if you omit `hueShiftStrength` is a test artifact, not
  a bug — always pass `hueShiftStrength: 1.0`.
