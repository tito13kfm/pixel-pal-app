import { generateRamp as generateRampNew } from './ramp-engine';
import { presetToPoints, LIGHTNESS_PRESETS, SAT_PRESETS } from './curve';
import type { CurvePoints } from './curve';
import type { GamutStrategy } from './oklch';
import { HARDWARE_PALETTES } from './constants';
import { hexToHsl, hslToHex } from './color';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from './style-presets';
import { quantizeToHardware } from './hardware-quantize';

type Hsl = { h: number; s: number; l: number };

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
  lightnessCurvePerRamp?: Record<number, CurvePoints>;
  satCurvePerRamp?: Record<number, CurvePoints>;
  curvePerRamp?: Record<number, string | CurvePoints>;
  gamutPerRamp?: Record<number, GamutStrategy>;
  shuffleSeed?: number;
  rampShuffleOffsets?: Record<number, number>;
  stylePresets?: typeof DEFAULT_STYLE_PRESETS;
  [key: string]: unknown; // forward-compat
}

export const buildRampsForSnapshot = (snapshot: RampSnapshot | null, style: string): string[][] => {
  if (!snapshot || !Array.isArray(snapshot.baseColors) || snapshot.baseColors.length === 0) {
    return [];
  }
  const {
    baseColors,
    rampSize = 5,
    overrides = {},
    rampSizeOverrides = {},
    rampSatOverrides = {},
    hiddenShades = {},
    hardwareLock = null,
    hueShiftStrength = 1.0,
    lightnessCurvePerRamp = {},
    satCurvePerRamp = {},
    curvePerRamp = {},
    gamutPerRamp = {},
    shuffleSeed = 0,
    rampShuffleOffsets = {},
    stylePresets = DEFAULT_STYLE_PRESETS,
  } = snapshot;
  // Migrate legacy string presets from curvePerRamp into lightnessCurvePerRamp.
  const effectiveLightnessCurves: Record<string, unknown> = { ...(lightnessCurvePerRamp as Record<string, unknown>) };
  for (const [id, val] of Object.entries(curvePerRamp as Record<string, unknown>)) {
    if (!(id in effectiveLightnessCurves)) {
      effectiveLightnessCurves[id] = typeof val === 'string' ? presetToPoints(val) : val;
    }
  }

  const hardware = hardwareLock
    ? (HARDWARE_PALETTES.find(hw => hw.id === hardwareLock) || null)
    : null;

  // Resolve effective base hex for ramp `i`, applying per-ramp saturation
  // multiplier if present. Mirrors resolveBaseForRamp in the component.
  const resolveBase = (hex: string, baseIndex: number) => {
    const mult = rampSatOverrides[baseIndex];
    if (mult === undefined || mult === 1) return hex;
    const hsl = hexToHsl(hex) as Hsl;
    const newSat = Math.max(0, Math.min(100, hsl.s * mult));
    return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
  };

  // Resolve effective shade count for ramp `i`. Mirrors resolveSizeForRamp.
  const resolveSize = (baseIndex: number) => {
    const override = rampSizeOverrides[baseIndex];
    if (override && [4, 5, 6, 7, 8].includes(override)) return override;
    return rampSize;
  };

  // Style-keyed applyOverrides. Mirrors the component-scope version.
  const pinRamp = (ramp: string[], baseIndex: number) => {
    const pinsForBase = (overrides as Record<number, unknown>)[baseIndex];
    if (!pinsForBase) return ramp;
    let next: string[] | null = null;
    for (const k of Object.keys(pinsForBase as Record<string, unknown>)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= ramp.length) continue;
      const styleMap = (pinsForBase as Record<string, unknown>)[k];
      if (!styleMap || typeof styleMap !== 'object') continue;
      const hex = (styleMap as Record<string, unknown>)[style];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
      if (next === null) next = ramp.slice();
      next[idx] = hex.toLowerCase();
    }
    return next || ramp;
  };

  // Snap to hardware palette + dedupe consecutive duplicates. Mirrors
  // applyHardwareLock in the component.
  const snapHardware = (ramp: string[]) => {
    if (!hardware || !hardware.colors || hardware.colors.length === 0) return ramp;
    const snapped = ramp.map(hex => quantizeToHardware(hex, hardware));
    const deduped: string[] = [];
    for (const hex of snapped) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== hex) {
        deduped.push(hex);
      }
    }
    return deduped;
  };

  // Filter out hidden shade indices for base `i`. Applied to the post-pin,
  // POST-hardware (snapped + deduped) ramp — the SAME index space the live
  // working pipeline uses: rampsPunchy[i] in App.tsx is hardware-locked, and
  // the swatch grid captures hide-indices from `originalIndices` of that
  // post-snap array (see hideShade / origJ). So hidden indices are post-snap,
  // NOT the pre-snap/un-snapped space; this mirrors the live display exactly.
  // (Caveat, not a divergence: toggling a hardware lock that dedupes a ramp
  // shorter can leave a previously-captured index stale — same in both paths.)
  const filterHidden = (ramp: string[], baseIndex: number) => {
    const hidden = hiddenShades[baseIndex];
    if (!Array.isArray(hidden) || hidden.length === 0) return ramp;
    const hiddenSet = new Set(hidden);
    const out: string[] = [];
    for (let j = 0; j < ramp.length; j++) {
      if (!hiddenSet.has(j)) out.push(ramp[j]);
    }
    return out;
  };

  return baseColors.map((c, i) => {
    const { reach, chromaFalloff } = styleToScalars(style, stylePresets);
    const effectiveSeed = (shuffleSeed || 0) + (rampShuffleOffsets[i] || 0);
    const hueJitter = effectiveSeed !== 0 ? seededHueDelta(effectiveSeed, i) : 0;
    const shades = generateRampNew(resolveBase(c, i), {
      reach,
      chromaFalloff,
      size: resolveSize(i),
      hueShiftStrength,
      hueJitter,
      lightnessCurve: (effectiveLightnessCurves[i] ?? effectiveLightnessCurves[String(i)] ?? LIGHTNESS_PRESETS.eased) as CurvePoints,
      satCurve: (satCurvePerRamp[i] ?? (satCurvePerRamp as Record<string, unknown>)[String(i)] ?? SAT_PRESETS.flat) as CurvePoints,
      gamut: (gamutPerRamp[i] ?? (gamutPerRamp as Record<string, unknown>)[String(i)]) as GamutStrategy,
    });
    const raw = shades.map(s => s.hex);
    const pinned = pinRamp(raw, i);
    const locked = snapHardware(pinned);
    return filterHidden(locked, i);
  });
};
