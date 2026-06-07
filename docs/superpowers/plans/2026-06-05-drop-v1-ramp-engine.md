# Drop v1 Ramp Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the v1/v2 ramp-engine branching so all palettes render on the v2 engine; auto-migrate old saved palettes with a one-time dismiss-forever notice.

**Architecture:** Delete the `engineVersion < 2` legacy branch and thread the `engineVersion` parameter/field out of the engine, pipeline, render snapshot, React state, and history. Keep `engineVersion` *only* at the persistence boundary in `App.tsx` (always written as `2`; read on load solely to decide the migration notice). A new `V2EngineNotice` component (mirroring `WebKeyWarning.tsx`) shows the notice; its detection predicate `isPreV2Palette` is the unit-tested logic.

**Tech Stack:** React 19 + TS 6, Vite, Vitest. Spec: `docs/superpowers/specs/2026-06-05-drop-v1-ramp-engine-design.md`.

**Branch:** `feat/drop-v1-ramp-engine-70` (already created off master; spec already committed as `7c2c370`).

---

## Critical constraints (read before starting)

- **`src/App.tsx` has `// @ts-nocheck`.** `npm run build`/`tsc` will NOT catch a dangling
  `engineVersion` reference inside App.tsx — it fails silently at runtime. The verification
  for any App.tsx task is the **strip-nocheck type gate** (Task 4 / Task 6), NOT build-green.
- **Restore the `@ts-nocheck` line with an inverse edit** (re-add the exact line). NEVER use
  `git checkout`/`git stash` to restore — it wipes the whole uncommitted sweep.
- **Do NOT touch the `curvePerRamp` migration block** in `ramp-pipeline.ts` (~lines 47-53) —
  out of scope (separately tracked).
- **No version bump in this work.** Version files + CHANGELOG move in a separate release
  commit (v0.20.0), not in this feature branch.

## File map

- `src/lib/ramp-engine.ts` — modify: drop v1 branch + `engineVersion` param/opt. (typed)
- `src/lib/ramp-pipeline.ts` — modify: drop `engineVersion` destructure + plumb. (typed)
- `src/lib/snapshot-ramps.ts` — modify: drop `engineVersion` from `RampSnapshot`. (typed)
- `src/hooks/usePaletteState.ts` — modify: drop `engineVersion` state/snapshot/return. (typed)
- `src/lib/history-snapshot.ts` — modify: drop `'engineVersion'` from `SNAPSHOT_FIELDS`. (typed)
- `src/components/V2EngineNotice.tsx` — **create**: notice component + `isPreV2Palette` predicate.
- `src/App.tsx` — modify: wire notice, drop `engineVersion` from memos, keep frozen `2` on save. (`@ts-nocheck`)
- `tests/unit/ramp-v1-characterization.spec.ts` — **delete**.
- `tests/unit/ramp-mirror.spec.ts` — modify: delete the v1≠v2 test; strip `engineVersion`.
- `tests/unit/ramp-engine-v2.spec.ts` — modify: drop `engineVersion: 2` from helper.
- `tests/unit/history-snapshot.spec.ts` — modify: drop `'engineVersion'`; "20"→"19".
- `tests/unit/v2-engine-notice.spec.ts` — **create**: `isPreV2Palette` unit tests.

---

## Task 1: Engine always renders v2; retire v1-only tests

The v2 engine has been the active path for all new palettes. This task makes `computeBaseIndex`
unconditionally use the v2 allocation and removes the tests that exist only to freeze v1.
`tests/unit/ramp-engine-v2.spec.ts` is the surviving characterization guard (it asserts v2
distribution properties) and must stay green throughout.

**Files:**
- Modify: `src/lib/ramp-engine.ts:64-79` (computeBaseIndex), `:103` (the call site)
- Delete: `tests/unit/ramp-v1-characterization.spec.ts`
- Modify: `tests/unit/ramp-mirror.spec.ts:29-37` (delete one test)
- Modify: `tests/unit/ramp-pipeline-characterization.spec.ts` + its
  `tests/unit/__snapshots__/ramp-pipeline-characterization.spec.ts.snap` — this
  full-pipeline guard's snapshot was frozen against v1 output (it feeds
  `buildRampsForSnapshot` with no `engineVersion`, which defaulted to v1). With v2
  unconditional, cases A/B legitimately change. **Refresh** the snapshot to v2
  (`npx vitest run tests/unit/ramp-pipeline-characterization.spec.ts -u`) and
  rewrite the stale header comment (it references the old buildRamp-extraction
  plan's "Tasks 2-3" / per-ramp-hue story) to state it now freezes v2 pipeline
  output — the only engine post-#70. Keep the guard; it's the only test covering
  the full pins/hidden/hardware/curves/sat/size/shuffle chain.

- [ ] **Step 1: Establish the v2 baseline (must already pass)**

Run: `npx vitest run tests/unit/ramp-engine-v2.spec.ts`
Expected: PASS — this is the behavior we must preserve.

- [ ] **Step 2: Make `computeBaseIndex` unconditionally v2**

In `src/lib/ramp-engine.ts`, change the signature (remove the `engineVersion` param) and delete
the `engineVersion < 2` branch. Replace lines 64-79 with:

```ts
function computeBaseIndex(
  baseL: number, darkBottom: number, lightTop: number, N: number,
): number {
  if (N <= 1) return 0;
  const span = lightTop - darkBottom;
  const proportionalDark = span > 1e-6 ? (baseL - darkBottom) / span : 0.5;
  // v2 — bias toward center, fading with N; guarantee a usable short side.
  const w = clamp(V2_BIAS_C / (N - 1), 0, V2_BIAS_MAX);
  const biasedDark = lerp(proportionalDark, 0.5, w);
  const minSide = Math.min(V2_MIN_SIDE, Math.floor((N - 1) / 2));
  return clamp(Math.round(biasedDark * (N - 1)), minSide, (N - 1) - minSide);
}
```

- [ ] **Step 3: Update the call site in `generateRamp`**

In `src/lib/ramp-engine.ts:103`, drop the engineVersion argument:

```ts
  const baseIndex = computeBaseIndex(base.L, darkBottom, lightTop, N);
```

(`opts.engineVersion` is now unused here; it stays in `GenerateRampOpts` until Task 2 removes
it. `ramp-pipeline.ts` still compiles — it passes a field that the engine now ignores.)

- [ ] **Step 4: Delete the v1 characterization test**

```bash
git rm tests/unit/ramp-v1-characterization.spec.ts
```

- [ ] **Step 5: Delete the v1≠v2 mirror test**

In `tests/unit/ramp-mirror.spec.ts`, delete the entire `it('engineVersion drives the snapshot
path: v2 ≠ v1 for off-center bases', ...)` test (≈ lines 29-37). Its premise — two engines
producing different output — no longer exists. Leave the other test(s) in the file untouched
for now (Task 2 strips their `engineVersion` usage).

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS. (v1 characterization gone; v1≠v2 mirror test gone; `ramp-engine-v2.spec.ts`
still passes because the engine still produces identical v2 output.)

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: PASS (tsc clean — `ramp-engine.ts` is typed; the removed param has no remaining
typed caller mismatch).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ramp-engine.ts tests/unit/ramp-mirror.spec.ts
git commit -m "refactor(ramp): computeBaseIndex always v2; drop v1 characterization (#70)"
```

---

## Task 2: Remove dead `engineVersion` plumbing from typed modules

Pure dead-code removal across typed files (tsc is the gate). After Task 1 the value is ignored;
now delete the field/param everywhere in the rendering type chain. `App.tsx` and
`usePaletteState.ts` still reference `engineVersion` after this task — that is fine and handled
in Tasks 4-5 (App.tsx adds an excess property to a snapshot literal, which `@ts-nocheck` ignores
and the engine no longer reads).

**Files:**
- Modify: `src/lib/ramp-engine.ts:19` (`GenerateRampOpts`)
- Modify: `src/lib/ramp-pipeline.ts:44` (destructure), `:94` (plumb)
- Modify: `src/lib/snapshot-ramps.ts:69` (`RampSnapshot`)
- Modify: `tests/unit/ramp-engine-v2.spec.ts:11`
- Modify: `tests/unit/ramp-mirror.spec.ts:23`

- [ ] **Step 1: Drop `engineVersion` from `GenerateRampOpts`**

In `src/lib/ramp-engine.ts`, delete this line (~19):

```ts
  engineVersion?: number; // 1 = legacy (default), 2 = re-centered allocation (Task 4)
```

- [ ] **Step 2: Drop `engineVersion` from the pipeline**

In `src/lib/ramp-pipeline.ts`, remove the destructure default (~44):

```ts
    engineVersion = 1,
```

and remove the argument passed into `generateRampNew` (~94, the line that reads
`engineVersion,`). Do NOT touch the `curvePerRamp` block above it.

- [ ] **Step 3: Drop `engineVersion` from `RampSnapshot`**

In `src/lib/snapshot-ramps.ts`, delete this line (~69):

```ts
  engineVersion?: number; // absent -> 1 (legacy render); new palettes -> 2 (Task 8)
```

- [ ] **Step 4: Strip `engineVersion` from the engine-v2 test helper**

In `tests/unit/ramp-engine-v2.spec.ts:11`, change:

```ts
  return generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0, engineVersion: 2 });
```
to:
```ts
  return generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0 });
```

- [ ] **Step 5: Strip `engineVersion` from the remaining mirror test**

In `tests/unit/ramp-mirror.spec.ts:23`, change `{ ...snap, engineVersion: 2 }` to `snap`
(or `{ ...snap }`). Verify no other `engineVersion` token remains in the file.

- [ ] **Step 6: Type-check, test, build**

Run: `npx tsc --noEmit`
Expected: PASS (all five files above are typed; no dangling references).

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ramp-engine.ts src/lib/ramp-pipeline.ts src/lib/snapshot-ramps.ts \
        tests/unit/ramp-engine-v2.spec.ts tests/unit/ramp-mirror.spec.ts
git commit -m "refactor(ramp): remove engineVersion plumbing from engine/pipeline/snapshot (#70)"
```

---

## Task 3: Create `V2EngineNotice` + TDD the `isPreV2Palette` predicate

The notice component mirrors the untested `WebKeyWarning.tsx` (project has no component-test
harness — no `@testing-library/react`, no `.tsx` specs). The testable logic is the detection
predicate, which we TDD as a pure function.

**Files:**
- Create: `src/components/V2EngineNotice.tsx`
- Create: `tests/unit/v2-engine-notice.spec.ts`

- [ ] **Step 1: Write the failing predicate test**

Create `tests/unit/v2-engine-notice.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isPreV2Palette } from '../../src/components/V2EngineNotice';

describe('isPreV2Palette', () => {
  it('false for a v2 save (no notice)', () => {
    expect(isPreV2Palette({ engineVersion: 2 })).toBe(false);
  });
  it('true for an explicit v1 save', () => {
    expect(isPreV2Palette({ engineVersion: 1 })).toBe(true);
  });
  it('true when engineVersion is absent (pre-v2 save)', () => {
    expect(isPreV2Palette({})).toBe(true);
  });
  it('true for a non-2 engineVersion value', () => {
    expect(isPreV2Palette({ engineVersion: 'x' as unknown as number })).toBe(true);
  });
  it('false for null/undefined parsed payload', () => {
    expect(isPreV2Palette(null)).toBe(false);
    expect(isPreV2Palette(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/v2-engine-notice.spec.ts`
Expected: FAIL — cannot resolve `../../src/components/V2EngineNotice`.

- [ ] **Step 3: Create the component + predicate**

Create `src/components/V2EngineNotice.tsx`:

```tsx
import { useState, useEffect } from 'react'

const DISMISS_KEY = 'v2EngineNoticeDismissed'

/**
 * True when a loaded saved-palette payload predates the v2 engine and will be
 * auto-migrated (its look may change). The save path always writes
 * engineVersion: 2, so any payload lacking exactly 2 is a pre-v2 save.
 */
export function isPreV2Palette(parsed: { engineVersion?: unknown } | null | undefined): boolean {
  return !!parsed && (parsed as { engineVersion?: unknown }).engineVersion !== 2
}

export function V2EngineNotice({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (!show || dismissed) return null

  return (
    <div className="bg-cyan-950/50 border border-cyan-600/40 rounded p-3 mb-3 text-xs text-cyan-200 font-mono leading-relaxed">
      <div className="flex justify-between items-start mb-1">
        <span className="font-bold text-cyan-300">⚙ SHADING ENGINE UPDATED</span>
        <button
          onClick={handleDismiss}
          className="text-cyan-400/70 hover:text-cyan-300 leading-none ml-2"
          aria-label="Dismiss notice"
        >
          ✕
        </button>
      </div>
      <p>
        Palettes now use the updated shading engine; older saves may look
        slightly different.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify the predicate test passes**

Run: `npx vitest run tests/unit/v2-engine-notice.spec.ts`
Expected: PASS (all 6 assertions).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/V2EngineNotice.tsx tests/unit/v2-engine-notice.spec.ts
git commit -m "feat(ramp): add V2EngineNotice migration banner + isPreV2Palette (#70)"
```

---

## Task 4: Wire the notice into App.tsx; remove `engineVersion` from memos; keep frozen 2 on save

`App.tsx` has `@ts-nocheck`, so the verification is the strip-nocheck type gate, not build.

**Files:**
- Modify: `src/App.tsx` — `:164` (destructure), `:561-562` (liveRampSnapshot),
  `:2324` (buildWorkingSnapshot), `:2346` (buildClassicSnapshot), `:2590` (save payload),
  `:2653-2656` (load path), banner render site (near `<WebKeyWarning`).

- [ ] **Step 1: Import the notice + predicate**

Add to the imports in `src/App.tsx` (near the other component imports):

```tsx
import { V2EngineNotice, isPreV2Palette } from './components/V2EngineNotice'
```

- [ ] **Step 2: Add the session-pending flag**

Add a state hook in App (near other `useState` declarations in the component body):

```tsx
const [v2NoticePending, setV2NoticePending] = useState(false)
```

- [ ] **Step 3: Remove `engineVersion` from the usePaletteState destructure**

In `src/App.tsx:164`, delete `engineVersion, setEngineVersion,` from the destructured
`usePaletteState()` return. (The hook still returns them until Task 5; not destructuring is
harmless.)

- [ ] **Step 4: Remove `engineVersion` from `liveRampSnapshot`**

In `src/App.tsx:561-562`, delete the `engineVersion,` entry from the memo's returned object AND
remove `engineVersion` from that memo's dependency array.

- [ ] **Step 5: Remove `engineVersion` from the working + classic snapshots**

In `buildWorkingSnapshot` (~2324) delete the `engineVersion,` line. In `buildClassicSnapshot`
(~2346) delete the `engineVersion: 2,` line. (Both render via the v2 engine unconditionally now.)

- [ ] **Step 6: Keep the frozen `2` on save**

In the save payload (~2590), the current line is the shorthand `engineVersion,` (the destructured
variable, now removed). Replace it with an explicit literal:

```tsx
      engineVersion: 2, // frozen constant: marks this as a v2 save so load() won't fire the migration notice
```

- [ ] **Step 7: Replace the load path with notice detection**

In `src/App.tsx:2653-2656`, replace:

```tsx
      // engineVersion: only the explicit value 2 selects the v2 engine; absent
      // (pre-v2 saves) or anything else restores v1 so old palettes keep their
      // exact look until an explicit upgrade (upgrade UI deferred, #35).
      setEngineVersion(parsed.engineVersion === 2 ? 2 : 1);
```
with:
```tsx
      // engineVersion: v1 is gone — every palette renders on v2. A pre-v2 save
      // (engineVersion absent or !== 2) is auto-migrated on render; flag the
      // one-time notice. Migration persists lazily on the user's next save
      // (the save payload above always writes engineVersion: 2).
      if (isPreV2Palette(parsed)) setV2NoticePending(true);
```

- [ ] **Step 8: Render the banner**

Find where `<WebKeyWarning ... />` is rendered and add the notice adjacent to it:

```tsx
<V2EngineNotice show={v2NoticePending} />
```

- [ ] **Step 9: App.tsx type gate (PRIMARY verification)**

Temporarily strip the `@ts-nocheck` line so tsc actually checks App.tsx:

```bash
# remove ONLY the first line if it is the @ts-nocheck pragma
sed -i '1{/^\/\/ @ts-nocheck/d}' src/App.tsx
npx tsc --noEmit
```
Expected: NO `TS2304` error mentioning `engineVersion` or `setEngineVersion` (these symbols are
gone from App.tsx scope). Other pre-existing tsc errors from `@ts-nocheck` code may appear —
focus on confirming there is no `engineVersion`/`setEngineVersion`/`V2EngineNotice`/`isPreV2Palette`
/`v2NoticePending` "cannot find name" error. If any appears, fix the reference, re-run.

Restore the pragma with an INVERSE edit (re-add the exact line at the top) — NEVER
`git checkout`:

```bash
# re-add the pragma as the first line
printf '// @ts-nocheck\n%s' "$(cat src/App.tsx)" > src/App.tsx.tmp && mv src/App.tsx.tmp src/App.tsx
git diff --stat src/App.tsx   # confirm only intended changes; pragma restored
```

(If the worker prefers, do Steps via the Edit tool: delete line 1, run tsc, then re-add line 1
verbatim. The rule that matters: restore by inverse edit, not by a checkpoint revert.)

- [ ] **Step 10: Grep, test, build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Run: `git grep -n engineVersion -- src/App.tsx`
Expected: exactly ONE line — the `engineVersion: 2` frozen save constant. (The load-path read
now lives inside `isPreV2Palette`.)

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ramp): force v2 render + one-time migration notice; freeze save engineVersion:2 (#70)"
```

---

## Task 5: Remove `engineVersion` from `usePaletteState` + history kernel

By now App.tsx no longer consumes `engineVersion` from the hook, so it can leave the hook's API.

**Files:**
- Modify: `src/hooks/usePaletteState.ts` — `:62-68` (state+comment), `:86-87`/`:108`
  (buildSnapshot), `:111`/`:135` (applySnapshotFields), `:201` (return)
- Modify: `src/lib/history-snapshot.ts` — `:7-12` (`SNAPSHOT_FIELDS` + comment)
- Modify: `tests/unit/history-snapshot.spec.ts` — `:14-22`

- [ ] **Step 1: Update the history field test FIRST (red)**

In `tests/unit/history-snapshot.spec.ts`, change the test title and expected array:

```ts
  it('names exactly the 19 document fields', () => {
    expect(SNAPSHOT_FIELDS).toEqual([
      'baseColors', 'aiColorNames', 'aiReasoning', 'rampSize', 'shuffleSeed',
      'overrides', 'harmonyAnchor', 'rampSizeOverrides', 'rampSatOverrides',
      'hueShiftStrengthPerRamp', 'hiddenShades', 'rampShuffleOffsets',
      'hardwareLock', 'hueShiftStrength', 'lockedRamps', 'collapsedRamps',
      'lightnessCurvePerRamp', 'satCurvePerRamp', 'stylePresets',
    ]);
  });
```

Run: `npx vitest run tests/unit/history-snapshot.spec.ts`
Expected: FAIL — `SNAPSHOT_FIELDS` still contains `'engineVersion'`.

- [ ] **Step 2: Remove `'engineVersion'` from `SNAPSHOT_FIELDS`**

In `src/lib/history-snapshot.ts`, delete the explainer comment (lines 7-11) and the
`'engineVersion',` entry (line 12) from the `SNAPSHOT_FIELDS` array.

- [ ] **Step 3: Verify the history test passes**

Run: `npx vitest run tests/unit/history-snapshot.spec.ts`
Expected: PASS.

- [ ] **Step 4: Remove the `engineVersion` state from `usePaletteState`**

In `src/hooks/usePaletteState.ts`:
- Delete the explainer comment (lines 62-67) and the state declaration (line 68):
  `const [engineVersion, setEngineVersion] = useState(2);`
- In `buildSnapshot` delete the `engineVersion,` entry (line 108).
- In `applySnapshotFields` delete `setEngineVersion(snap.engineVersion ?? 1);` (line 135).
- In the hook's return object delete `engineVersion, setEngineVersion,` (line 201).
- Update the two comments that say "20 snapshot fields" (buildSnapshot ~86, applySnapshotFields
  ~111) to "19 snapshot fields".

- [ ] **Step 5: Type-check, test, build**

Run: `npx tsc --noEmit`
Expected: PASS (`usePaletteState.ts` and `history-snapshot.ts` are typed; App.tsx no longer
references the removed return members).

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePaletteState.ts src/lib/history-snapshot.ts tests/unit/history-snapshot.spec.ts
git commit -m "refactor(ramp): drop engineVersion from palette state + history kernel (#70)"
```

---

## Task 6: Final acceptance gate

Verification only — no code changes expected. If anything fails, fix in the owning task's file
and re-commit there.

- [ ] **Step 1: App.tsx type gate (repeat, holistic)**

Strip the `@ts-nocheck` pragma from `src/App.tsx`, run `npx tsc --noEmit`, confirm no
`engineVersion`-related "cannot find name" error, then restore the pragma with an inverse edit
(re-add line 1 verbatim). NEVER `git checkout`. Confirm `git diff src/App.tsx` is empty after
restore.

- [ ] **Step 2: Grep gate**

Run: `git grep -n engineVersion -- src/`
Expected: ONLY
- `src/App.tsx` — one line: `engineVersion: 2,` (frozen save constant)
- `src/components/V2EngineNotice.tsx` — the `isPreV2Palette` predicate + its doc comment

No `engineVersion` in `ramp-engine.ts`, `ramp-pipeline.ts`, `snapshot-ramps.ts`,
`usePaletteState.ts`, or `history-snapshot.ts`. No live v1/v2 branching anywhere.

- [ ] **Step 3: Full suite**

Run: `npx vitest run`
Expected: PASS. Confirm `ramp-v1-characterization.spec.ts` is gone and the suite count dropped
accordingly.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Behavioral acceptance (manual, dev server)**

Run: `npm run dev`. Then:
1. Generate a palette, save it. Inspect localStorage `palettes:<slug>` → contains
   `"engineVersion":2`.
2. Manually craft/edit a saved entry to remove `engineVersion` (simulate a pre-v2 save). Load it
   → the `⚙ SHADING ENGINE UPDATED` notice appears once.
3. Dismiss it → reload the app, load another pre-v2 palette → notice does NOT reappear
   (localStorage `v2EngineNoticeDismissed=1`).
4. Re-save the migrated palette → its stored payload now has `"engineVersion":2`.

---

## Self-review notes (already reconciled against the spec)

- **Spec coverage:** engine branch removal (T1), full plumbing removal (T2), notice component +
  predicate (T3), App.tsx wiring + frozen-2 save + lazy migration (T4), state/history removal
  (T5), acceptance grep/type/test/build/behavioral (T6). `curvePerRamp` explicitly untouched.
- **Out of scope confirmed:** no `curvePerRamp` retire, no #41/#62, no version bump (release
  commit handles v0.20.0 separately), no v1.0 graduation.
- **Type consistency:** `isPreV2Palette` / `V2EngineNotice` / `v2NoticePending` /
  `v2EngineNoticeDismissed` used identically across Tasks 3-4 and the tests.
```
