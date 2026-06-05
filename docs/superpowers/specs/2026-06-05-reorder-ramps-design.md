# Drag-to-reorder ramps (#52)

**Date:** 2026-06-05
**Issue:** #52 — Drag-to-reorder ramps in Color Ramps; order propagates everywhere ramps are used
**Sibling:** #44 / #64 (movable *cards*; this reorders *ramps within* the Color Ramps card)

## Goal

Let the user drag a ramp to a new position within the **Color Ramps** section. The
new order applies everywhere ramps are consumed in order — ramp grid, Mosaic,
Adjacency, Dither, exports (gpl/pal/ase/png-strip/txt), and saved-palette output —
**without any per-consumer change**, because every consumer already reads
`baseColors` order plus the base-index-keyed maps. The whole risk is in permuting
that index-keyed state atomically.

## Interaction

- A `GripVertical` handle at the **left edge of each ramp card header**, mirroring
  `sectionGrip` in `src/App.tsx`. Only the grip element is `draggable`, so the
  drag never fights the per-ramp sliders / color editor inside the card.
- Reuse the section-drag mechanics with a **ramp-scoped** copy:
  `makeRampDragHandlers(index)` modeled on `makeSectionDragHandlers(sectionKey)`,
  plus ramp-scoped `rampDragOver` / `rampDraggingIndex` state, kept **separate**
  from the section-level `dragOver` / `draggingKey` so card-drag (#44) and
  ramp-drag never collide. The existing drop-line glow (`dropLine`) is reused with
  a ramp variant.
- **Main view only.** Compare mode is unaffected, matching the section-drag scope.

## State permutation — the hard part (Option A)

A reorder applies one index permutation to **all** base-index-keyed state in
lockstep. Get one wrong and pins / curves / locks attach to the wrong ramp.

### Inventory of index-keyed state (verified complete 2026-06-05)

Certified by an exhaustive `src/` sweep (`useState` shapes in both owner files +
`PerRamp` / `new Set` / `baseIndex` / per-ramp indexing across all hooks and lib).
`useImageRemap` / `useSideBySide` hold no index-keyed ramp state. `gamutPerRamp`
(App.tsx) is the **only** keyed structure outside `usePaletteState`. `curvePerRamp`
(`palette.ts`) is a legacy serialized-only field migrated on load — not live state,
not part of reorder.


Owned by `src/hooks/usePaletteState.ts`:

| Structure | Shape | Key |
|---|---|---|
| `baseColors` | array | position |
| `aiColorNames` | array | position |
| `overrides` | sparse map | `overrides[baseIndex][shadeIndex]` (nested) |
| `rampSizeOverrides` | sparse map | `[baseIndex]` |
| `rampSatOverrides` | sparse map | `[baseIndex]` |
| `hueShiftStrengthPerRamp` | sparse map | `[baseIndex]` |
| `hiddenShades` | sparse map | `[baseIndex]` → array |
| `rampShuffleOffsets` | sparse map | `[baseIndex]` |
| `lightnessCurvePerRamp` | sparse map | `[baseIndex]` |
| `satCurvePerRamp` | sparse map | `[baseIndex]` |
| `lockedRamps` | `Set<number>` | member = baseIndex |
| `collapsedRamps` | `Set<number>` | member = baseIndex |
| `harmonyAnchor` | scalar | baseIndex |

Owned by `src/App.tsx` (NOT in usePaletteState):

| Structure | Shape | Key |
|---|---|---|
| `gamutPerRamp` | sparse map | `[String(baseIndex)]` |

Transient editor state (cleared on reorder, not permuted — Q3 decision A):
`editingIndex`, `pinEditor`, `compareAnchor`.

### Permutation contract

Define two explicit arrays to avoid the off-by-one the issue warns about, given a
move of a ramp from `from` to `to` over length `n`:

- `order[newPos] = oldIndex` — the old index now sitting at each new position
  (used to rebuild arrays: `newArr[k] = oldArr[order[k]]`).
- `next[oldIndex] = newPos` — inverse, where each old index landed (used to remap
  map keys, Set members, and the `harmonyAnchor` scalar:
  `newAnchor = next[oldAnchor]`).

**Coordinate convention (pinned — splice-out-then-insert reindexes, so `to` is
ambiguous unless fixed).** The drop target from the drag layer is
`(targetIndex, pos)` where `pos ∈ {before, after}` (same shape as the section
handlers' `dragOver`). Build `order` deterministically:

```
const dropIndex = pos === 'before' ? targetIndex : targetIndex + 1;
const insertAt  = dropIndex > from ? dropIndex - 1 : dropIndex; // adjust for the removal
const order = [...Array(n).keys()];   // [0,1,…,n-1]
order.splice(from, 1);                // remove dragged old-index
order.splice(insertAt, 0, from);      // reinsert at adjusted position
// next = inverse: next[order[k]] = k
```

`insertAt` is in **post-removal** coordinates; the `dropIndex > from ? -1` term is
the off-by-one fix for dragging downward vs upward. `next` is the inverse of
`order`. Both built once. The characterization test MUST exercise **both
directions** — `0→last`, `last→0`, an adjacent swap, and same-index no-op — because
a unidirectional off-by-one passes a one-way "first↔last" check.

**Array length guard (#3).** `aiColorNames` defaults to `[]` and is only full-length
after AI naming runs. `newArr[k] = oldArr[order[k]]` would turn a short/empty array
into `undefined` holes (serialize as `null`). Rule: reorder an array **only if its
length === baseColors.length**; otherwise leave it untouched. `baseColors` is always
length `n`; `aiColorNames` is reordered only when already aligned.

### `reorderRamps(from, to)` in `usePaletteState`

1. Compute `order` + `next`.
2. Reorder arrays via `order`.
3. Remap every sparse map's keys via `next` (nested `overrides` remaps its outer
   key only; inner `shadeIndex` is untouched).
4. Remap `lockedRamps` / `collapsedRamps` Set members via `next`.
5. Remap `harmonyAnchor` via `next`.
6. Clear transient editor state (`editingIndex=null`, `pinEditor=null`,
   `compareAnchor=null`).
7. **Return `next`** (the inverse permutation) to the caller.

### App.tsx glue

`App.tsx`'s reorder handler calls `reorderRamps(from, to)`, takes the returned
`next`, and applies the **same** remap to `gamutPerRamp` (its string keys parsed to
numbers, remapped, re-stringified). One permutation, one source of truth, applied
in the two places that own keyed state.

### Pure helper (testability)

`permuteIndexedState(next, { maps, sets, scalars })` in `src/lib/` does the generic
key/member/scalar remap so the logic is unit-testable in isolation and reused by
both the hook and the `gamutPerRamp` glue. The hook and App.tsx wire their specific
structures into it.

## Undo / history

A reorder is an undoable edit through the existing history snapshot, but it must
**not** rely on `inferLabel` to name itself: `inferLabel` (`src/lib/history-snapshot.ts`)
diffs `prev`/`next`, and a reorder leaves `baseColors.length` unchanged, so the
existing branch would mislabel it "Edit base color". Instead, **tag the snapshot
explicitly** with label `"Reorder ramps"` via the existing `tagNextLabel` mechanism
(the same path other intent-tagged ops use — `tagNextLabel` is confirmed present and
the standard mechanism, 20+ call sites incl. the structural `tagNextLabel('Duplicate
ramp')` at App.tsx:1501). No `inferLabel` change is required. Persistence is automatic — `baseColors` + all keyed maps already
serialize with the palette.

## Propagation

Free, and **verified pure**. Ramp grid, Mosaic, Adjacency, Dither, and all export
formats read `baseColors` order and the base-index-keyed maps. `buildRamp`
(`ramp-pipeline.ts`) takes `baseIndex` only to look up those maps; its only per-ramp
variation is `effectiveSeed = shuffleSeed + rampShuffleOffsets[i]` (line 85) — and
`rampShuffleOffsets` is a permuted map, so the offset travels with its ramp. There
is no bare absolute-index term, so a correct permutation preserves every ramp's
appearance at its new position.

## Testing

Characterization test for `permuteIndexedState` (the atomic-permutation guarantee):

- Seed a 3-ramp palette with a **distinct, identifiable** value in every map, Set,
  and the `harmonyAnchor` scalar (so a misrouted value is detectable).
- Apply a reorder; assert every structure followed the permutation — no value
  attaches to the wrong ramp, nested `overrides` keeps inner shade keys intact.
- Edge cases: move-to-same-index (no-op identity permutation), first↔last,
  sparse maps with gaps (not every index present), empty maps.
- A second test at the hook level: `reorderRamps` clears transient editor state and
  returns a `next` whose application to a separately-seeded `gamutPerRamp` lands
  values on the right ramps (mirrors the App.tsx glue).

## Files touched

- `src/hooks/usePaletteState.ts` — add `reorderRamps`, export it.
- `src/lib/permute-indexed-state.ts` — new pure helper.
- `src/App.tsx` — ramp grip + `makeRampDragHandlers` + ramp drag state + drop-line
  variant; reorder handler applying `next` to `gamutPerRamp`; `tagNextLabel`
  on reorder.
- Tests for `permute-indexed-state` and the hook reorder path.

## Out of scope

- Up/down a11y arrow buttons (could follow later; drag-only for now).
- Reordering in compare mode.
- The `gamutPerRamp`-into-`usePaletteState` refactor (Option B) — deliberately
  avoided to keep blast radius small.
