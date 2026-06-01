// Visualization PNG export. Two responsibilities:
//   1. computeVizData: derive the lightness-sorted strip and the mosaic rows
//      from a style's ramps. Extracted verbatim from renderSlotViz so the
//      on-screen view and the exported PNG are computed from one source.
//   2. drawLightnessStripPng / drawMosaicPng: render flat color blocks to an
//      off-screen canvas and resolve a PNG Blob. (Added in a later task.)
import { hexToHsl } from './color';
import { dedupeHexes } from './hex-utils';

export interface MosaicRow {
  hexes: string[];
  originalIdx: number;
}

export interface VizData {
  allColors: string[];
  sortedByL: string[];
  mosaicRamps: MosaicRow[];
}

// `ramps` is an array of ramps, each a list of hex strings (the shape
// buildRampsForSnapshot returns: shades.map(s => s.hex), post pin/hardware/hidden).
export function computeVizData(ramps: string[][]): VizData {
  const allColors = dedupeHexes(ramps.flat());
  const sortedByL = [...allColors].sort((a, b) => hexToHsl(a).l - hexToHsl(b).l);

  const seen = new Set<string>();
  const mosaicRamps: MosaicRow[] = ramps
    .map((ramp, originalIdx) => ({
      hexes: dedupeHexes(ramp).filter((hex) => {
        const key = hex.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      originalIdx,
    }))
    .filter(({ hexes }) => hexes.length > 0);

  return { allColors, sortedByL, mosaicRamps };
}
