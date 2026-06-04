import { describe, it, expect } from 'vitest';
import { computeVizData, paletteStripLayout, lightnessMarkers } from '../../src/lib/strip-export';

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

  it('sortedByL orders darkest to lightest by HSL lightness, independent of input order', () => {
    // First-occurrence order (white, black, gray) deliberately differs from
    // lightness order, so this fails if the sort is dropped.
    const ramps = [
      ['#ffffff', '#000000'],
      ['#808080'],
    ];
    const { allColors, sortedByL } = computeVizData(ramps);
    expect(allColors).toEqual(['#ffffff', '#000000', '#808080']); // input order
    expect(sortedByL).toEqual(['#000000', '#808080', '#ffffff']); // lightness order
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

describe('lightnessMarkers', () => {
  // The shared L source for BOTH the on-screen Lightness Distribution and the
  // exported PNG (#51) — position on a 0→100 axis encodes lightness.
  it('maps each hex to its HSL lightness, preserving input order', () => {
    // #ff0000 has HSL lightness exactly 50 ((255+0)/2/255); #808080 is ~50.2.
    expect(lightnessMarkers(['#000000', '#ff0000', '#ffffff'])).toEqual([
      { hex: '#000000', l: 0 },
      { hex: '#ff0000', l: 50 },
      { hex: '#ffffff', l: 100 },
    ]);
  });
  it('keeps the caller-provided order (does not re-sort)', () => {
    const out = lightnessMarkers(['#ffffff', '#000000']);
    expect(out.map((m) => m.hex)).toEqual(['#ffffff', '#000000']);
  });
  it('handles empty input', () => {
    expect(lightnessMarkers([])).toEqual([]);
  });
});

describe('paletteStripLayout', () => {
  it('sizes the canvas to the widest ramp row x ramp count', () => {
    const rows = [['#fff', '#000'], ['#f00']];
    expect(paletteStripLayout(rows, 32)).toEqual({ width: 64, height: 64, cellSize: 32, maxCells: 2 });
  });
  it('handles an empty palette', () => {
    expect(paletteStripLayout([], 32)).toEqual({ width: 0, height: 0, cellSize: 32, maxCells: 0 });
  });
});
