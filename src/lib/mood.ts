// Mood preset envelopes (#135): hand-authored hue/chroma/lightness
// constraints that bias palette generation and harmony derivation toward a
// genre/mood feel. Deterministic, curated, no AI involvement: the mood
// sibling of Hardware Lock (which constrains toward a device's swatches).
//
// Envelopes live in OKLCH so they compose with the ramp engine's existing
// gamut-mapping/ΔE_OK machinery. The preset DATA table (MOOD_PRESETS) lives
// in constants.ts next to HARDWARE_PALETTES; this module owns the type and
// the clamp math.

import { hexToOklch, oklchToHex, gamutMap } from './oklch';

// One allowed hue arc, degrees, walked clockwise from start to end.
// start > end wraps through 360 (e.g. [330, 30] covers magenta→red).
// [0, 360] means the full wheel.
export type HueArc = [number, number];

export interface MoodEnvelope {
  hueArcs: HueArc[];          // allowed hue arcs (non-empty)
  chroma: [number, number];   // OKLCH C range, min ≤ max
  lightness: [number, number]; // OKLCH L range, min ≤ max
}

export interface MoodPreset extends MoodEnvelope {
  id: string;
  name: string;
  tip: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const norm360 = (h: number) => ((h % 360) + 360) % 360;

// Arc length in degrees: b - a when b > a, wrap-around adds 360, equal
// endpoints mean a zero-length arc. [0, 360] is the full wheel.
export function arcLength(arc: HueArc): number {
  const [start, end] = arc;
  if (end > start) return end - start;
  if (end === start) return 0;
  return end - start + 360;
}

// Is hue h inside the arc (inclusive endpoints)? Handles wrap-around arcs.
export function hueInArc(h: number, arc: HueArc): boolean {
  const hue = norm360(h);
  const [rawStart, rawEnd] = arc;
  if (arcLength(arc) >= 360) return true;
  const start = norm360(rawStart);
  const end = norm360(rawEnd);
  if (start <= end) return hue >= start && hue <= end;
  return hue >= start || hue <= end; // wrap-around
}

// Signed-magnitude circular distance from hue h to the nearest point of the
// arc (0 when inside).
function distToArc(h: number, arc: HueArc): number {
  if (hueInArc(h, arc)) return 0;
  const hue = norm360(h);
  const dTo = (target: number) => {
    const d = Math.abs(hue - norm360(target)) % 360;
    return Math.min(d, 360 - d);
  };
  return Math.min(dTo(arc[0]), dTo(arc[1]));
}

// Clamp hue into the nearest allowed arc: unchanged when already inside any
// arc, else moved to the closest arc endpoint by circular distance.
export function clampHueToArcs(h: number, arcs: HueArc[]): number {
  if (arcs.length === 0) return norm360(h);
  const hue = norm360(h);
  let best = hue;
  let bestDist = Infinity;
  for (const arc of arcs) {
    if (distToArc(hue, arc) === 0) return hue;
    for (const endpoint of arc) {
      const e = norm360(endpoint);
      const raw = Math.abs(hue - e);
      const de = Math.min(raw, 360 - raw);
      if (de < bestDist) { bestDist = de; best = e; }
    }
  }
  return best;
}

// Clamp a hex color into a mood envelope: L and C clamp into range, H moves
// to the nearest allowed arc, then gamut-map back to sRGB. Achromatic inputs
// (C < 0.01) only get the lightness clamp (the hue of a gray is meaningless,
// and pulling its chroma up to the envelope floor would colorize outlines
// and blacks arbitrarily. Invalid hex passes through untouched.
export function applyMoodToHex(hex: string, mood: MoodEnvelope | null): string {
  if (!mood) return hex;
  const ok = hexToOklch(hex);
  if (!ok) return hex;
  const L = clamp(ok.L, mood.lightness[0], mood.lightness[1]);
  if (ok.C < 0.01) {
    if (L === ok.L) return hex.toLowerCase();
    return oklchToHex(gamutMap({ L, C: ok.C, H: ok.H }, 'auto'));
  }
  const C = clamp(ok.C, mood.chroma[0], mood.chroma[1]);
  const H = clampHueToArcs(ok.H, mood.hueArcs);
  if (L === ok.L && C === ok.C && H === norm360(ok.H)) return hex.toLowerCase();
  return oklchToHex(gamutMap({ L, C, H }, 'auto'));
}
