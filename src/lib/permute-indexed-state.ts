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
