import { rgbToHex, hexToHsl } from './color';
import { hexToOklch, deltaEOK, type Oklch } from './oklch';

type Hsl = { h: number; s: number; l: number };

export const extractDominantColors = (imageData: ImageData, targetCount = 4): string[] => {
  const data = imageData.data;
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const hex = rgbToHex(r, g, b) as string;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const result: string[] = [];
  for (const hex of sorted) {
    const hsl = hexToHsl(hex) as Hsl;
    const isDupe = result.some(existing => {
      const e = hexToHsl(existing) as Hsl;
      const hueDist = Math.min(Math.abs(hsl.h - e.h), 360 - Math.abs(hsl.h - e.h));
      return hueDist < 30 && Math.abs(hsl.l - e.l) < 25;
    });
    if (!isDupe) result.push(hex);
    if (result.length >= targetCount) break;
  }
  return result;
};

// quantizeToPaletteOklch: given a target hex and an array of palette hex
// strings, find the nearest palette color using OKLCH DeltaE, the same
// perceptual distance quantizeToHardware (hardware-quantize.ts) uses. Used
// by image remap so remap quality matches the matcher hardware-lock gets.
//
// paletteOklchCache is an optional parallel array of paletteColors' OKLCH
// coordinates (see buildPaletteOklchCache). Passing it lets a caller that
// quantizes many pixels against the same palette (image remap) precompute
// the conversion once instead of re-parsing every candidate hex per pixel.
export const buildPaletteOklchCache = (paletteColors: string[]): (Oklch | null)[] =>
  paletteColors.map((hex) => hexToOklch(hex));

export const quantizeToPaletteOklch = (
  hex: string,
  paletteColors: string[],
  paletteOklchCache?: (Oklch | null)[],
): string => {
  if (!paletteColors || paletteColors.length === 0) return hex;
  const target = hexToOklch(hex);
  if (!target) return paletteColors[0];
  const cache = paletteOklchCache || buildPaletteOklchCache(paletteColors);
  let bestHex = paletteColors[0];
  let bestDist = Infinity;
  for (let i = 0; i < paletteColors.length; i++) {
    const co = cache[i];
    if (!co) continue;
    const d = deltaEOK(target, co);
    if (d < bestDist) { bestDist = d; bestHex = paletteColors[i]; }
  }
  return bestHex;
};
