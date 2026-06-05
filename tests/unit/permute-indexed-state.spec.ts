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
