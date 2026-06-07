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
