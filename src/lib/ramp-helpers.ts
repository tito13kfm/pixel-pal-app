// Pure ramp-helper functions extracted from App.tsx (SP2 phase c, task 3).
//
// Four of these (filterHidden, resolveBaseForRamp, resolveSizeForRamp,
// resolveHueShiftForRamp) previously read App.tsx component state via
// closure. They now take that state as explicit parameters, so any caller
// must pass it in.
import { hexToHsl, hslToHex } from './color';
import { generateRamp as generateRampNew, isValidRampSize } from './ramp-engine';
import { styleToScalars, type StylePresets } from './style-presets';
import { seededHueDelta } from './snapshot-ramps';
import { LIGHTNESS_PRESETS, SAT_PRESETS, type CurvePoints } from './curve';
import type { GamutStrategySerialized } from './palette';

// Map from ramp size to its position labels. The 5/7 sizes are symmetric
// (2/3 shades below base + 2/3 above) so they fit naturally between the
// existing 4 and 8. Centralize the mapping so we only have to add new
// sizes in one place.
//
// Pixel-art slot names (outline / shadow / base / highlight / bright) only
// make sense at small N. Past 8 shades the names stop mapping to anything a
// pixel artist would recognize, so ramps larger than 8 get numeric labels
// ('shade 1'..'shade N', dark to light). Numeric tables carry no 'base'
// entry, so labelsForRamp skips its re-centering pass and returns them
// unchanged.
export function shadeLabelsFor(n: number): string[] {
  if (n <= 1) return ['base'];
  if (n === 2) return ['base', 'highlight'];
  if (n === 3) return ['shadow', 'base', 'highlight'];
  if (n === 4) return ['outline', 'shadow', 'base', 'highlight'];
  if (n === 5) return ['outline', 'shadow', 'base', 'highlight', 'bright'];
  if (n === 6) return ['outline', 'deep shadow', 'shadow', 'base', 'highlight', 'bright'];
  if (n === 7) return ['outline', 'deep shadow', 'shadow', 'base', 'mid highlight', 'highlight', 'bright'];
  if (n === 8) return ['outline', 'deep shadow', 'shadow', 'mid shadow', 'base', 'mid highlight', 'highlight', 'bright'];
  return Array.from({ length: n }, (_, i) => `shade ${i + 1}`);
}

// labelsForRamp: returns labels positioned so 'base' lands on whatever
// slot in the sorted ramp actually holds the input base hex. This
// corrects a labeling drift in generateRamp: the sort-by-lightness step
// at the end can place a style-computed shade (e.g. midHighlight clamped
// to a ceiling that's darker than the actual base) ahead of the base,
// pushing the base into a slot the label table expects to hold a
// different shade. Without this fix, the "base" label points at
// whatever sorted into slot N/2 regardless of which hex is actually
// the input base.
//
// Strategy: find the input base hex in the sorted ramp (case-insensitive
// since generateRamp lowercases its output). Take the dark-side and
// light-side label sequences from shadeLabelsFor(n) and rebuild the
// label array with 'base' centered on the found slot. If the slot
// count on either side doesn't match shadeLabelsFor's expected count,
// labels closest to base are duplicated (with an index suffix) to fill,
// or labels furthest from base are dropped. This keeps the most
// recognizable labels (outline, bright) at the extremes.
//
// Fallback: if the base hex isn't found in the ramp at all (e.g. when
// a pin or hardware lock has replaced the base shade), use the original
// shadeLabelsFor(n) array. The "base" label in that case marks whichever
// slot the original table puts it at, matching the prior behavior so
// pinned-base or hardware-locked palettes label the same as before.
export function labelsForRamp(sortedRamp: string[], baseHex: string): string[] {
  const n = sortedRamp.length;
  const defaultLabels = shadeLabelsFor(n);
  if (typeof baseHex !== 'string') return defaultLabels;
  const target = baseHex.toLowerCase();
  let basePos = -1;
  for (let i = 0; i < sortedRamp.length; i++) {
    if (sortedRamp[i].toLowerCase() === target) { basePos = i; break; }
  }
  if (basePos < 0) return defaultLabels;
  // Find where 'base' sits in the default label table.
  const defaultBasePos = defaultLabels.indexOf('base');
  if (defaultBasePos < 0 || defaultBasePos === basePos) {
    // Nothing to shift, or the base hex landed exactly where the
    // default table expects.
    return defaultLabels;
  }
  // Build new labels. Dark-side labels are defaultLabels[0..defaultBasePos-1].
  // Light-side labels are defaultLabels[defaultBasePos+1..end]. We need
  // basePos dark labels and (n - basePos - 1) light labels.
  const darkSrc = defaultLabels.slice(0, defaultBasePos);
  const lightSrc = defaultLabels.slice(defaultBasePos + 1);
  const labels = new Array(n);
  labels[basePos] = 'base';
  // Dark side: anchor 'outline' to slot 0, fill the slots adjacent to
  // base with the labels nearest to base in the default ordering.
  // If we have more dark slots than dark labels, duplicate the label
  // nearest to base with an index suffix. If we have fewer, drop
  // labels nearest to base (preserving outline at slot 0).
  const darkNeeded = basePos;
  if (darkNeeded <= darkSrc.length) {
    // Use darkSrc[0..darkNeeded-1], keeping outline (index 0) anchored
    // at slot 0 and the labels closest to base get the slots closest
    // to base.
    const keep = darkSrc.slice(0, darkNeeded);
    for (let i = 0; i < darkNeeded; i++) labels[i] = keep[i];
  } else {
    // More dark slots than labels: place all darkSrc labels and pad
    // the slots adjacent to base with a suffixed duplicate of the
    // last (nearest-to-base) label.
    for (let i = 0; i < darkSrc.length; i++) labels[i] = darkSrc[i];
    const nearBase = darkSrc[darkSrc.length - 1] || 'shadow';
    let dupIdx = 2;
    for (let i = darkSrc.length; i < darkNeeded; i++) {
      labels[i] = `${nearBase} ${dupIdx++}`;
    }
  }
  // Light side: mirror the dark-side logic. Slots after base.
  const lightNeeded = n - basePos - 1;
  if (lightNeeded <= lightSrc.length) {
    // Use lightSrc[end - lightNeeded..end], keeping 'bright' (last) at
    // slot n-1 and the labels closest to base near base.
    const keep = lightSrc.slice(lightSrc.length - lightNeeded);
    for (let i = 0; i < lightNeeded; i++) labels[basePos + 1 + i] = keep[i];
  } else {
    // More light slots than labels: pad slots adjacent to base with a
    // suffixed duplicate of the first (nearest-to-base) label.
    const nearBase = lightSrc[0] || 'highlight';
    let dupIdx = 2;
    let writePos = basePos + 1;
    const extra = lightNeeded - lightSrc.length;
    for (let i = 0; i < extra; i++) {
      labels[writePos++] = `${nearBase} ${dupIdx++}`;
    }
    for (let i = 0; i < lightSrc.length; i++) {
      labels[writePos++] = lightSrc[i];
    }
  }
  return labels;
}

// applyOverrides: given the raw ramp for base `i` and the current overrides
// map, substitute any pinned shade indices. Out-of-range pin indices (e.g.
// an old pin on shade 7 when the ramp is now size 4) are silently ignored,
// matching the "keep them around but inert" policy in the state comment.
//
// Schema: overrides[baseIndex][shadeIndex] is a per-style object
// { punchy?, balanced?, muted? }, each entry a 6-digit hex. Pins are
// applied only to the matching style; ramps for the other two styles
// are unaffected at that shade index. The `style` arg picks which key.
export function applyOverrides(
  ramp: string[],
  baseIndex: number,
  overrideMap: Record<number, Record<number, { punchy?: string; balanced?: string; muted?: string; custom?: string }>>,
  style: 'punchy' | 'balanced' | 'muted' | 'custom'
): string[] {
  const pinsForBase = overrideMap[baseIndex];
  if (!pinsForBase) return ramp;
  let next: string[] | null = null;
  for (const k of Object.keys(pinsForBase)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= ramp.length) continue;
    const styleMap = (pinsForBase as any)[k];
    if (!styleMap || typeof styleMap !== 'object') continue;
    const hex = styleMap[style];
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
    if (next === null) next = ramp.slice();
    next[idx] = hex.toLowerCase();
  }
  return next || ramp;
}

// filterHidden: returns { hexes, labels, originalIndices } with the
// hidden shades for base `baseIndex` removed. Internally ramps are
// still computed at their full size (so pins, harmony anchor, and the
// generator's lightness curves keep their position semantics); this
// helper filters at the boundary right before display/export.
// originalIndices is parallel to hexes/labels and gives the pre-filter
// shade-index for each surviving entry, used by the swatch grid so
// the right-click handler can target the correct position.
export function filterHidden(
  ramp: string[],
  labels: string[],
  baseIndex: number,
  hiddenShades: Record<number, number[]>
): { hexes: string[]; labels: string[]; originalIndices: number[] } {
  const hidden = hiddenShades[baseIndex];
  if (!Array.isArray(hidden) || hidden.length === 0) {
    return { hexes: ramp, labels, originalIndices: ramp.map((_, j) => j) };
  }
  const hiddenSet = new Set(hidden);
  const hexes: string[] = [];
  const filteredLabels: string[] = [];
  const originalIndices: number[] = [];
  for (let j = 0; j < ramp.length; j++) {
    if (hiddenSet.has(j)) continue;
    hexes.push(ramp[j]);
    filteredLabels.push(labels[j]);
    originalIndices.push(j);
  }
  return { hexes, labels: filteredLabels, originalIndices };
}

// resolveBaseForRamp: returns the base hex to feed into generateRamp for
// ramp `i`, applying any per-ramp saturation multiplier. The multiplier
// adjusts the base's HSL saturation BEFORE generateRamp runs; the style
// curves (Punchy/Balanced/Muted) then operate on the adjusted saturation
// and produce a ramp with the new tonal feel. We deliberately do NOT
// scale anywhere inside generateRamp itself since that would change its
// byte-identity. Multiplier clamped to [0, 100] internally.
export function resolveBaseForRamp(hex: string, baseIndex: number, rampSatOverrides: Record<number, number>): string {
  const mult = rampSatOverrides[baseIndex];
  if (mult === undefined || mult === 1) return hex;
  const hsl = hexToHsl(hex);
  const newSat = Math.max(0, Math.min(100, hsl.s * mult));
  return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
}

// resolveSizeForRamp: returns the shade count for ramp `i`, applying any
// per-ramp override. Falls back to the global rampSize.
export function resolveSizeForRamp(baseIndex: number, rampSizeOverrides: Record<number, number>, rampSize: number): number {
  const override = rampSizeOverrides[baseIndex];
  if (isValidRampSize(override)) return override;
  return rampSize;
}

export function resolveHueShiftForRamp(
  baseIndex: number,
  hueShiftStrengthPerRamp: Record<number, number>,
  hueShiftStrength: number
): number {
  return hueShiftStrengthPerRamp[baseIndex] ?? hueShiftStrength;
}

export interface GenerateRampClosureState {
  gamutPerRamp: Record<string, GamutStrategySerialized>;
  stylePresets: StylePresets;
  shuffleSeed: number;
  rampShuffleOffsets: Record<number, number>;
  lightnessCurvePerRamp: Record<string, CurvePoints>;
  satCurvePerRamp: Record<string, CurvePoints>;
}

// Adapter over generateRampNew that returns hex[] (the rest of the pipeline
// works in flat hex arrays). Resolves the style name + editable stylePresets
// to the engine's { reach, chromaFalloff } scalars, threads per-ramp curve +
// gamut, and passes a seeded hueJitter (global reshuffle + per-ramp offset)
// so reshuffles vary while the base slot stays anchored. Seed 0 + no offset
// = zero jitter (deterministic baseline).
export function generateRamp(
  baseHex: string,
  numColors: number,
  style: 'punchy' | 'balanced' | 'muted' | 'custom',
  hueShiftStrength: number,
  rampIdx: number | undefined,
  closureState: GenerateRampClosureState
): string[] {
  const { gamutPerRamp, stylePresets, shuffleSeed, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp } = closureState;
  const rampKey = rampIdx !== undefined ? String(rampIdx) : undefined;
  const gamut = rampKey !== undefined ? gamutPerRamp[rampKey] : undefined;
  const { reach, chromaFalloff } = styleToScalars(style, stylePresets);
  let hueJitter = 0;
  if (rampIdx !== undefined) {
    const effectiveSeed = shuffleSeed + (rampShuffleOffsets[rampIdx] || 0);
    if (effectiveSeed !== 0) hueJitter = seededHueDelta(effectiveSeed, rampIdx);
  }
  const shades = generateRampNew(baseHex, {
    reach,
    chromaFalloff,
    size: numColors,
    hueShiftStrength,
    hueJitter,
    lightnessCurve: rampKey !== undefined ? (lightnessCurvePerRamp[rampKey] ?? LIGHTNESS_PRESETS.eased) : LIGHTNESS_PRESETS.eased,
    satCurve: rampKey !== undefined ? (satCurvePerRamp[rampKey] ?? SAT_PRESETS.flat) : SAT_PRESETS.flat,
    gamut,
  });
  return shades.map(s => s.hex);
}
