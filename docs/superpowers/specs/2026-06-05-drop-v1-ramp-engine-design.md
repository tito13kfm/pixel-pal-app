# Drop v1 ramp engine — design (#70)

**Date:** 2026-06-05
**Issue:** #70 (priority, breaking, cleanup sweep)
**Target release:** v0.20.0 (stay pre-1.0; breaking → MINOR per project semver policy)
**Branch:** `feat/drop-v1-ramp-engine-70`

## Problem

Every per-ramp feature (#52 reorder, #69 per-ramp styles, …) has to thread state
through *both* ramp-engine versions plus a thicket of absent-field load fallbacks.
The v1/v2 compat layer added in the #35 work gets more fragile with each feature.
Removing it is a correctness win and a natural cleanup-sweep point.

The v2 engine (re-centered slot allocation) has been the default for all new
palettes since it shipped. v1 survives only to render old saved palettes
byte-identically. We are dropping that guarantee.

## Settled decisions

1. **Old saved palettes auto-migrate to v2 + one-time notice.** On load, never
   honor a saved `engineVersion` of `1`/absent for rendering — render on v2. A
   one-time, dismiss-forever banner warns the look may shift. No per-palette
   opt-out, no v1 viewer. (Supersedes the `old-palette-opt-out` engineVersion
   opt-out mechanism *for the engine specifically*.)
2. **`engineVersion` stays as a frozen `2` at the persistence boundary only.**
   New saves always write `engineVersion: 2`. The load path reads
   `parsed.engineVersion` *solely* to decide whether to fire the migration
   notice. It is removed from everywhere else — live state, engine, pipeline,
   `RampSnapshot`, history fields. (Decision confirmed with user.)
3. **Notice is global, dismissed forever** — mirrors `WebKeyWarning.tsx`
   (localStorage flag). Appears the first time a pre-v2 palette is loaded; once
   dismissed, never returns. (Decision confirmed with user.)
4. **Re-save is lazy.** Loading a pre-v2 palette does NOT mutate storage on load.
   The palette migrates to `engineVersion: 2` only when the user next saves (the
   save path already writes `2`). The global dismiss-forever banner makes
   re-show behavior identical whether migration is lazy or eager, so lazy wins
   (no surprise storage writes on load).
5. **Scope = engine-only, standalone.** Does NOT include #41 (2–64 shades), #62
   (snapshot field unification), or the `curvePerRamp` legacy-curve migration —
   those stay separately tracked.
6. **No staged deprecation.** Break in this release; pre-1.0 breaking changes are
   allowed by the project semver policy.

## Why "keep frozen 2 at the boundary" (not full removal)

The notice must distinguish a pre-v2 save (look will change → warn) from a save
already written by the v2-aware app (looks correct → no warn). The only durable
signal is `parsed.engineVersion`. If new saves stopped writing the field, a
brand-new post-#70 user loading their *own* `engineVersion: 2` palettes would
trip the "older saves may look different" detection until they dismissed the
banner — a wrong message. Writing `2` on save + reading it on load keeps
detection accurate and self-healing. Cost: exactly two `engineVersion`
references remain in `src/`, both at the persistence boundary in `App.tsx`, with
no live v1/v2 branching anywhere. This satisfies the issue's acceptance
("at most a frozen schema constant").

## Removal surface (grounded in current code)

### Typed modules (tsc/build catches drift)

- **`src/lib/ramp-engine.ts`**
  - `computeBaseIndex` (line ~64): delete the `engineVersion < 2` branch
    (~70-72); drop the `engineVersion` param; always run the v2 allocation.
  - `generateRamp` (line ~103): drop `opts.engineVersion ?? 1` from the
    `computeBaseIndex` call.
  - `GenerateRampOpts` (line ~19): remove the `engineVersion?` field.
- **`src/lib/ramp-pipeline.ts`**
  - Remove `engineVersion = 1` from the destructure (~44) and the
    `engineVersion` arg passed into `generateRampNew` (~94).
  - **Leave the `curvePerRamp` migration block (~47-53) untouched — out of scope.**
- **`src/lib/snapshot-ramps.ts`**
  - Remove `engineVersion?: number` from `RampSnapshot` (~69).
- **`src/hooks/usePaletteState.ts`**
  - Remove the `engineVersion` state/setter (~68) and its explainer comment
    (~62-67).
  - Remove `engineVersion` from `buildSnapshot` (~108) and `applySnapshotFields`
    (~135, the `?? 1`).
  - Fix the "20 snapshot fields" comment → 19 (appears on `buildSnapshot` and
    `applySnapshotFields`).
- **`src/lib/history-snapshot.ts`**
  - Remove `'engineVersion'` from `SNAPSHOT_FIELDS` (~12) and the explainer
    comment (~7-11).

### App.tsx (`@ts-nocheck` — grep/tsc-gate, not build)

- Remove `engineVersion, setEngineVersion` from the `usePaletteState` destructure
  (~164).
- Drop `engineVersion` from:
  - `liveRampSnapshot` memo object + dep array (~561-562),
  - `buildWorkingSnapshot` (~2324),
  - `buildClassicSnapshot` (~2346).
- **Persistence boundary — the two refs that remain:**
  - **Save** (~2590): keep `engineVersion: 2` as a frozen constant in the save
    payload.
  - **Load** (~2653-2656): replace `setEngineVersion(parsed.engineVersion === 2 ? 2 : 1)`
    with notice detection — `if (parsed.engineVersion !== 2) { <mark notice pending> }`.
    Set no engine state. No storage write here (lazy migration).

## One-time notice component

New `src/components/V2EngineNotice.tsx`, modeled on `src/components/WebKeyWarning.tsx`:

- localStorage dismiss key, e.g. `v2EngineNoticeDismissed`.
- Renders `null` when dismissed (`=== '1'`) or when no pre-v2 palette has been
  loaded this session.
- Shown when the load path flagged a pre-v2 palette this session. Mechanism: a
  small session flag in App state (e.g. `v2NoticePending`) set in the load path,
  passed to the component (or the component is conditionally rendered on it).
- Copy: **"Palettes now use the updated shading engine; older saves may look
  slightly different."**
- Dismiss button writes the localStorage flag and hides the banner permanently.

Placement: alongside the existing app-level banners (mirror where
`WebKeyWarning` is rendered).

## Tests

- **Delete** `tests/unit/ramp-v1-characterization.spec.ts` (exists only to freeze
  v1 byte-identical output).
- `tests/unit/ramp-engine-v2.spec.ts`: remove `engineVersion: 2` from the helper
  call (the engine is v2 by definition now). Keep the file — it is now the
  engine's characterization.
- `tests/unit/ramp-mirror.spec.ts`: **delete** the
  "engineVersion drives the snapshot path: v2 ≠ v1 for off-center bases" test
  (its premise — two engines differ — is gone). Strip `engineVersion` from the
  remaining structural-mirror test.
- `tests/unit/history-snapshot.spec.ts`: remove `'engineVersion'` from the
  expected `SNAPSHOT_FIELDS` list (~21).

## Verification (acceptance)

Primary gate is the `@ts-nocheck` type-check, NOT `npm run build` — App.tsx has
`@ts-nocheck`, so build will not catch a dangling `engineVersion` reference
inside it (a stale dep array, literal, or read fails silently at runtime).

1. **App.tsx type gate.** Temporarily strip the `// @ts-nocheck` line from
   `src/App.tsx`; run `npx tsc --noEmit`; confirm **zero** `TS2304` errors
   referencing `engineVersion`. Restore the line with the *inverse* edit (re-add
   the exact `// @ts-nocheck` line). **Never** `git checkout`/`git stash` to
   restore — that wipes the whole uncommitted sweep (per global CLAUDE.md rule).
   Confirm `git diff` shows only the intended changes afterward.
2. **Grep gate.** `grep -rn engineVersion src/` returns exactly the two
   persistence-boundary refs in `App.tsx` (save write, load read) and nothing
   else — no live v1/v2 branching.
3. **Tests.** `npx vitest run` green (v1 characterization removed, mirror v1/v2
   test removed, history-snapshot field list updated).
4. **Build.** `npm run build` green.
5. **Behavioral acceptance.** Loading a pre-v2 saved palette renders on v2,
   surfaces the notice once (then never again after dismissal), and re-saves as
   v2 on the next save. No per-ramp feature still carries a "v1 vs v2" path.

## Release (v0.20.0)

This release sweeps up all merged-but-unreleased work, not just #70:

- **#70** — drop v1 ramp engine (this work). Changed/Removed.
- **#68** — Add-base feedback layout-jolt fix (already merged to master, no
  release yet). Fixed.
- **#48** — Atkinson + Stucki error-diffusion dither kernels (PR #73, CI green;
  merge before cutting the release). Added.

Release mechanics (separate from the feature PR):

- Do **not** bump versions in the #70 feature PR. Version bumps happen only at
  release time (memory: never bump without releasing).
- At release: move `## [Unreleased]` notes into `## [0.20.0] - <date>`
  (Keep-a-Changelog buckets), add the `compare/` footer link, bump the four
  version files in lockstep (`package.json`, `tauri.conf.json`, `Cargo.toml`,
  `Cargo.lock`), tag `v0.20.0`, push — `release.yml` fires. See `release-flow`
  memory for the exact procedure.

## Out of scope

- `curvePerRamp` legacy-curve retire (separate, file/do alongside in its own PR).
- #41 (2–64 shades), #62 (snapshot field unification).
- No graduation to v1.0 this release.
