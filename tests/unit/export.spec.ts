import { describe, it, expect } from 'vitest';
import { buildPaletteText, collectPaletteEntries, buildSingleRampGpl, filteredRamp } from '../../src/lib/export';

const harmony = {
  complementary: '#111111', analogous1: '#222222', analogous2: '#333333',
  triadic1: '#444444', triadic2: '#555555', splitComp1: '#666666', splitComp2: '#777777',
  tetradic1: '#888888', tetradic2: '#999999', tetradic3: '#aaaaaa',
  square1: '#bbbbbb', square2: '#cccccc', square3: '#dddddd',
};

const resolveBaseForRamp = (hex: string) => hex;
const labelsForRamp = (ramp: string[]) => ramp.map((_, i) => `slot${i}`);
const filterHidden = (ramp: string[], labels: string[]) => ({ hexes: ramp, labels });

describe('buildPaletteText', () => {
  it('includes each base color name and its punchy/balanced/muted sections', () => {
    const text = buildPaletteText({
      baseColors: ['#ff00ff'],
      aiColorNames: ['Magenta'],
      rampsPunchy: [['#000000', '#ff00ff', '#ffffff']],
      rampsBalanced: [['#010101', '#fe00fe', '#fefefe']],
      rampsMuted: [['#020202', '#fd00fd', '#fdfdfd']],
      harmony, resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    expect(text).toContain('## Magenta');
    expect(text).toContain('### Punchy');
    expect(text).toContain('FF00FF  slot1');
    expect(text).toContain('## Unique Colors');
  });
});

describe('collectPaletteEntries', () => {
  it('dedupes by hex across ramps and harmony', () => {
    const entries = collectPaletteEntries({
      style: 'punchy',
      baseColors: ['#ff00ff'],
      aiColorNames: ['Magenta'],
      rampsPunchy: [['#111111', '#ff00ff']],
      rampsBalanced: [[]], rampsMuted: [[]],
      harmony: { ...harmony, complementary: '#111111' },
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const hexes = entries.map(e => e.hex.toLowerCase());
    expect(hexes.filter(h => h === '#111111')).toHaveLength(1);
  });
});

describe('filteredRamp + buildSingleRampGpl', () => {
  it('builds a GIMP palette block scoped to one ramp', () => {
    const filtered = filteredRamp({
      i: 0, style: 'punchy',
      baseColors: ['#ff00ff'],
      rampsPunchy: [['#000000', '#ff00ff']],
      rampsBalanced: [[]], rampsMuted: [[]],
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const gpl = buildSingleRampGpl({ filtered, i: 0, style: 'punchy', aiColorNames: ['Magenta'] });
    expect(gpl).toContain('GIMP Palette');
    expect(gpl).toContain('Name: PIXEL.PAL Magenta Punchy');
    expect(gpl).toContain('Columns: 2');
  });
});
