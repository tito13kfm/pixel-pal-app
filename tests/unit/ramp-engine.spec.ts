import { describe, it, expect } from 'vitest';
import { _legacyHsvRamp } from '../../src/lib/ramp-engine';

describe('_legacyHsvRamp', () => {
  it('returns array of length numColors', () => {
    const r = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    expect(r).toHaveLength(6);
  });
  it('every element is a 7-char hex string', () => {
    const r = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    for (const hex of r) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('deterministic for same inputs', () => {
    const a = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    const b = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    expect(a).toEqual(b);
  });
});
