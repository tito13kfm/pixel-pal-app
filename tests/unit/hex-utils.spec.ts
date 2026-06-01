import { describe, it, expect } from 'vitest';
import { dedupeHexes } from '../../src/lib/hex-utils';

describe('dedupeHexes', () => {
  it('collapses duplicates preserving first occurrence and casing', () => {
    expect(dedupeHexes(['#AABBCC', '#aabbcc', '#112233'])).toEqual(['#AABBCC', '#112233']);
  });

  it('is case-insensitive on the dedupe key', () => {
    expect(dedupeHexes(['#ABCDEF', '#abcdef'])).toEqual(['#ABCDEF']);
  });

  it('skips non-string entries', () => {
    // @ts-expect-error intentional: runtime guards non-strings
    expect(dedupeHexes(['#000000', null, undefined, '#000000'])).toEqual(['#000000']);
  });

  it('returns empty array for empty input', () => {
    expect(dedupeHexes([])).toEqual([]);
  });
});
