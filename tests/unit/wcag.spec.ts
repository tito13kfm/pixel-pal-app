import { describe, it, expect } from 'vitest';
import { wcagRelativeLuminance, wcagContrast, wcagAaTier } from '../../src/lib/wcag';

describe('wcagRelativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(wcagRelativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(wcagRelativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('wcagContrast', () => {
  it('is 21 for black vs white and 1 for identical colors', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBeCloseTo(21, 4);
    expect(wcagContrast('#123456', '#123456')).toBeCloseTo(1, 5);
  });
  it('is order-independent', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBeCloseTo(wcagContrast('#ffffff', '#000000'), 6);
  });
});

describe('wcagAaTier', () => {
  it('classifies by WCAG AA thresholds', () => {
    expect(wcagAaTier(21)).toBe('AA');
    expect(wcagAaTier(4.5)).toBe('AA');
    expect(wcagAaTier(3.0)).toBe('AA Large');
    expect(wcagAaTier(4.49)).toBe('AA Large');
    expect(wcagAaTier(2.99)).toBe('fail');
  });
});
