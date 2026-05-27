// Migration helpers for the perceptual ramp engine (v0.6).
// Two promotion paths from hsv-legacy → oklch-v1:
//   - Keep new look: re-render with new engine on next load (no override changes).
//   - Restore old look: freeze legacy-rendered hexes into overrides across all styles.

import type { SavedPalettePayload, EngineVersion } from './palette';
import { _legacyHsvRamp } from './ramp-engine';

const STYLES: Array<'punchy' | 'balanced' | 'muted'> = ['punchy', 'balanced', 'muted'];

export function detectEngineVersion(p: SavedPalettePayload): EngineVersion {
  return p.engineVersion ?? 'hsv-legacy';
}

export function promoteKeepNewLook(p: SavedPalettePayload): SavedPalettePayload {
  return { ...p, engineVersion: 'oklch-v1' };
}

export function promoteRestoreOldLook(p: SavedPalettePayload): SavedPalettePayload {
  const size = p.rampSize ?? 6;
  const shuffleSeed = p.shuffleSeed ?? 0;
  const hueShift = p.hueShiftStrength ?? 1.0;

  const overrides: NonNullable<SavedPalettePayload['overrides']> = { ...(p.overrides ?? {}) };
  const restoreFrozen: NonNullable<SavedPalettePayload['restoreFrozen']> = { ...(p.restoreFrozen ?? {}) };

  for (let rampIdx = 0; rampIdx < p.baseColors.length; rampIdx++) {
    const base = p.baseColors[rampIdx];
    const rampSize = (p.rampSizeOverrides && p.rampSizeOverrides[String(rampIdx)]) ?? size;
    const offset = (p.rampShuffleOffsets && p.rampShuffleOffsets[String(rampIdx)]) ?? 0;
    const seed = shuffleSeed * 17 + rampIdx * 31 + offset * 13;

    const rampKey = String(rampIdx);
    const rampOverrides = { ...(overrides[rampKey] ?? {}) };

    for (const style of STYLES) {
      const shades = _legacyHsvRamp(base, rampSize, seed, style, hueShift);
      for (let shadeIdx = 0; shadeIdx < shades.length; shadeIdx++) {
        const shadeKey = String(shadeIdx);
        const existing = rampOverrides[shadeKey] ?? {};
        rampOverrides[shadeKey] = { ...existing, [style]: shades[shadeIdx] };
      }
    }

    overrides[rampKey] = rampOverrides;
    restoreFrozen[rampKey] = true;
  }

  return {
    ...p,
    engineVersion: 'oklch-v1',
    overrides,
    restoreFrozen,
  };
}
