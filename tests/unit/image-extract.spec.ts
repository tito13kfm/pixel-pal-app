import { describe, it, expect } from 'vitest';
import { extractDominantColors, quantizeToPalette } from '../../src/lib/image-extract';

// Build an ImageData-shaped fixture (jsdom lacks a real ImageData ctor).
function fakeImageData(pixels: Array<[number, number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  });
  return { data, width: pixels.length, height: 1, colorSpace: 'srgb' } as ImageData;
}

describe('quantizeToPalette', () => {
  it('returns the input hex when the palette is empty', () => {
    expect(quantizeToPalette('#ff0000', [])).toBe('#ff0000');
  });
  it('returns an exact palette match', () => {
    expect(quantizeToPalette('#ff0000', ['#ff0000', '#00ff00'])).toBe('#ff0000');
  });
  it('snaps a near-red to red, not to a far hue', () => {
    expect(quantizeToPalette('#f51008', ['#ff0000', '#0000ff'])).toBe('#ff0000');
  });
});

describe('extractDominantColors', () => {
  it('ignores fully transparent pixels and returns the opaque color', () => {
    const img = fakeImageData([[255, 0, 0, 255], [0, 0, 0, 0]]);
    expect(extractDominantColors(img, 4)).toEqual(['#ff0000']);
  });
  it('caps the result at targetCount', () => {
    const img = fakeImageData([
      [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255],
    ]);
    expect(extractDominantColors(img, 2).length).toBeLessThanOrEqual(2);
  });
});
