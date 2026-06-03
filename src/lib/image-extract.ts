import { rgbToHex, hexToHsl } from './color';

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

// quantizeToPalette: given a target hex and an array of palette hex strings,
// find the nearest palette color using a weighted HSL distance.
//
// Weights (tuned via testing against the NES, C64, Game Boy, CGA, and EGA
// palettes):
//   hue:        2.0x  (dominant perceptual signal when colors are saturated)
//   saturation: 0.5x  (matters for tie-breaking but should not override hue)
//   lightness:  1.5x  (lightness drift is perceptually obvious at any sat)
//
// Hue weight fades to zero as the SMALLER of (target, candidate) saturation
// approaches zero. This protects two cases:
//   1. A gray input must not be pulled into a hue family (hue is meaningless
//      at S=0; any candidate hue would be an arbitrary pick).
//   2. A saturated input must not snap to a gray candidate just because the
//      gray happens to have a nominal hue close to the input's.
// The fade ramps linearly from 0 at S=0 to full weight at S>=15. The S=15
// threshold was picked because below ~S=15 colors read as "tinted gray"
// rather than as a named hue.
//
// Earlier versions used hueWeight = min(target.s, candidate.s) / 100 with no
// upper cap. That under-weighted hue across the entire saturated range,
// causing severe mismatches (e.g. a warm brown at H=20 would snap to a
// royal purple at H=251 because the saturation similarity was 'closer'
// than the orange's saturation gap). The new formulation caps the fade
// at S=15 so hue gets full weight wherever color is visually perceived.
//
// Returns the nearest hex from paletteColors. Returns the input hex
// unchanged if paletteColors is empty or missing (degenerate input is a
// no-op, not a crash).
//
// This function is the workhorse for the image remap preview feature.
// Hardware-lock snapping is handled separately by quantizeToHardware (OKLCH
// perceptual distance, lives further down).
export const quantizeToPalette = (hex: string, paletteColors: string[]): string => {
  if (!paletteColors || paletteColors.length === 0) return hex;
  const target = hexToHsl(hex) as Hsl;
  let bestHex = paletteColors[0];
  let bestDist = Infinity;
  for (const candidate of paletteColors) {
    const c = hexToHsl(candidate) as Hsl;
    // Hue distance is circular (0 and 359 are adjacent). Use shortest arc.
    let hueDiff = Math.abs(target.h - c.h);
    if (hueDiff > 180) hueDiff = 360 - hueDiff;
    // Hue is on 0-360, lightness/sat on 0-100. Scale hue so 360 maps to
    // ~100 to keep the dimensions comparable.
    const hueScaled = (hueDiff / 360) * 100;
    const satDiff = target.s - c.s;
    const lightDiff = target.l - c.l;
    // Gray-fade hue weighting: full hue weight when both colors are at
    // least somewhat saturated (S>=15); ramp linearly to zero as the
    // less-saturated of the two approaches gray.
    const minSat = Math.min(target.s, c.s);
    const hueFade = Math.min(1, minSat / 15);
    const hueWeight = hueFade * 2.0;
    const dist = (hueScaled * hueScaled * hueWeight)
               + (satDiff * satDiff * 0.5)
               + (lightDiff * lightDiff * 1.5);
    if (dist < bestDist) {
      bestDist = dist;
      bestHex = candidate;
    }
  }
  return bestHex;
};
