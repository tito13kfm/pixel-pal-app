import { generateRamp as generateRampNew, isValidRampSize } from './ramp-engine';
import { presetToPoints, LIGHTNESS_PRESETS, SAT_PRESETS } from './curve';
import type { CurvePoints } from './curve';
import type { GamutStrategy } from './oklch';
import { HARDWARE_PALETTES } from './constants';
import { hexToHsl, hslToHex } from './color';
import { resolveRampScalars, DEFAULT_STYLE_PRESETS } from './style-presets';
import type { RampStyle } from './style-presets';
import { quantizeToHardware } from './hardware-quantize';
import { seededHueDelta } from './snapshot-ramps';
import type { RampSnapshot } from './snapshot-ramps';

type Hsl = { h: number; s: number; l: number };

// ---------- Shared per-ramp pipeline ----------
// buildRamp assembles ONE ramp for one base index and one style. It is the
// single code path both the live App.tsx memos and buildRampsForSnapshot call,
// so the live↔snapshot mirror is structural; they cannot diverge by
// construction (the duplication that produced #30 is gone). Pure: depends only
// on its snapshot argument, no component state.
//
// Pipeline: resolveBase (sat override) → generateRamp → pinRamp (per-style pins)
// → snapHardware (quantize + dedupe) → filterHidden. Byte-identical to the
// per-base body previously inlined in buildRampsForSnapshot. Per-snapshot setup
// (curve migration, hardware lookup) is recomputed per call, cheap, keeps the
// function self-contained, output unchanged.
export function buildRamp(snapshot: RampSnapshot, style: string, baseIndex: number): string[] {
  const {
    baseColors,
    rampSize = 5,
    overrides = {},
    rampSizeOverrides = {},
    rampSatOverrides = {},
    hiddenShades = {},
    hardwareLock = null,
    hueShiftStrength = 1.0,
    hueShiftStrengthPerRamp = {},
    lightnessCurvePerRamp = {},
    satCurvePerRamp = {},
    curvePerRamp = {},
    gamutPerRamp = {},
    shuffleSeed = 0,
    rampShuffleOffsets = {},
    stylePresets = DEFAULT_STYLE_PRESETS,
    rampStyleScalars = {},
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

  const i = baseIndex;
  const c = baseColors[i];

  // resolveBase: apply per-ramp saturation multiplier to the base hex.
  const resolveBase = (hex: string): string => {
    const mult = (rampSatOverrides as Record<number, number>)[i];
    if (mult === undefined || mult === 1) return hex;
    const hsl = hexToHsl(hex) as Hsl;
    const newSat = Math.max(0, Math.min(100, hsl.s * mult));
    return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
  };

  // resolveSize: per-ramp shade-count override, else global rampSize.
  const sizeOverride = (rampSizeOverrides as Record<number, number>)[i];
  const size = isValidRampSize(sizeOverride) ? sizeOverride : rampSize;

  // resolveHueShift: per-ramp override, else global. Mirrors the live
  // resolveHueShiftForRamp. Snapshots that never stored a per-ramp value fall
  // back to the global hueShiftStrength → identical to the legacy render.
  // (The legacy buildRampsForSnapshot honored ONLY the global value; honoring
  // the per-ramp map here is the intended #35 mirror fix: a saved palette with
  // a per-ramp hue override now renders the same in the compare/history view as
  // it does live.)
  const effectiveHueShift = (hueShiftStrengthPerRamp as Record<number, number>)[i] ?? hueShiftStrength;

  const { reach, chromaFalloff } = resolveRampScalars({
    style: style as RampStyle,
    baseIndex: i,
    stylePresets,
    rampStyleScalars,
  });
  const effectiveSeed = (shuffleSeed || 0) + ((rampShuffleOffsets as Record<number, number>)[i] || 0);
  const hueJitter = effectiveSeed !== 0 ? seededHueDelta(effectiveSeed, i) : 0;

  const shades = generateRampNew(resolveBase(c), {
    reach,
    chromaFalloff,
    size,
    hueShiftStrength: effectiveHueShift,
    hueJitter,
    lightnessCurve: (effectiveLightnessCurves[i] ?? effectiveLightnessCurves[String(i)] ?? LIGHTNESS_PRESETS.eased) as CurvePoints,
    satCurve: ((satCurvePerRamp as Record<number, unknown>)[i] ?? (satCurvePerRamp as Record<string, unknown>)[String(i)] ?? SAT_PRESETS.flat) as CurvePoints,
    gamut: ((gamutPerRamp as Record<number, unknown>)[i] ?? (gamutPerRamp as Record<string, unknown>)[String(i)]) as GamutStrategy,
  });

  // pinRamp: substitute per-style pinned shade indices.
  const raw = shades.map(s => s.hex);
  let pinned = raw;
  const pinsForBase = (overrides as Record<number, unknown>)[i];
  if (pinsForBase) {
    let next: string[] | null = null;
    for (const k of Object.keys(pinsForBase as Record<string, unknown>)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) continue;
      const styleMap = (pinsForBase as Record<string, unknown>)[k];
      if (!styleMap || typeof styleMap !== 'object') continue;
      const hex = (styleMap as Record<string, unknown>)[style];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
      if (next === null) next = raw.slice();
      next[idx] = hex.toLowerCase();
    }
    pinned = next || raw;
  }

  // snapHardware: quantize to the locked palette + dedupe consecutive duplicates.
  let locked = pinned;
  if (hardware && hardware.colors && hardware.colors.length > 0) {
    const snapped = pinned.map(hex => quantizeToHardware(hex, hardware));
    const deduped: string[] = [];
    for (const hex of snapped) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== hex) {
        deduped.push(hex);
      }
    }
    locked = deduped;
  }

  // filterHidden: drop hidden shade indices (post-snap index space). The live
  // App.tsx memo does NOT filter here (it filters at the display boundary), so
  // the live snapshot passed to buildRamp omits hiddenShades → this is inert
  // for the live path and the memo stays full-length.
  const hidden = (hiddenShades as Record<number, number[]>)[i];
  if (!Array.isArray(hidden) || hidden.length === 0) return locked;
  const hiddenSet = new Set(hidden);
  const out: string[] = [];
  for (let j = 0; j < locked.length; j++) {
    if (!hiddenSet.has(j)) out.push(locked[j]);
  }
  return out;
}
