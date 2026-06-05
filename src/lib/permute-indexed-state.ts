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
 * length !== baseColors.length are passed through untouched (the guard:
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
