import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from '../../src/lib/style-presets';

// Engine-level v1 characterization. Freezes generateRamp's current output so the
// Task 2 pipeline extraction + Task 3 engineVersion threading provably do not
// change v1. If any value here changes, the refactor leaked behaviour — STOP.
const BASES = { green: '#37cd76', navy: '#1a2f6b', red: '#cc3344', grey: '#888888', yellow: '#e8d24a' };
const SIZES = [2, 4, 7, 16, 64];

describe('v1 ramp characterization (frozen — must not change)', () => {
  for (const [name, hex] of Object.entries(BASES)) {
    for (const N of SIZES) {
      it(`${name} N=${N}`, () => {
        const { reach, chromaFalloff } = styleToScalars('punchy', DEFAULT_STYLE_PRESETS);
        const shades = generateRamp(hex, { reach, chromaFalloff, size: N, hueShiftStrength: 1.0 });
        expect(shades.map(s => s.hex)).toMatchSnapshot();
      });
    }
  }
});
