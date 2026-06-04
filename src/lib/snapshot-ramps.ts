import type { CurvePoints } from './curve';
import type { GamutStrategy } from './oklch';
import { DEFAULT_STYLE_PRESETS } from './style-presets';
import { buildRamp } from './ramp-pipeline';

// seededHueDelta: deterministic hue offset in degrees for (effectiveSeed,
// rampIdx). Replaces the old seededRandom jitter that the legacy HSV engine
// used per-shade. The perceptual engine is called once per ramp so jitter is
// applied to the BASE color instead — the whole ramp shifts together, keeping
// the smooth OKLCH graduation intact. Seed 0 always returns 0 (baseline, no
// jitter). Range ±8° — noticeable variation without changing color identity.
export const seededHueDelta = (effectiveSeed: number, rampIdx: number): number => {
  if (effectiveSeed === 0) return 0;
  const n = Math.imul(effectiveSeed * 17 + rampIdx * 31, 0x45d9f3b) >>> 0;
  return (n / 0x100000000 - 0.5) * 16;
};

// ---------- Side-by-side palette regeneration helper ----------
// Given a "snapshot" of a palette (the same shape as a saved-palette payload
// or a synthesized snapshot of the live working palette), regenerate the
// ramps for a single style. Self-contained: does NOT depend on component
// state. The component's useMemos use their own per-style applyOverrides
// and applyHardwareLock closures; we duplicate the tiny pure logic here
// rather than refactor those (low risk, easy to test).
//
// v0.6 perceptual engine: this function now uses generateRampNew (perceptual
// OKLCH). shuffleSeed + rampShuffleOffsets feed the engine's hueJitter (a
// per-ramp hue offset that leaves the base slot anchored), replacing the old
// HSV base pre-jitter. Snapshots produced before v0.6 (history undo entries
// from older sessions) render via the new engine and may look different than
// they did at capture time; this matches the migration banner's "Keep new
// look" semantics.

// Snapshot fields used (all optional except baseColors):
//   baseColors: string[]                 required
//   rampSize: 4|5|6|7|8                  default 5
//   shuffleSeed: number                  default 0
//   overrides: { [baseIdx]: { [shadeIdx]: { punchy?, balanced?, muted? } } }
//   rampSizeOverrides: { [baseIdx]: 4..8 }
//   rampSatOverrides: { [baseIdx]: number (saturation multiplier) }
//   rampShuffleOffsets: { [baseIdx]: number }
//   hiddenShades: { [baseIdx]: number[] }
//   hardwareLock: null | string (HARDWARE_PALETTES id)
//   hueShiftStrength: number (default 1.0; scales shadow/highlight hue shift)
//   lightnessCurvePerRamp: { [baseIdx]: CurvePoints }
//   satCurvePerRamp: { [baseIdx]: CurvePoints }
//   curvePerRamp: legacy string preset map (migrated on load)
//   gamutPerRamp: { [baseIdx]: 'auto'|'clip'|'chroma-preserve' }
//   stylePresets: { punchy|balanced|muted: { reach, chromaFalloff } }
//
// Returns string[][], one inner array per baseColor, in baseColors order,
// with hidden shades already filtered out.
export interface RampSnapshot {
  baseColors: string[];
  rampSize?: number;
  overrides?: Record<number, Record<number, Record<string, string>>>;
  rampSizeOverrides?: Record<number, number>;
  rampSatOverrides?: Record<number, number>;
  hiddenShades?: Record<number, number[]>;
  hardwareLock?: string | null;
  hueShiftStrength?: number;
  hueShiftStrengthPerRamp?: Record<number, number>;
  lightnessCurvePerRamp?: Record<number, CurvePoints>;
  satCurvePerRamp?: Record<number, CurvePoints>;
  curvePerRamp?: Record<number, string | CurvePoints>;
  gamutPerRamp?: Record<number, GamutStrategy>;
  shuffleSeed?: number;
  rampShuffleOffsets?: Record<number, number>;
  stylePresets?: typeof DEFAULT_STYLE_PRESETS;
  engineVersion?: number; // absent -> 1 (legacy render); new palettes -> 2 (Task 8)
  [key: string]: unknown; // forward-compat
}

export const buildRampsForSnapshot = (snapshot: RampSnapshot | null, style: string): string[][] => {
  if (!snapshot || !Array.isArray(snapshot.baseColors) || snapshot.baseColors.length === 0) {
    return [];
  }
  // Delegates to the shared per-ramp pipeline (src/lib/ramp-pipeline.ts) so the
  // live App.tsx memos and this snapshot path are ONE code path — structural
  // mirror, no duplicated generate→pin→snap→filter (the #30 duplication is gone).
  return snapshot.baseColors.map((_, i) => buildRamp(snapshot, style, i));
};
