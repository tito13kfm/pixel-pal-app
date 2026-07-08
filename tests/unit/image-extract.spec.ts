import { describe, it, expect } from 'vitest';
import { extractDominantColors, quantizeToPaletteOklch, buildPaletteOklchCache } from '../../src/lib/image-extract';

// Build an ImageData-shaped fixture (jsdom lacks a real ImageData ctor).
function fakeImageData(pixels: Array<[number, number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  });
  return { data, width: pixels.length, height: 1, colorSpace: 'srgb' } as ImageData;
}

describe('quantizeToPaletteOklch', () => {
  it('returns the input hex when the palette is empty', () => {
    expect(quantizeToPaletteOklch('#ff0000', [])).toBe('#ff0000');
  });
  it('returns an exact palette match', () => {
    expect(quantizeToPaletteOklch('#ff0000', ['#ff0000', '#00ff00'])).toBe('#ff0000');
  });
  it('snaps a near-red to red, not to a far hue', () => {
    expect(quantizeToPaletteOklch('#f51008', ['#ff0000', '#0000ff'])).toBe('#ff0000');
  });
  it('snaps a gray toward gray, not a nearby hue', () => {
    expect(quantizeToPaletteOklch('#808080', ['#ff0000', '#7f7f7f'])).toBe('#7f7f7f');
  });
  it('picks the perceptually nearest candidate over a merely hue-closer one', () => {
    // Verified case (#72): the retired weighted-HSL matcher picked the
    // hue-closer saturated red here; OKLCH DeltaE correctly picks the
    // perceptually closer muted brown instead.
    expect(quantizeToPaletteOklch('#186eae', ['#a61d14', '#78583e'])).toBe('#78583e');
  });
  it('buildPaletteOklchCache produces a cache that yields the same result as computing inline', () => {
    const palette = ['#ff0000', '#00ff00', '#0000ff', '#78583e'];
    const cache = buildPaletteOklchCache(palette);
    expect(cache.length).toBe(palette.length);
    const src = '#186eae';
    expect(quantizeToPaletteOklch(src, palette, cache)).toBe(quantizeToPaletteOklch(src, palette));
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
  it('merges near-identical hues into a single result', () => {
    const img = fakeImageData([
      [255, 0, 0, 255], [255, 0, 0, 255], // #ff0000 ×2 (most frequent)
      [245, 0, 0, 255],                    // near-dupe of red
      [0, 0, 255, 255],                    // distinct blue
    ]);
    const result = extractDominantColors(img, 4);
    // Red collapsed (near-dupe merged), blue kept as distinct entry.
    expect(result).toEqual(['#ff0000', '#0000ff']);
  });
});
