import { describe, it, expect } from 'vitest';
import { generateHarmony } from '../../src/lib/harmony';

const KEYS = [
  'complementary', 'analogous1', 'analogous2', 'triadic1', 'triadic2',
  'splitComp1', 'splitComp2', 'tetradic1', 'tetradic2', 'tetradic3',
  'square1', 'square2', 'square3',
];

describe('generateHarmony', () => {
  it('returns all harmony keys as valid hex strings', () => {
    const h = generateHarmony(['#ff0000']);
    for (const k of KEYS) {
      expect(h).toHaveProperty(k);
      expect((h as Record<string, string>)[k]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('is deterministic for the same input', () => {
    expect(generateHarmony(['#3366cc'])).toEqual(generateHarmony(['#3366cc']));
  });
  it('picks the most-saturated base as anchor (order-independent)', () => {
    const a = generateHarmony(['#808080', '#ff0000']);
    const b = generateHarmony(['#ff0000', '#808080']);
    expect(a).toEqual(b);
  });
});
