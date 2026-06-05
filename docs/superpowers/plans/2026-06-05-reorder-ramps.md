# Drag-to-reorder Ramps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag a ramp to a new position in the Color Ramps card; the new order propagates everywhere ramps are consumed in order, with all per-ramp index-keyed state permuted atomically.

**Architecture:** All permutation logic lives in a pure, fully-tested `src/lib/permute-indexed-state.ts` (no React). `usePaletteState.reorderRamps(from, target, pos)` is a thin wrapper that calls the pure helpers, applies its setters, clears transient editors, and returns the inverse permutation `next`. `App.tsx` owns the drag UI (grip + handlers) and applies the same `next` to `gamutPerRamp` (the one keyed map it owns), tagging history `"Reorder ramps"`.

**Tech Stack:** React 19 + TS (App.tsx & usePaletteState are `@ts-nocheck`), Vitest (pure-lib tests in `tests/unit/`), lucide-react `GripVertical`.

**Spec:** `docs/superpowers/specs/2026-06-05-reorder-ramps-design.md`

---

## File Structure

- **Create** `src/lib/permute-indexed-state.ts` — pure permutation: `computePermutation`, `permuteStringKeyMap`, `permuteRampState`.
- **Create** `tests/unit/permute-indexed-state.spec.ts` — characterization + edge tests.
- **Modify** `src/hooks/usePaletteState.ts` — add `reorderRamps`, export it.
- **Modify** `src/App.tsx` — ramp drag state, `makeRampDragHandlers`/`rampGrip`/`rampDropLine`, inject grip + handlers into the ramp card (line ~5029), gamut remap + `tagNextLabel` in the reorder path, defensive guard in `makeSectionDragHandlers` onDrop.

---

### Task 1: Pure `computePermutation`

**Files:**
- Create: `src/lib/permute-indexed-state.ts`
- Test: `tests/unit/permute-indexed-state.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/permute-indexed-state.spec.ts
import { describe, it, expect } from 'vitest';
import { computePermutation } from '../../src/lib/permute-indexed-state';

describe('computePermutation', () => {
  // order[newPos] = oldIndex ; next[oldIndex] = newPos
  it('moves first to last (0 -> after 2) for n=3', () => {
    const { order, next } = computePermutation(3, 0, 2, 'after');
    expect(order).toEqual([1, 2, 0]);
    expect(next).toEqual([2, 0, 1]); // old 0 -> pos 2, old 1 -> pos 0, old 2 -> pos 1
  });

  it('moves last to first (2 -> before 0) for n=3', () => {
    const { order, next } = computePermutation(3, 2, 0, 'before');
    expect(order).toEqual([2, 0, 1]);
    expect(next).toEqual([1, 2, 0]);
  });

  it('adjacent swap (1 -> before 0) for n=3', () => {
    const { order } = computePermutation(3, 1, 0, 'before');
    expect(order).toEqual([1, 0, 2]);
  });

  it('drop onto self is identity (1 -> after 1)', () => {
    const { order, next } = computePermutation(3, 1, 1, 'after');
    expect(order).toEqual([0, 1, 2]);
    expect(next).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/permute-indexed-state.spec.ts`
Expected: FAIL — "computePermutation is not a function" / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/permute-indexed-state.ts

export interface RampPermutation {
  /** order[newPos] = oldIndex — rebuild arrays: newArr[k] = oldArr[order[k]] */
  order: number[];
  /** next[oldIndex] = newPos — remap map keys / Set members / scalar indices */
  next: number[];
}

/**
 * Compute the index permutation for moving the ramp at `from` to the drop
 * target `(target, pos)`. `pos` is the drop edge of the target card.
 *
 * The splice-out-then-insert reindexes positions after `from`, so the insert
 * position is adjusted by -1 when dropping below the source (`dropIndex > from`).
 * That single `-1` is the off-by-one fix distinguishing downward vs upward drags.
 */
export function computePermutation(
  n: number,
  from: number,
  target: number,
  pos: 'before' | 'after',
): RampPermutation {
  const dropIndex = pos === 'after' ? target + 1 : target;
  const insertAt = dropIndex > from ? dropIndex - 1 : dropIndex;
  const order = Array.from({ length: n }, (_, k) => k);
  order.splice(from, 1);
  order.splice(insertAt, 0, from);
  const next = new Array<number>(n);
  for (let pos2 = 0; pos2 < n; pos2++) next[order[pos2]] = pos2;
  return { order, next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/permute-indexed-state.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permute-indexed-state.ts tests/unit/permute-indexed-state.spec.ts
git commit -m "feat(reorder): pure computePermutation helper (#52)"
```

---

### Task 2: Pure `permuteStringKeyMap` + `permuteRampState`

**Files:**
- Modify: `src/lib/permute-indexed-state.ts`
- Test: `tests/unit/permute-indexed-state.spec.ts`

- [ ] **Step 1: Write the failing test** (append to the existing spec file)

```ts
import { permuteStringKeyMap, permuteRampState } from '../../src/lib/permute-indexed-state';

describe('permuteStringKeyMap', () => {
  it('remaps numeric-string keys through next, drops absent keys', () => {
    // next: old 0 -> 2, old 1 -> 0, old 2 -> 1
    const out = permuteStringKeyMap({ '0': 'a', '2': 'c' }, [2, 0, 1]);
    expect(out).toEqual({ '2': 'a', '1': 'c' }); // sparse gap at old 1 preserved as gap
  });
});

describe('permuteRampState', () => {
  // 3-ramp state, every structure seeded with an identifiable value per ramp.
  const state = {
    baseColors: ['#aa0000', '#00bb00', '#0000cc'],
    aiColorNames: ['red', 'green', 'blue'],
    overrides: { '0': { 0: { punchy: '#111' } }, '2': { 1: { muted: '#999' } } },
    rampSizeOverrides: { '0': 4, '1': 7 },
    rampSatOverrides: { '2': 1.5 },
    hueShiftStrengthPerRamp: { '1': 0.5 },
    hiddenShades: { '0': [2, 3] },
    rampShuffleOffsets: { '2': 9 },
    lightnessCurvePerRamp: { '1': [[0, 0], [1, 1]] },
    satCurvePerRamp: { '0': [[0, 0.2]] },
    lockedRamps: [0, 2],
    collapsedRamps: [1],
    harmonyAnchor: 2,
  };

  it('moves ramp 0 to last: every structure follows the permutation', () => {
    const perm = computePermutation(3, 0, 2, 'after'); // next = [2,0,1]
    const out = permuteRampState(state, perm);

    // arrays reordered by order = [1,2,0]
    expect(out.baseColors).toEqual(['#00bb00', '#0000cc', '#aa0000']);
    expect(out.aiColorNames).toEqual(['green', 'blue', 'red']);

    // map keys remapped via next (old 0 -> 2, old 1 -> 0, old 2 -> 1)
    expect(out.overrides).toEqual({ '2': { 0: { punchy: '#111' } }, '1': { 1: { muted: '#999' } } });
    expect(out.rampSizeOverrides).toEqual({ '2': 4, '0': 7 });
    expect(out.rampSatOverrides).toEqual({ '1': 1.5 });
    expect(out.hueShiftStrengthPerRamp).toEqual({ '0': 0.5 });
    expect(out.hiddenShades).toEqual({ '2': [2, 3] });
    expect(out.rampShuffleOffsets).toEqual({ '1': 9 });
    expect(out.lightnessCurvePerRamp).toEqual({ '0': [[0, 0], [1, 1]] });
    expect(out.satCurvePerRamp).toEqual({ '2': [[0, 0.2]] });

    // Sets remapped + sorted
    expect(out.lockedRamps).toEqual([1, 2]);   // old 0->2, old 2->1
    expect(out.collapsedRamps).toEqual([0]);   // old 1->0
    // scalar
    expect(out.harmonyAnchor).toEqual(1);      // old 2 -> 1
  });

  it('no-op permutation returns equal data', () => {
    const perm = computePermutation(3, 1, 1, 'after');
    const out = permuteRampState(state, perm);
    expect(out.baseColors).toEqual(state.baseColors);
    expect(out.lockedRamps).toEqual([0, 2]);
    expect(out.harmonyAnchor).toEqual(2);
  });

  it('leaves a shorter-than-n array untouched (aiColorNames = [])', () => {
    const perm = computePermutation(3, 0, 2, 'after');
    const out = permuteRampState({ ...state, aiColorNames: [] }, perm);
    expect(out.aiColorNames).toEqual([]); // not turned into [undefined, undefined, undefined]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/permute-indexed-state.spec.ts`
Expected: FAIL — "permuteRampState is not a function".

- [ ] **Step 3: Write minimal implementation** (append to `src/lib/permute-indexed-state.ts`)

```ts
/** Remap a sparse map's numeric-string keys (`'0'`, `'2'`, …) through `next`. */
export function permuteStringKeyMap<V>(
  map: Record<string, V>,
  next: number[],
): Record<string, V> {
  const out: Record<string, V> = {};
  for (const k of Object.keys(map)) {
    const oldIdx = Number(k);
    const newIdx = next[oldIdx];
    if (newIdx === undefined) continue; // key outside [0,n) — drop (shouldn't happen)
    out[String(newIdx)] = map[k];
  }
  return out;
}

const MAP_FIELDS = [
  'overrides', 'rampSizeOverrides', 'rampSatOverrides', 'hueShiftStrengthPerRamp',
  'hiddenShades', 'rampShuffleOffsets', 'lightnessCurvePerRamp', 'satCurvePerRamp',
] as const;

export interface RampStatePlain {
  baseColors: string[];
  aiColorNames: string[];
  overrides: Record<string, any>;
  rampSizeOverrides: Record<string, any>;
  rampSatOverrides: Record<string, any>;
  hueShiftStrengthPerRamp: Record<string, any>;
  hiddenShades: Record<string, any>;
  rampShuffleOffsets: Record<string, any>;
  lightnessCurvePerRamp: Record<string, any>;
  satCurvePerRamp: Record<string, any>;
  lockedRamps: number[];     // Sets serialized as arrays (matches buildSnapshot)
  collapsedRamps: number[];
  harmonyAnchor: number;
}

/**
 * Apply one ramp permutation atomically to every index-keyed structure. Sets
 * are passed/returned as arrays (the caller converts to/from Set). Arrays whose
 * length !== baseColors.length are passed through untouched (the #3 guard:
 * a partial/empty aiColorNames must not become `[undefined, …]`).
 */
export function permuteRampState<T extends RampStatePlain>(state: T, perm: RampPermutation): T {
  const { order, next } = perm;
  const n = state.baseColors.length;
  const reorderArr = <X>(arr: X[]): X[] =>
    arr.length === n ? order.map(oldIdx => arr[oldIdx]) : arr;
  const remapMembers = (members: number[]): number[] =>
    members.map(m => next[m]).filter(m => m !== undefined).sort((a, b) => a - b);

  const out: any = { ...state };
  out.baseColors = reorderArr(state.baseColors);
  out.aiColorNames = reorderArr(state.aiColorNames);
  for (const f of MAP_FIELDS) out[f] = permuteStringKeyMap(state[f], next);
  out.lockedRamps = remapMembers(state.lockedRamps);
  out.collapsedRamps = remapMembers(state.collapsedRamps);
  out.harmonyAnchor = next[state.harmonyAnchor] ?? state.harmonyAnchor;
  return out as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/permute-indexed-state.spec.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permute-indexed-state.ts tests/unit/permute-indexed-state.spec.ts
git commit -m "feat(reorder): permuteRampState + permuteStringKeyMap, atomic permutation (#52)"
```

---

### Task 3: `reorderRamps` in `usePaletteState`

**Files:**
- Modify: `src/hooks/usePaletteState.ts`

No new unit test (repo has no `renderHook` idiom; the risky logic is fully covered by Task 1–2 pure tests). Verified by build + Task 5 manual run.

- [ ] **Step 1: Add the import** at the top of `src/hooks/usePaletteState.ts` (after line 3)

```ts
import { computePermutation, permuteRampState } from '../lib/permute-indexed-state';
```

- [ ] **Step 2: Add `reorderRamps`** immediately before the `return {` block (after `resetTransientEditors`, ~line 144)

```ts
  // Move the ramp at `from` to the drop target (target, pos), permuting every
  // index-keyed structure atomically. Clears transient editors (a reorder is a
  // deliberate structural action). Returns the inverse permutation `next` so the
  // caller can apply the SAME remap to state it owns (App.tsx's gamutPerRamp).
  const reorderRamps = (from: number, target: number, pos: 'before' | 'after'): number[] => {
    const n = baseColors.length;
    const perm = computePermutation(n, from, target, pos);
    const np = permuteRampState({
      baseColors, aiColorNames,
      overrides, rampSizeOverrides, rampSatOverrides, hueShiftStrengthPerRamp,
      hiddenShades, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp,
      lockedRamps: [...lockedRamps], collapsedRamps: [...collapsedRamps],
      harmonyAnchor,
    }, perm);
    setBaseColors(np.baseColors);
    setAiColorNames(np.aiColorNames);
    setOverrides(np.overrides);
    setRampSizeOverrides(np.rampSizeOverrides);
    setRampSatOverrides(np.rampSatOverrides);
    setHueShiftStrengthPerRamp(np.hueShiftStrengthPerRamp);
    setHiddenShades(np.hiddenShades);
    setRampShuffleOffsets(np.rampShuffleOffsets);
    setLightnessCurvePerRamp(np.lightnessCurvePerRamp);
    setSatCurvePerRamp(np.satCurvePerRamp);
    setLockedRamps(new Set(np.lockedRamps));
    setCollapsedRamps(new Set(np.collapsedRamps));
    setHarmonyAnchor(np.harmonyAnchor);
    setEditingIndex(null);
    setPinEditor(null);
    setCompareAnchor(null);
    return perm.next;
  };
```

- [ ] **Step 3: Export it** — add `reorderRamps,` to the returned object (after `resetTransientEditors,` ~line 178)

```ts
    resetTransientEditors,
    reorderRamps,
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: `tsc --noEmit` + vite build succeed (note: usePaletteState is typed; `permute-indexed-state.ts` is NOT `@ts-nocheck`, so types are checked here).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePaletteState.ts
git commit -m "feat(reorder): reorderRamps in usePaletteState, returns inverse perm (#52)"
```

---

### Task 4: Drag UI in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Destructure `reorderRamps`** from the palette-state hook. Find the existing destructure that yields `setHarmonyAnchor` / `resetTransientEditors` (the `usePaletteState()` return) and add `reorderRamps`. Grep first:

Run: `grep -n "resetTransientEditors" src/App.tsx`
Add `reorderRamps,` to that destructured list.

- [ ] **Step 2: Add ramp-scoped drag state.** Right after the `usePanelLayout()` destructure block (the lines ending `} = usePanelLayout();`, ~line 236), add:

```tsx
  // Ramp reorder drag state — deliberately SEPARATE from the section-level
  // dragOver/draggingKey so card-drag (#44) and ramp-drag never collide.
  const [rampDragOver, setRampDragOver] = useState<{ index: number; pos: 'before' | 'after' } | null>(null);
  const [rampDragging, setRampDragging] = useState<number | null>(null);
```

- [ ] **Step 3: Add ramp drag handlers + grip + drop-line.** Immediately after `sectionGrip` (ends ~line 381), add:

```tsx
  // Ramp-card reorder. Mirrors makeSectionDragHandlers but on numeric indices,
  // and stops propagation so the enclosing ramps-section drag handlers never
  // also fire (a ramp drop must not be read as a section reorder).
  const makeRampDragHandlers = (index: number) => ({
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = dropPos(e);
      setRampDragOver(prev => (prev && prev.index === index && prev.pos === pos) ? prev : { index, pos });
    },
    onDragLeave: (e) => {
      e.stopPropagation();
      if (!e.currentTarget.contains(e.relatedTarget)) setRampDragOver(prev => (prev && prev.index === index) ? null : prev);
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData('application/x-ramp-index');
      const pos = dropPos(e);
      setRampDragOver(null);
      if (raw === '') return;
      const from = Number(raw);
      if (Number.isNaN(from) || from === index) return;
      const next = reorderRamps(from, index, pos);
      setGamutPerRamp(prev => permuteStringKeyMap(prev, next));
      tagNextLabel('Reorder ramps');
    },
  });
  const rampDropLine = (index: number) => {
    if (!rampDragOver || rampDragOver.index !== index || rampDragging === null) return null;
    const c = '#00ffff';
    return rampDragOver.pos === 'before'
      ? `inset 0 6px 0 -2px ${c}, 0 0 14px ${c}`
      : `inset 0 -6px 0 -2px ${c}, 0 0 14px ${c}`;
  };
  const rampGrip = (index: number) => (
    <span
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/x-ramp-index', String(index)); setRampDragging(index); }}
      onDragEnd={() => { setRampDragging(null); setRampDragOver(null); }}
      onClick={e => e.stopPropagation()}
      style={{ cursor: 'grab' }}
      className="opacity-40 hover:opacity-80 transition-opacity"
      title="Drag to reorder this ramp"
    >
      <GripVertical size={16} />
    </span>
  );
```

- [ ] **Step 4: Add the import** for `permuteStringKeyMap`. Find the existing import of `buildRamp` / lib imports near the top of `App.tsx` and add:

Run: `grep -n "from './lib/ramp-pipeline'" src/App.tsx`
Then add a sibling import line:

```tsx
import { permuteStringKeyMap } from './lib/permute-indexed-state';
```

- [ ] **Step 5: Wire the ramp card** at line ~5029. Replace the opening card `<div>`:

Find:
```tsx
              <div key={i} className="mb-4 last:mb-0 relative rounded-lg p-4" style={{ border: `2px solid ${cardBorder}`, boxShadow: `0 0 14px ${cardGlow}` }}>
```
Replace with (adds drag handlers + drop-line glow + the grip in the top-left):
```tsx
              <div key={i} {...makeRampDragHandlers(i)} className="mb-4 last:mb-0 relative rounded-lg p-4" style={{ border: `2px solid ${cardBorder}`, boxShadow: [`0 0 14px ${cardGlow}`, rampDropLine(i)].filter(Boolean).join(', ') }}>
                <div className="absolute -top-2 left-2 z-10">{rampGrip(i)}</div>
```

- [ ] **Step 6: Defensive guard on the section handler.** In `makeSectionDragHandlers` onDrop (~line 4341), harden against a stray non-section `from` so a bubbled ramp index can never corrupt `sectionOrder`.

Find:
```tsx
      if (!from || from === sectionKey) return;
```
Replace with:
```tsx
      if (!from || from === sectionKey || !DEFAULT_SECTION_ORDER.includes(from)) return;
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: succeeds (App.tsx is `@ts-nocheck`; the new lib import is type-checked).

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(reorder): ramp drag handle + drop-line, gamut remap, history label (#52)"
```

---

### Task 5: Full test + manual verification + push

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS, including the new `permute-indexed-state.spec.ts`. (Baseline was 325 passing before this branch.)

- [ ] **Step 2: Manual app verification**

Run: `npm run dev`, open the served URL.
Do all of:
1. Add 3+ ramps with distinct base colors. Pin a shade on ramp 1, lock ramp 2, set a different shade-count on ramp 0, hide a shade on ramp 0.
2. Drag ramp 0's grip below ramp 2. Confirm: cyan drop-line glow on hover; on drop, ramp 0 lands last and its pin/size/hidden-shade travel with it; ramp 2's lock stays on ramp 2's content.
3. Confirm the ramp grid, Mosaic, Adjacency, and a `.gpl` export all reflect the new order.
4. Press Undo → order restores, history entry reads "Reorder ramps".
5. Reload the page → reordered palette persists (it's the live working palette / saved if saved).

Expected: all behaviors hold; nothing attaches to the wrong ramp.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/reorder-ramps-52
gh pr create --title "feat(layout): drag-to-reorder ramps in Color Ramps (#52)" --base master \
  --body "Closes #52. Drag a ramp by its grip to reorder; all index-keyed per-ramp state (pins, sizes, sat, hue-shift, hidden shades, shuffle offsets, curves, locks, collapse, harmony anchor, gamut) permutes atomically via the pure, tested permute-indexed-state helper. Order propagates to grid/Mosaic/Adjacency/Dither/exports. Undoable ('Reorder ramps'). See docs/superpowers/specs/2026-06-05-reorder-ramps-design.md."
```

---

## Self-Review

- **Spec coverage:** grip handle (T4 S3/S5) ✓; `reorderRamps` returning `next` (T3) ✓; full keyed-state inventory permuted — arrays/maps/Sets/`harmonyAnchor` (T2) + `gamutPerRamp` (T4 S3) ✓; transient editors cleared (T3) ✓; coordinate convention with both-direction tests (T1) ✓; array length guard (T2) ✓; `tagNextLabel('Reorder ramps')` (T4 S3) ✓; characterization test (T2) ✓; propagation is free — no consumer edits needed ✓.
- **Placeholder scan:** none — every code step is concrete.
- **Type consistency:** `computePermutation(n, from, target, pos) → {order, next}` used identically in T1/T3; `permuteStringKeyMap(map, next)` used in T2 and T4 S3; `permuteRampState(state, perm)` in T2/T3; `reorderRamps(from, target, pos) → next` defined T3, called T4 S3.
- **Out of scope (per spec):** a11y arrow buttons, compare-mode reorder, the `gamutPerRamp`→hook refactor.
