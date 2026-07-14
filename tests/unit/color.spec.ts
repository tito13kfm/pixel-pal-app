import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hexToHsl, hslToHex,
  rgbToHsv, hsvToRgb, hexToHsv, hsvToHex,
} from '../../src/lib/color';

const SAMPLE_HEXES = ['#ff0000', '#00ff00', '#0000ff', '#3366cc', '#000000', '#ffffff', '#808080'];

describe('color.ts conversions', () => {
  it('hexToRgb / rgbToHex round-trip', () => {
    for (const hex of SAMPLE_HEXES) {
      const { r, g, b } = hexToRgb(hex);
      expect(rgbToHex(r, g, b)).toBe(hex);
    }
  });

  it('hexToHsl / hslToHex round-trip within 1/255 per channel', () => {
    for (const hex of SAMPLE_HEXES) {
      const roundTripped = hslToHex(hexToHsl(hex));
      const original = hexToRgb(hex);
      const result = hexToRgb(roundTripped);
      expect(Math.abs(original.r - result.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(original.g - result.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(original.b - result.b)).toBeLessThanOrEqual(1);
    }
  });

  it('hexToHsv / hsvToHex round-trip within 1/255 per channel', () => {
    for (const hex of SAMPLE_HEXES) {
      const roundTripped = hsvToHex(hexToHsv(hex));
      const original = hexToRgb(hex);
      const result = hexToRgb(roundTripped);
      expect(Math.abs(original.r - result.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(original.g - result.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(original.b - result.b)).toBeLessThanOrEqual(1);
    }
  });

  it('rgbToHsl / hslToRgb round-trip matches rgbToHsl->hexToHsl parity', () => {
    const rgb = hexToRgb('#3366cc');
    const hsl = rgbToHsl(rgb);
    const back = hslToRgb(hsl);
    expect(Math.round(back.r)).toBe(rgb.r);
    expect(Math.round(back.g)).toBe(rgb.g);
    expect(Math.round(back.b)).toBe(rgb.b);
  });

  it('rgbToHsv / hsvToRgb round-trip', () => {
    const rgb = hexToRgb('#3366cc');
    const hsv = rgbToHsv(rgb);
    const back = hsvToRgb(hsv);
    expect(Math.round(back.r)).toBe(rgb.r);
    expect(Math.round(back.g)).toBe(rgb.g);
    expect(Math.round(back.b)).toBe(rgb.b);
  });

  it('handles achromatic colors (h=0) without NaN', () => {
    for (const hex of ['#000000', '#ffffff', '#808080']) {
      const hsl = hexToHsl(hex);
      const hsv = hexToHsv(hex);
      expect(Number.isNaN(hsl.h)).toBe(false);
      expect(Number.isNaN(hsv.h)).toBe(false);
      expect(hsl.s).toBe(0);
      expect(hsv.s).toBe(0);
    }
  });
});
