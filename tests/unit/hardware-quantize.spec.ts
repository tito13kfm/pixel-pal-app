import { describe, it, expect } from 'vitest';
import { quantizeToHardware } from '../../src/lib/hardware-quantize';

describe('quantizeToHardware', () => {
  it('returns the input hex when hardware is null or has no colors', () => {
    expect(quantizeToHardware('#ff0000', null)).toBe('#ff0000');
    expect(quantizeToHardware('#ff0000', { colors: [] })).toBe('#ff0000');
  });
  it('snaps to the perceptually nearest hardware color', () => {
    const hw = { colors: ['#ff0000', '#0000ff'] };
    expect(quantizeToHardware('#fe0205', hw)).toBe('#ff0000');
    expect(quantizeToHardware('#0a0ae0', hw)).toBe('#0000ff');
  });
  it('returns an exact match unchanged', () => {
    expect(quantizeToHardware('#0000ff', { colors: ['#ff0000', '#0000ff'] })).toBe('#0000ff');
  });
});
