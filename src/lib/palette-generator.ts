// One-click multi-base palette generator (backlog item F): press once →
// a cohesive set of base colors that generally work together, Coolors-style,
// each destined for its own OKLCH ramp. Non-AI, no key, deterministic given
// an injected RNG. Optionally seeded (one base locked, companions derived
// around it) and optionally biased by a mood preset envelope (#135).
//
// Hue strategy: golden-angle walk (137.508°) from an anchor hue, mapped into
// the envelope's allowed hue arcs via a "virtual interval" (all arcs laid
// end to end), so multi-arc moods sample evenly across their allowed hue
// measure. Golden-angle spacing stays well-distributed for any N and never
// collapses into near-duplicates the way independent uniform draws do.
// Lightness is stratified across the envelope range so bases separate
// tonally; a ΔE_OK repair pass resamples any base that lands too close to an
// already-accepted one (best-effort under tight envelopes).

import { hexToOklch, oklchToHex, gamutMap, deltaEOK } from './oklch';
import type { Oklch } from './oklch';
import { arcLength } from './mood';
import type { MoodEnvelope, HueArc } from './mood';

export const DEFAULT_GENERATOR_ENVELOPE: MoodEnvelope = {
  // Full wheel, but lightness/chroma biased toward pleasing mid-tones rather
  // than full gamut (full-gamut rolls routinely produce near-black/near-white
  // sludge; buildRandomHex biases for the same reason).
  hueArcs: [[0, 360]],
  chroma: [0.07, 0.17],
  lightness: [0.40, 0.78],
};

export interface GeneratePaletteOpts {
  count?: number;              // bases to generate; default 5, clamped 2..16
  seedHex?: string | null;     // lock base 0 verbatim, derive the rest around it
  mood?: MoodEnvelope | null;  // envelope bias; null = DEFAULT_GENERATOR_ENVELOPE
  rng?: () => number;          // uniform [0,1); default Math.random
}

const GOLDEN_ANGLE = 137.508;
// Target pairwise perceptual separation between bases. Best-effort: a tight
// mood envelope at high N cannot always reach it, and that's acceptable.
const TARGET_MIN_DE = 0.09;
const REPAIR_ATTEMPTS = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const HEX6_RE = /^#[0-9a-fA-F]{6}$/;

// Map a position in the concatenated virtual hue interval [0, totalLen) back
// to an actual hue inside one of the arcs.
function hueFromVirtual(arcs: HueArc[], totalLen: number, pos: number): number {
  let p = ((pos % totalLen) + totalLen) % totalLen;
  for (const arc of arcs) {
    const len = arcLength(arc);
    if (p < len) return (arc[0] + p) % 360;
    p -= len;
  }
  return arcs[0][0] % 360; // unreachable with len > 0 arcs; defensive
}

// Inverse of hueFromVirtual: virtual position of hue h, or null when h is
// outside every arc.
function virtualFromHue(arcs: HueArc[], h: number): number | null {
  const hue = ((h % 360) + 360) % 360;
  let offset = 0;
  for (const arc of arcs) {
    const len = arcLength(arc);
    const start = ((arc[0] % 360) + 360) % 360;
    const delta = (hue - start + 360) % 360;
    if (delta <= len) return offset + Math.min(delta, len);
    offset += len;
  }
  return null;
}

function sampleShade(
  envelope: MoodEnvelope, totalLen: number,
  huePos: number, stratum: number, count: number, rng: () => number,
): Oklch {
  // Jitter the hue a little (±8° worth of virtual interval) so runs with the
  // same anchor don't produce identical wheels.
  const jitter = (rng() - 0.5) * 2 * 8 * (totalLen / 360);
  const H = hueFromVirtual(envelope.hueArcs, totalLen, huePos + jitter);
  const [lMin, lMax] = envelope.lightness;
  // Stratified lightness: land inside this base's stratum, keeping a margin
  // so neighboring strata can't touch.
  const L = lMin + (lMax - lMin) * ((stratum + 0.15 + 0.7 * rng()) / count);
  const [cMin, cMax] = envelope.chroma;
  const C = cMin + (cMax - cMin) * rng();
  return gamutMap({ L: clamp(L, 0, 1), C, H }, 'auto');
}

function minDeltaE(candidate: Oklch, accepted: Oklch[]): number {
  let min = Infinity;
  for (const a of accepted) {
    const d = deltaEOK(candidate, a);
    if (d < min) min = d;
  }
  return min;
}

// Generate `count` base hexes. With seedHex, the seed is returned VERBATIM at
// index 0 (lowercased, never mood-clamped: the user's pick wins; the mood
// shapes the companions) and the walk anchors on its hue. Returns lowercase
// 6-digit hexes.
export function generatePalette(opts: GeneratePaletteOpts = {}): string[] {
  const rng = opts.rng ?? Math.random;
  const count = clamp(Math.round(opts.count ?? 5), 2, 16);
  const envelope = opts.mood ?? DEFAULT_GENERATOR_ENVELOPE;
  const arcs = envelope.hueArcs.filter(a => arcLength(a) > 0);
  const safeEnvelope: MoodEnvelope = arcs.length > 0
    ? { ...envelope, hueArcs: arcs }
    : { ...envelope, hueArcs: [[0, 360]] };
  const totalLen = safeEnvelope.hueArcs.reduce((sum, a) => sum + arcLength(a), 0);

  const seedHex = opts.seedHex && HEX6_RE.test(opts.seedHex) ? opts.seedHex.toLowerCase() : null;
  const seedOk = seedHex ? hexToOklch(seedHex) : null;

  // Anchor position in the virtual hue interval: the seed's hue when it's
  // chromatic enough to have one (clamped into the arcs), else random.
  let anchorPos: number;
  if (seedOk && seedOk.C >= 0.02) {
    anchorPos = virtualFromHue(safeEnvelope.hueArcs, seedOk.H) ?? rng() * totalLen;
  } else {
    anchorPos = rng() * totalLen;
  }

  // Shuffled stratum order (Fisher-Yates on rng) so the palette isn't a
  // monotonic dark→light staircase.
  const strata = Array.from({ length: count }, (_, i) => i);
  for (let i = strata.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [strata[i], strata[j]] = [strata[j], strata[i]];
  }

  const accepted: Oklch[] = [];
  const hexes: string[] = [];

  const startIndex = seedOk ? 1 : 0;
  if (seedHex && seedOk) {
    accepted.push(seedOk);
    hexes.push(seedHex);
  }

  for (let i = startIndex; i < count; i++) {
    const huePos = anchorPos + i * GOLDEN_ANGLE * (totalLen / 360);
    let best = sampleShade(safeEnvelope, totalLen, huePos, strata[i], count, rng);
    let bestSep = minDeltaE(best, accepted);
    // ΔE repair: resample while too close to an accepted base, keeping the
    // best-separated candidate seen. Later attempts also roam lightness
    // strata so a hue-pinned tight envelope can still separate tonally.
    for (let attempt = 0; attempt < REPAIR_ATTEMPTS && bestSep < TARGET_MIN_DE; attempt++) {
      const stratum = attempt < 3 ? strata[i] : Math.floor(rng() * count);
      const candidate = sampleShade(safeEnvelope, totalLen, huePos, stratum, count, rng);
      const sep = minDeltaE(candidate, accepted);
      if (sep > bestSep) { best = candidate; bestSep = sep; }
    }
    accepted.push(best);
    hexes.push(oklchToHex(best));
  }

  return hexes;
}
