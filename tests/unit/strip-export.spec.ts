import { describe, it, expect } from 'vitest';
import { computeVizData } from '../../src/lib/strip-export';

// Three ramps. Ramp 0 has an internal duplicate (#000000 twice).
// Ramp 2 is fully contained in earlier ramps, so its mosaic row is empty
// and must be filtered out, while keeping originalIdx on surviving rows.
const RAMPS = [
  ['#000000', '#000000', '#404040'], // ramp 0 -> dedupes to [#000000, #404040]
  ['#808080', '#ffffff'],            // ramp 1
  ['#000000', '#ffffff'],            // ramp 2 -> all already seen -> empty row
];

describe('computeVizData', () => {
  it('allColors is cross-ramp deduped, first-occurrence order', () => {
    const { allColors } = computeVizData(RAMPS);
    expect(allColors).toEqual(['#000000', '#404040', '#808080', '#ffffff']);
  });

  it('sortedByL orders darkest to lightest by HSL lightness', () => {
    const { sortedByL } = computeVizData(RAMPS);
    expect(sortedByL).toEqual(['#000000', '#404040', '#808080', '#ffffff']);
  });

  it('mosaicRamps dedupes within and across rows, drops empty rows, keeps originalIdx', () => {
    const { mosaicRamps } = computeVizData(RAMPS);
    expect(mosaicRamps).toEqual([
      { hexes: ['#000000', '#404040'], originalIdx: 0 },
      { hexes: ['#808080', '#ffffff'], originalIdx: 1 },
    ]);
  });

  it('handles empty input', () => {
    expect(computeVizData([])).toEqual({ allColors: [], sortedByL: [], mosaicRamps: [] });
  });
});
