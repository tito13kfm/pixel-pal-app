import { describe, it, expect } from 'vitest';
import { detectEngineVersion, promoteKeepNewLook, promoteRestoreOldLook } from '../../src/lib/migration';
import legacyFixture from '../fixtures/legacy-palette.json' assert { type: 'json' };
import type { SavedPalettePayload } from '../../src/lib/palette';

describe('detectEngineVersion', () => {
  it('returns hsv-legacy for missing field', () => {
    expect(detectEngineVersion(legacyFixture as SavedPalettePayload)).toBe('hsv-legacy');
  });
  it('returns engineVersion when present', () => {
    const p: SavedPalettePayload = { ...legacyFixture, engineVersion: 'oklch-v1' } as SavedPalettePayload;
    expect(detectEngineVersion(p)).toBe('oklch-v1');
  });
});

describe('promoteKeepNewLook', () => {
  it('returns new payload with engineVersion oklch-v1, no overrides changed', () => {
    const out = promoteKeepNewLook(legacyFixture as SavedPalettePayload);
    expect(out.engineVersion).toBe('oklch-v1');
    expect(out.overrides ?? {}).toEqual({});
    expect(out.restoreFrozen ?? {}).toEqual({});
  });
});

describe('promoteRestoreOldLook', () => {
  it('freezes overrides across all three styles per ramp', () => {
    const out = promoteRestoreOldLook(legacyFixture as SavedPalettePayload);
    expect(out.engineVersion).toBe('oklch-v1');
    for (let i = 0; i < 3; i++) {
      expect(out.restoreFrozen?.[String(i)]).toBe(true);
      expect(out.overrides?.[String(i)]).toBeDefined();
      for (let shadeIdx = 0; shadeIdx < 6; shadeIdx++) {
        const ov = out.overrides![String(i)][String(shadeIdx)];
        expect(ov.punchy).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ov.balanced).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ov.muted).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('frozen hexes exactly match legacy renderer output', async () => {
    const out = promoteRestoreOldLook(legacyFixture as SavedPalettePayload);
    const colorModule = await import('../../src/lib/color');
    const expected = colorModule.generateRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    expect(out.overrides!['0']['0'].punchy).toBe(expected[0]);
  });
});
