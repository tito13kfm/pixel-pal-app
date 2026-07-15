import { arcLength, hueInArc, clampHueToArcs, applyMoodToHex } from '../../src/lib/mood';
import type { MoodEnvelope } from '../../src/lib/mood';
import { MOOD_PRESETS } from '../../src/lib/constants';
import { hexToOklch, oklchToHex } from '../../src/lib/oklch';

describe('arcLength', () => {
  test('simple arc', () => expect(arcLength([30, 150])).toBe(120));
  test('full wheel', () => expect(arcLength([0, 360])).toBe(360));
  test('wrap-around arc', () => expect(arcLength([330, 30])).toBe(60));
  test('zero-length arc', () => expect(arcLength([50, 50])).toBe(0));
});

describe('hueInArc', () => {
  test('inside simple arc', () => expect(hueInArc(100, [30, 150])).toBe(true));
  test('outside simple arc', () => expect(hueInArc(200, [30, 150])).toBe(false));
  test('endpoints inclusive', () => {
    expect(hueInArc(30, [30, 150])).toBe(true);
    expect(hueInArc(150, [30, 150])).toBe(true);
  });
  test('wrap-around arc contains both sides of 0', () => {
    expect(hueInArc(350, [330, 30])).toBe(true);
    expect(hueInArc(10, [330, 30])).toBe(true);
    expect(hueInArc(180, [330, 30])).toBe(false);
  });
  test('full wheel contains everything', () => {
    expect(hueInArc(0, [0, 360])).toBe(true);
    expect(hueInArc(359.9, [0, 360])).toBe(true);
  });
  test('normalizes hue outside 0-360', () => expect(hueInArc(460, [30, 150])).toBe(true));
});

describe('clampHueToArcs', () => {
  test('inside an arc: unchanged', () => expect(clampHueToArcs(100, [[30, 150]])).toBe(100));
  test('outside: snaps to nearest endpoint', () => expect(clampHueToArcs(170, [[30, 150]])).toBe(150));
  test('circular nearest: 350 is closer to 30 than to 150', () =>
    expect(clampHueToArcs(350, [[30, 150]])).toBe(30));
  test('multi-arc picks the globally nearest endpoint', () => {
    // gothic-horror shape: cold arc + blood-red arc
    const arcs: [number, number][] = [[240, 320], [15, 40]];
    expect(clampHueToArcs(0, arcs)).toBe(15);
    expect(clampHueToArcs(180, arcs)).toBe(240);
    expect(clampHueToArcs(300, arcs)).toBe(300); // already inside
  });
  test('empty arcs: normalized passthrough', () => expect(clampHueToArcs(-90, [])).toBe(270));
});

describe('applyMoodToHex', () => {
  const cozy = MOOD_PRESETS.find(m => m.id === 'cozy-farm')!;

  test('null mood passes through', () => {
    expect(applyMoodToHex('#FF0000', null)).toBe('#FF0000');
  });

  test('invalid hex passes through', () => {
    expect(applyMoodToHex('nope', cozy)).toBe('nope');
  });

  test('in-envelope color is unchanged (lowercased)', () => {
    // Construct a color comfortably inside cozy-farm: H 100, C 0.08, L 0.6.
    const hex = oklchToHex({ L: 0.6, C: 0.08, H: 100 });
    expect(applyMoodToHex(hex.toUpperCase(), cozy)).toBe(hex.toLowerCase());
  });

  test('out-of-envelope color clamps into the envelope', () => {
    // Pure red: H ≈ 29°, C ≈ 0.26, outside cozy-farm's [30,150] / C ≤ 0.12.
    const out = applyMoodToHex('#ff0000', cozy);
    expect(out).not.toBe('#ff0000');
    const ok = hexToOklch(out)!;
    expect(ok.C).toBeLessThanOrEqual(0.125);       // clamped (hex-quantization eps)
    expect(ok.L).toBeGreaterThanOrEqual(0.44);
    expect(ok.L).toBeLessThanOrEqual(0.83);
    expect(hueInArc(ok.H, [28, 152])).toBe(true);  // arc widened for quantization
  });

  test('achromatic input keeps chroma and hue (no colorizing grays)', () => {
    const cyberpunk = MOOD_PRESETS.find(m => m.id === 'cyberpunk')!;
    // #808080: L ≈ 0.6, inside cyberpunk's L range → fully untouched even
    // though its chroma is far below the envelope's 0.10 floor.
    expect(applyMoodToHex('#808080', cyberpunk)).toBe('#808080');
  });

  test('achromatic input still gets the lightness clamp', () => {
    const candy = MOOD_PRESETS.find(m => m.id === 'candy-pop')!;
    const out = applyMoodToHex('#111111', candy); // far below candy-pop's L floor
    const ok = hexToOklch(out)!;
    expect(ok.L).toBeGreaterThanOrEqual(0.60);
    expect(ok.C).toBeLessThan(0.01); // still a gray
  });

  test('works with a bare envelope (no preset metadata)', () => {
    const env: MoodEnvelope = { hueArcs: [[180, 270]], chroma: [0.05, 0.16], lightness: [0.2, 0.65] };
    const ok = hexToOklch(applyMoodToHex('#ffff00', env))!;
    expect(hueInArc(ok.H, [178, 272])).toBe(true);
    expect(ok.L).toBeLessThanOrEqual(0.66);
  });
});

describe('MOOD_PRESETS table', () => {
  test('has 4-6 curated presets with unique ids', () => {
    expect(MOOD_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(MOOD_PRESETS.length).toBeLessThanOrEqual(6);
    const ids = MOOD_PRESETS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every preset has a coherent envelope', () => {
    for (const m of MOOD_PRESETS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.tip.length).toBeGreaterThan(0);
      expect(m.hueArcs.length).toBeGreaterThan(0);
      for (const arc of m.hueArcs) {
        expect(arc[0]).toBeGreaterThanOrEqual(0);
        expect(arc[0]).toBeLessThanOrEqual(360);
        expect(arc[1]).toBeGreaterThanOrEqual(0);
        expect(arc[1]).toBeLessThanOrEqual(360);
        expect(arcLength(arc)).toBeGreaterThan(0);
      }
      expect(m.chroma[0]).toBeLessThanOrEqual(m.chroma[1]);
      expect(m.chroma[0]).toBeGreaterThanOrEqual(0);
      expect(m.lightness[0]).toBeLessThanOrEqual(m.lightness[1]);
      expect(m.lightness[0]).toBeGreaterThanOrEqual(0);
      expect(m.lightness[1]).toBeLessThanOrEqual(1);
    }
  });
});
