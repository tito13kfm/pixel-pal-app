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

  // Regression: the per-style sections (### Punchy/Balanced/Muted) apply
  // filterHidden, matching collectPaletteEntries (the .gpl/.pal/.ase path),
  // but the "Unique Colors" summary read the raw ramp arrays directly,
  // bypassing filterHidden entirely. A shade hidden by the user still
  // appeared in the Unique Colors trailer of a .txt export even though the
  // same palette exported as .gpl/.pal/.ase correctly omitted it.
  it('excludes a hidden shade from Unique Colors, matching the per-style sections', () => {
    const hideWhite = (ramp: string[], labels: string[]) => {
      const hexes = ramp.filter(h => h !== '#ffffff');
      return { hexes, labels: labels.filter((_, i) => ramp[i] !== '#ffffff') };
    };
    const text = buildPaletteText({
      baseColors: ['#ff00ff'],
      aiColorNames: ['Magenta'],
      rampsPunchy: [['#000000', '#ff00ff', '#ffffff']],
      rampsBalanced: [['#010101', '#fe00fe', '#fefefe']],
      rampsMuted: [['#020202', '#fd00fd', '#fdfdfd']],
      harmony, resolveBaseForRamp, labelsForRamp, filterHidden: hideWhite,
    });
    const uniqueSection = text.slice(text.indexOf('## Unique Colors'));
    expect(uniqueSection).not.toContain('FFFFFF');
  });
});

describe('collectPaletteEntries', () => {
  it('dedupes by hex across the active ramps and harmony', () => {
    const entries = collectPaletteEntries({
      rampsActive: [['#111111', '#ff00ff']],
      baseColors: ['#ff00ff'],
      aiColorNames: ['Magenta'],
      harmony: { ...harmony, complementary: '#111111' },
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const hexes = entries.map(e => e.hex.toLowerCase());
    expect(hexes.filter(h => h === '#111111')).toHaveLength(1);
  });

  it('reads each ramp from rampsActive so mixed per-ramp styles export together', () => {
    // rampsActive already reflects each ramp's active style: ramp 0 is a
    // punchy strip, ramp 1 a muted strip. collectPaletteEntries indexes
    // rampsActive[i] directly, so the emitted entries carry both.
    const entries = collectPaletteEntries({
      rampsActive: [['#ff0000', '#aa0000'], ['#446644', '#223322']],
      baseColors: ['#ff0000', '#446644'],
      aiColorNames: ['Red', 'Moss'],
      harmony,
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const hexes = entries.map(e => e.hex.toLowerCase());
    expect(hexes).toContain('#ff0000');
    expect(hexes).toContain('#aa0000');
    expect(hexes).toContain('#446644');
    expect(hexes).toContain('#223322');
  });
});

describe('filteredRamp + buildSingleRampGpl', () => {
  it('builds a GIMP palette block scoped to one active ramp', () => {
    const filtered = filteredRamp({
      i: 0,
      rampsActive: [['#000000', '#ff00ff']],
      baseColors: ['#ff00ff'],
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const gpl = buildSingleRampGpl({ filtered, i: 0, style: 'punchy', aiColorNames: ['Magenta'] });
    expect(gpl).toContain('GIMP Palette');
    expect(gpl).toContain('Name: PIXEL.PAL Magenta Punchy');
    expect(gpl).toContain('Columns: 2');
  });

  it('labels a custom ramp as Custom in the single-ramp gpl name', () => {
    const filtered = filteredRamp({
      i: 0,
      rampsActive: [['#000000', '#ff00ff']],
      baseColors: ['#ff00ff'],
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const gpl = buildSingleRampGpl({ filtered, i: 0, style: 'custom', aiColorNames: ['Magenta'] });
    expect(gpl).toContain('Name: PIXEL.PAL Magenta Custom');
  });
});
