# Ramp Engine v2 — Even Shade Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix lopsided ramps for perceptually light/dark base colours (issue #35) by re-centering the shade slot split, without changing the look of any previously-saved palette.

**Architecture:** v1 and v2 differ in exactly ONE function — `computeBaseIndex` (slot allocation). v1 places the base by absolute perceptual lightness; v2 biases the split toward center (fading with N) with a guaranteed minimum per side. The existing per-arm eased curve handles stepping; balanced allocation makes base→neighbour steps small and similar. A new shared `buildRamp` pipeline is the single code path both the live ramps and `buildRampsForSnapshot` call, so the live↔snapshot mirror is structural. Palettes carry `engineVersion`; absent → 1 → byte-identical legacy render.

**Tech Stack:** TypeScript, Vite, Vitest (jsdom), Playwright e2e. Engine is pure (`src/lib/`). OKLCH colour math in `src/lib/oklch.ts`. Spec: `docs/superpowers/specs/2026-06-03-ramp-engine-v2-distribution-design.md`.

---

## Critical rules

1. **v1 must stay byte-identical.** Task 1 pins it with a characterization snapshot BEFORE any refactor. If a v1 snapshot value ever changes, stop — the refactor leaked behaviour.
2. **Acceptance is visual first (Task 7), numbers second.** Do NOT freeze v2 snapshot expectations until the user has signed off on the before/after strips. The threshold test (no adjacent ΔL > 1.5× median ΔL) is the design target; tune constants to hit it, not the reverse.
3. **Mirror:** live ramps and `buildRampsForSnapshot` must call the SAME `buildRamp`. Never re-implement the pipeline in `App.tsx`.
4. `App.tsx` is `@ts-nocheck` — grep is the real gate there; the engine/pipeline modules are typed.

---

## File Structure

**Create:**
- `src/lib/ramp-pipeline.ts` — `buildRamp(params, style)`: the shared per-ramp pipeline (generate → pin → hardware-snap → hidden-filter), threading `engineVersion`. One responsibility: assemble one ramp for one base, one style.
- `tests/unit/ramp-v1-characterization.spec.ts` — frozen v1 output.
- `tests/unit/ramp-engine-v2.spec.ts` — v2 allocation, threshold, edge cases.
- `tests/unit/ramp-mirror.spec.ts` — live-vs-snapshot equality at v1 and v2.

**Modify:**
- `src/lib/ramp-engine.ts` — extract `computeBaseIndex(base, darkBottom, lightTop, N, engineVersion)`; add the v2 branch; thread `engineVersion` through `GenerateRampOpts`.
- `src/lib/snapshot-ramps.ts` — call shared `buildRamp`; thread `engineVersion` from the snapshot.
- `src/App.tsx` — live ramp memos call shared `buildRamp`; thread the working `engineVersion`.
- `src/hooks/usePaletteState.ts` — add `engineVersion` document field (default 2 for new sessions).
- saved-palette payload + `RampSnapshot` — add `engineVersion?: number`.

---

## Task 1: Characterize v1 (safety net — do FIRST)

Locks current output so the refactor (Task 2) provably doesn't change v1.

**Files:**
- Test: `tests/unit/ramp-v1-characterization.spec.ts`

- [ ] **Step 1: Write the characterization test** (uses `toMatchSnapshot` so the first run records current output).

```ts
// tests/unit/ramp-v1-characterization.spec.ts
import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from '../../src/lib/style-presets';

const BASES = { green: '#37cd76', navy: '#1a2f6b', red: '#cc3344', grey: '#888888', yellow: '#e8d24a' };
const SIZES = [2, 4, 7, 16, 64];

describe('v1 ramp characterization (frozen — must not change)', () => {
  for (const [name, hex] of Object.entries(BASES)) {
    for (const N of SIZES) {
      it(`${name} N=${N}`, () => {
        const { reach, chromaFalloff } = styleToScalars('punchy', DEFAULT_STYLE_PRESETS);
        const shades = generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0 });
        expect(shades.map(s => s.hex)).toMatchSnapshot();
      });
    }
  }
});
```

- [ ] **Step 2: Run to record the snapshot**

Run: `npx vitest run tests/unit/ramp-v1-characterization.spec.ts`
Expected: PASS, writes `tests/unit/__snapshots__/ramp-v1-characterization.spec.ts.snap`.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/ramp-v1-characterization.spec.ts tests/unit/__snapshots__/
git commit -m "test(ramp): characterize v1 output before refactor (#35)"
```

---

## Task 2: Extract the shared `buildRamp` pipeline (refactor, no behaviour change)

Both live and snapshot paths currently duplicate generate→pin→snap→filterHidden. Extract one pure function. v1 only; output identical.

**Files:**
- Create: `src/lib/ramp-pipeline.ts`
- Modify: `src/lib/snapshot-ramps.ts`, `src/App.tsx`
- Test: `tests/unit/ramp-mirror.spec.ts`

- [ ] **Step 1: Write the failing mirror test** (asserts the new shared fn exists and equals the snapshot path).

```ts
// tests/unit/ramp-mirror.spec.ts
import { describe, it, expect } from 'vitest';
import { buildRamp } from '../../src/lib/ramp-pipeline';
import { buildRampsForSnapshot } from '../../src/lib/snapshot-ramps';

const snap = { baseColors: ['#37cd76', '#1a2f6b'], rampSize: 7, hardwareLock: null };

describe('buildRamp ↔ buildRampsForSnapshot mirror', () => {
  it('snapshot path equals per-base buildRamp (v1)', () => {
    const viaSnapshot = buildRampsForSnapshot(snap, 'punchy');
    const viaBuild = snap.baseColors.map((_, i) => buildRamp(snap, 'punchy', i));
    expect(viaBuild).toEqual(viaSnapshot);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/ramp-mirror.spec.ts`
Expected: FAIL — `buildRamp` not exported.

- [ ] **Step 3: Create `buildRamp` by moving the per-base body of `buildRampsForSnapshot` verbatim**

Move the resolve/generate/pin/snap/filterHidden logic for ONE base index out of `buildRampsForSnapshot`'s `.map` into `buildRamp(snapshot, style, baseIndex)`. Signature:

```ts
// src/lib/ramp-pipeline.ts
import type { RampSnapshot } from './snapshot-ramps';
// (move the resolveBase/resolveSize/pinRamp/snapHardware/filterHidden helpers here,
//  or import them — keep behaviour byte-identical to v1)

export function buildRamp(snapshot: RampSnapshot, style: string, baseIndex: number): string[] {
  // …exact per-base pipeline extracted from buildRampsForSnapshot…
  // reads snapshot.engineVersion (default 1) and passes it to generateRamp (Task 3)
}
```

- [ ] **Step 4: Make `buildRampsForSnapshot` delegate**

```ts
export const buildRampsForSnapshot = (snapshot, style) => {
  if (!snapshot?.baseColors?.length) return [];
  return snapshot.baseColors.map((_, i) => buildRamp(snapshot, style, i));
};
```

- [ ] **Step 5: Run mirror test + v1 characterization**

Run: `npx vitest run tests/unit/ramp-mirror.spec.ts tests/unit/ramp-v1-characterization.spec.ts`
Expected: PASS both (characterization unchanged proves the extraction is byte-identical).

- [ ] **Step 6: Route the live `App.tsx` memos through `buildRamp`**

Replace the inline `applyHardwareLock(applyOverrides(generateRamp(...)))` in `rampsPunchy/Balanced/Muted` with a call that builds a snapshot-shaped object from live state and calls `buildRamp(liveSnapshot, style, i)`. Grep-gate: `grep -n 'applyHardwareLock(applyOverrides' src/App.tsx` → zero after this step. Verify the app still renders (Task 9 e2e; for now `npm run build`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/ramp-pipeline.ts src/lib/snapshot-ramps.ts src/App.tsx tests/unit/ramp-mirror.spec.ts
git commit -m "refactor(ramp): extract shared buildRamp pipeline; live+snapshot one path (#35)"
```

---

## Task 3: Thread `engineVersion` (still v1 everywhere — no behaviour change)

**Files:**
- Modify: `src/lib/ramp-engine.ts` (opts), `src/lib/snapshot-ramps.ts` (RampSnapshot), `src/lib/ramp-pipeline.ts`
- Test: extend `tests/unit/ramp-v1-characterization.spec.ts` is unaffected (default stays v1)

- [ ] **Step 1: Add `engineVersion` to `GenerateRampOpts`**

```ts
// src/lib/ramp-engine.ts — in GenerateRampOpts
engineVersion?: number; // 1 = legacy (default), 2 = re-centered allocation
```

- [ ] **Step 2: Add `engineVersion` to `RampSnapshot`**

```ts
// src/lib/snapshot-ramps.ts — in RampSnapshot interface
engineVersion?: number;
```

- [ ] **Step 3: Thread it through `buildRamp` → `generateRamp`**

In `buildRamp`, read `const engineVersion = snapshot.engineVersion ?? 1;` and pass `engineVersion` into the `generateRamp(...)` opts.

- [ ] **Step 4: Verify v1 characterization still green** (absent version defaults to 1).

Run: `npx vitest run tests/unit/ramp-v1-characterization.spec.ts`
Expected: PASS (no snapshot changes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ramp-engine.ts src/lib/snapshot-ramps.ts src/lib/ramp-pipeline.ts
git commit -m "feat(ramp): thread engineVersion (default 1, no behaviour change) (#35)"
```

---

## Task 4: v2 slot allocation + principled-threshold test (the fix)

**Files:**
- Modify: `src/lib/ramp-engine.ts`
- Test: `tests/unit/ramp-engine-v2.spec.ts`

- [ ] **Step 1: Write the failing threshold + balance test**

```ts
// tests/unit/ramp-engine-v2.spec.ts
import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from '../../src/lib/style-presets';

const ramp = (hex: string, N: number) => {
  const { reach, chromaFalloff } = styleToScalars('punchy', DEFAULT_STYLE_PRESETS);
  return generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0, engineVersion: 2 });
};
const deltas = (shades: any[]) => shades.slice(1).map((s, i) => Math.abs(s.oklch.L - shades[i].oklch.L));
const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };

describe('v2 distribution', () => {
  for (const hex of ['#37cd76', '#1a2f6b', '#e8d24a']) {     // light green, dark navy, light yellow
    for (const N of [4, 7, 16, 64]) {
      it(`no adjacent ΔL exceeds 1.5× median — ${hex} N=${N}`, () => {
        const d = deltas(ramp(hex, N));
        expect(Math.max(...d)).toBeLessThanOrEqual(1.5 * median(d) + 1e-9);
      });
    }
  }
  it('green N=7 has ≥2 highlights (base not stranded at the top)', () => {
    const shades = ramp('#37cd76', 7);
    const baseIdx = shades.findIndex(s => s.hex.toLowerCase() === '#37cd76');
    expect(7 - 1 - baseIdx).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/ramp-engine-v2.spec.ts`
Expected: FAIL — `engineVersion: 2` currently behaves like v1 (green N=7 has 1 highlight; max ΔL ≈ 2× median).

- [ ] **Step 3: Extract `computeBaseIndex` and add the v2 branch**

In `src/lib/ramp-engine.ts`, replace the inline `baseIndex` block (~lines 76–83) with a call to a new helper, and add the v2 allocation:

```ts
// constants — starting values; tune in Task 7 to satisfy the threshold test
const V2_BIAS_C = 1.5;     // centering strength numerator
const V2_BIAS_MAX = 0.6;   // max centering weight at tiny N
const V2_MIN_SIDE = 2;     // preferred guaranteed shades per side when N allows

function computeBaseIndex(baseL: number, darkBottom: number, lightTop: number, N: number, engineVersion: number): number {
  if (N <= 1) return 0;
  const span = lightTop - darkBottom;
  const proportionalDark = span > 1e-6 ? (baseL - darkBottom) / span : 0.5;
  if (engineVersion < 2) {
    // v1 — byte-identical to the original
    return clamp(Math.round(proportionalDark * (N - 1)), 1, N - 2);
  }
  // v2 — bias toward center, fading with N; guarantee a usable short side
  const w = clamp(V2_BIAS_C / (N - 1), 0, V2_BIAS_MAX);
  const biasedDark = lerp(proportionalDark, 0.5, w);
  const minSide = Math.min(V2_MIN_SIDE, Math.floor((N - 1) / 2));
  return clamp(Math.round(biasedDark * (N - 1)), minSide, (N - 1) - minSide);
}
```

Then in `generateRamp`: `const baseIndex = computeBaseIndex(base.L, darkBottom, lightTop, N, opts.engineVersion ?? 1);` (replacing the old inline block). Everything after `baseIndex` is unchanged.

- [ ] **Step 4: Run v2 test + v1 characterization**

Run: `npx vitest run tests/unit/ramp-engine-v2.spec.ts tests/unit/ramp-v1-characterization.spec.ts`
Expected: v2 PASS (tune `V2_*` constants if the threshold fails for any hue/N — see Task 7); v1 characterization UNCHANGED (v2 branch is gated on `engineVersion >= 2`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ramp-engine.ts tests/unit/ramp-engine-v2.spec.ts
git commit -m "feat(ramp): v2 re-centered slot allocation (#35)"
```

---

## Task 5: v2 tiny-N edge cases (N = 2, 3, 4)

**Files:**
- Test: `tests/unit/ramp-engine-v2.spec.ts` (extend)

- [ ] **Step 1: Write edge-case tests**

```ts
describe('v2 tiny N', () => {
  const baseIdx = (hex: string, N: number) => {
    const shades = ramp(hex, N);
    return shades.findIndex(s => s.hex.toLowerCase() === hex.toLowerCase());
  };
  it('N=2 light base → the single non-base shade is a shadow (base at top)', () => {
    expect(baseIdx('#37cd76', 2)).toBe(1);          // farther cap is dark → 1 shadow, 0 highlight
  });
  it('N=2 dark base → the single non-base shade is a highlight (base at bottom)', () => {
    expect(baseIdx('#1a2f6b', 2)).toBe(0);          // farther cap is light → 0 shadow, 1 highlight
  });
  it('N=3/4 never place the base at an end', () => {
    for (const hex of ['#37cd76', '#1a2f6b']) for (const N of [3, 4]) {
      const i = baseIdx(hex, N);
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(N - 1);
    }
  });
  it('v2 L is strictly monotonic for all matrix cases', () => {
    for (const hex of ['#37cd76', '#1a2f6b', '#e8d24a']) for (const N of [2,3,4,7,16,64]) {
      const Ls = ramp(hex, N).map(s => s.oklch.L);
      for (let i = 1; i < Ls.length; i++) expect(Ls[i]).toBeGreaterThan(Ls[i-1]);
    }
  });
});
```

- [ ] **Step 2: Run; fix `computeBaseIndex` clamps if needed**

Run: `npx vitest run tests/unit/ramp-engine-v2.spec.ts`
Expected: PASS. For N=2, `minSide = min(2, floor(1/2)=0) = 0`, so `clamp(round(biasedDark·1), 0, 1)` yields 1 for a light base (proportionalDark > 0.5) and 0 for a dark base — the "farther cap gets the slot" rule. For N=3/4, `minSide = min(2, 1) = 1`, so base is never at an end. If monotonicity fails at tiny N, ensure the existing `STEP_DELTA` min-gap is applied per arm.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/ramp-engine-v2.spec.ts src/lib/ramp-engine.ts
git commit -m "test(ramp): v2 tiny-N edge cases + monotonicity (#35)"
```

---

## Task 6: Mirror test at both versions

**Files:**
- Test: `tests/unit/ramp-mirror.spec.ts` (extend)

- [ ] **Step 1: Add a v2 mirror assertion**

```ts
it('snapshot path equals per-base buildRamp (v2)', () => {
  const s2 = { ...snap, engineVersion: 2 };
  const viaSnapshot = buildRampsForSnapshot(s2, 'punchy');
  const viaBuild = s2.baseColors.map((_, i) => buildRamp(s2, 'punchy', i));
  expect(viaBuild).toEqual(viaSnapshot);
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/unit/ramp-mirror.spec.ts`
Expected: PASS at v1 and v2 (single shared pipeline).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/ramp-mirror.spec.ts
git commit -m "test(ramp): mirror holds at engineVersion 1 and 2 (#35)"
```

---

## Task 7: Visual sign-off gate → THEN freeze v2 snapshots

**Do not freeze v2 expected output before the user approves the look.**

- [ ] **Step 1: Render before/after strips for the hero cases**

Write a throwaway script (delete after) that, for `{green #37cd76, navy #1a2f6b, mid #cc3344, grey #888888}` × `{N=4, N=7}`, renders v1 and v2 ramps side by side to a PNG (reuse the running dev server + a Playwright screenshot of a tiny static HTML grid, or draw to a node canvas). Produce one comparison image.

- [ ] **Step 2: Deliver the image to the user and get explicit visual approval**

The user is remote — send the PNG via the file-delivery tool with a caption. Ask: "v2 (right) vs v1 (left) — approve, or adjust?" If the user wants changes, tune `V2_BIAS_C` / `V2_BIAS_MAX` / `V2_MIN_SIDE` in `ramp-engine.ts`, re-run Task 4's threshold test, regenerate the image, repeat. **Block here until approval.**

- [ ] **Step 3: Freeze the approved v2 output as a snapshot guard**

Add a v2 characterization snapshot mirroring Task 1 (`engineVersion: 2`) and record it:

```ts
// tests/unit/ramp-engine-v2.spec.ts — append
it.each(Object.entries(BASES))('v2 frozen output %s', (name, hex) => {
  for (const N of [2,4,7,16,64]) expect(ramp(hex, N).map(s => s.hex)).toMatchSnapshot(`${name}-${N}`);
});
```

Run: `npx vitest run tests/unit/ramp-engine-v2.spec.ts` (records the snapshot).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/ramp-engine-v2.spec.ts tests/unit/__snapshots__/ src/lib/ramp-engine.ts
git commit -m "test(ramp): freeze user-approved v2 output as regression guard (#35)"
```

---

## Task 8: New palettes default to v2; v1 palettes stay v1

**Files:**
- Modify: `src/hooks/usePaletteState.ts`, saved-palette load/save in `src/App.tsx`

- [ ] **Step 1: Add `engineVersion` to the document core**

In `usePaletteState.ts` add `const [engineVersion, setEngineVersion] = useState(2);` and return it (value + setter). New/empty sessions are v2.

- [ ] **Step 2: Thread it into the live snapshot passed to `buildRamp`**

In `App.tsx`, the live-snapshot object built for `buildRamp` (Task 2 Step 6) must include `engineVersion`.

- [ ] **Step 3: Save writes `engineVersion`; load restores it (absent → 1)**

In the save payload builder, include `engineVersion`. In the load path, `setEngineVersion(parsed.engineVersion ?? 1)` — **loading a v1/absent palette sets the working version to 1 and renders v1 until an explicit upgrade** (upgrade UI is deferred). Also add `engineVersion` to `buildUndoSnapshot`/`applySnapshotFields` in `usePaletteState.ts` so undo/redo preserve it.

- [ ] **Step 4: Grep-gate + build**

`grep -cn engineVersion src/App.tsx` > 0; `grep -cn engineVersion src/hooks/usePaletteState.ts` > 0. Run `npx vitest run && npm run build`. Green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePaletteState.ts src/App.tsx
git commit -m "feat(ramp): new palettes v2, saved v1 palettes render v1 on load (#35)"
```

---

## Task 9: Integration, e2e, PR, green CI

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: all green (v1 characterization, v2, mirror, edge, existing suite).

- [ ] **Step 2: Manual/e2e smoke**

Generate a palette from a green base in the running app; confirm the ramp now has ≥2 highlights and no jarring base→bright jump. Load a pre-existing saved palette (if any v1 fixture exists) and confirm its look is unchanged. Add a Playwright assertion if a stable selector exists; otherwise note in the PR.

- [ ] **Step 3: Push, open PR, wait for green CI**

```bash
git push -u origin feat/ramp-engine-v2
gh pr create --base master --title "feat(ramp): even shade distribution (v2 engine, versioned) — closes #35" --body-file <(...)
```
Wait for the full 3-platform + Playwright CI to go green before merging (obs #6).

- [ ] **Step 4: Finish**

After green CI, complete via `superpowers:finishing-a-development-branch`.

---

## STATUS UPDATE — Session B complete (Tasks 4–7), 2026-06-04

Commits `480a308` (v2 alloc) / `ee5a042` (tiny-N) / `d5163e2` (mirror v1+v2) /
`e5536df` (freeze) / `1365fc2` (extend to N=5/6/8 + red/grey). Full unit suite +
`npm run build` green; v1 characterization byte-identical.

**ACCEPTANCE METRIC CHANGED — user-approved. Critical Rule 2 / Task 4's
"max adjacent ΔL ≤ 1.5× median" is RETIRED.** A baseIndex sweep proved it
unsatisfiable via v2's only lever: it is owned by the shared eased lightness curve
(small step near base, large at the extreme), NOT by slot allocation — structural
at N=4 (v1==v2==1.857 at every slot) and mutually exclusive with the balance
guarantee at N=7 (all three hues). Touching the curve (breaks one-function v2) or
loosening the threshold (reverse-derived) were both rejected. The replacement
automated gate is the **balance guarantee** (base never at an end; ≥2 shadows AND
≥2 highlights when N≥5) + strict L-monotonicity + the frozen v2 snapshot. "Looks
even" is the human visual gate: v1-vs-v2 strips for {green/navy/yellow} × {N=4..16,
incl. the 5/6/8 operating range} were rendered and approved before the freeze.

**Behavior to know for Session C:** at N=5, `minSide = min(2, floor(4/2)) = 2` →
range `[2,2]` → base sits **dead-center for every base regardless of lightness**
(approved). v2 constants unchanged from the plan defaults
(`V2_BIAS_C=1.5 / V2_BIAS_MAX=0.6 / V2_MIN_SIDE=2`) — the threshold was retired
rather than tuned toward, so no constant tuning was needed.

**Remaining: Session C = Tasks 8–9** (new palettes default v2; saved v1 stay v1;
integration/e2e/PR/CI) + the Task 9 cleanup in memory `ramp-engine-v2.md`
(orphaned `applyHardwareLock`/`resolveHueShiftForRamp`, `.gitattributes` `*.snap`→LF).

## Self-review notes (author)

- **Spec coverage:** v2 engine (Tasks 4–5), shared pipeline / structural mirror (Task 2, verified Task 6), versioning + working-palette semantics (Tasks 3, 8), v1 frozen (Task 1), visual-sign-off-first + principled threshold (Tasks 4, 7), test matrix incl. light/dark/grey × N=2..64 (Tasks 1, 4, 5, 7). Deferred items (upgrade UI, chroma work) correctly excluded.
- **No reverse-derived acceptance:** Task 4's threshold (1.5× median) is fixed up front; constants are tuned to it AND to the visual sign-off (Task 7), not the test to the constants.
- **Type consistency:** `buildRamp(snapshot, style, baseIndex)`, `computeBaseIndex(baseL, darkBottom, lightTop, N, engineVersion)`, `engineVersion` field name used identically across engine, pipeline, snapshot, hook, payload.
- **Known adaptation:** Task 7 is a human-in-the-loop gate (visual approval) rather than pure red-green — intentional per spec §4; the snapshot freeze afterward restores automated regression coverage.
