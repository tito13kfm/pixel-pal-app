import { describe, it, expect } from 'vitest';
import { dedupeHexes } from '../../src/lib/hex-utils';

describe('dedupeHexes', () => {
  it('collapses duplicates preserving first occurrence and casing', () => {
    expect(dedupeHexes(['#AABBCC', '#aabbcc', '#112233'])).toEqual(['#AABBCC', '#112233']);
  });

  it('preserves all entries and order when input is already unique', () => {
    expect(dedupeHexes(['#111111', '#222222', '#333333'])).toEqual(['#111111', '#222222', '#333333']);
  });

  it('skips non-string entries', () => {
    expect(dedupeHexes(['#000000', null, undefined, '#000000'])).toEqual(['#000000']);
  });

  it('returns empty array for empty input', () => {
    expect(dedupeHexes([])).toEqual([]);
  });
});
