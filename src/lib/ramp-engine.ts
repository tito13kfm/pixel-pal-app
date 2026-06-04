import { hexToOklch, oklchToHex, gamutMap } from './oklch';
import type { Oklch, GamutStrategy } from './oklch';
import { evalCurve, LIGHTNESS_PRESETS, SAT_PRESETS } from './curve';
import type { CurvePoints } from './curve';

export interface GenerateRampOpts {
  reach: number;          // 0..1, lightness spread from base (wider = more contrast)
  chromaFalloff: number;  // 0..1, gray-out rate toward the ends
  size: number;
  hueShiftStrength: number;
  hueJitter?: number;     // per-ramp hue offset (shuffle); default 0
  satMultiplier?: number;
  lightnessCurve?: CurvePoints;
  satCurve?: CurvePoints;
  gamut?: GamutStrategy;
  pins?: Record<number, string>;
  hidden?: number[];
  hardwareLock?: string | null;
  engineVersion?: number; // 1 = legacy (default), 2 = re-centered allocation (Task 4)
}

export interface Shade {
  hex: string;
  oklch: Oklch;
  pinned: boolean;
  gamutClipped: boolean;
}

const L_FLOOR = 0.04;
const L_CEIL  = 0.96;
const STEP_DELTA = 0.05; // min lightness gap so the base reads distinct from neighbors

const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function reachToCaps(reach: number): { darkCap: number; lightCap: number } {
  const r = clamp(reach, 0, 1);
  return {
    // Caps are kept within a moderate range so gamut clipping at extremes
    // doesn't overwhelm the chromaFalloff ordering. Going to 0.10/0.96
    // puts saturated-base ends deep in gamut-clipping territory, causing
    // PUNCHY (high floorFrac) to clip harder than BALANCED (moderate frac)
    // and inverting the expected end-chroma ordering. Tighter caps ensure
    // floorFrac differences dominate over gamut effects.
    darkCap:  clamp(lerp(0.33, 0.12, r), L_FLOOR, L_CEIL),
    lightCap: clamp(lerp(0.76, 0.935, r), L_FLOOR, L_CEIL),
  };
}

function falloffParams(chromaFalloff: number): { floorFrac: number; exp: number } {
  const f = clamp(chromaFalloff, 0, 1);
  return { floorFrac: lerp(0.92, 0.12, f), exp: lerp(1.0, 0.55, f) };
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[] {
  const base = hexToOklch(baseHex);
  if (!base) {
    return Array.from({ length: opts.size }, () => ({
      hex: baseHex, oklch: { L: 0, C: 0, H: 0 }, pinned: false, gamutClipped: false,
    }));
  }

  const N              = opts.size;
  const lightnessCurve = opts.lightnessCurve ?? LIGHTNESS_PRESETS.eased;
  const satCurve       = opts.satCurve ?? SAT_PRESETS.flat;
  const gamut          = opts.gamut ?? ('auto' as GamutStrategy);
  const satMult        = opts.satMultiplier ?? 1.0;
  const hueJitter      = opts.hueJitter ?? 0;
  const baseHexLower   = baseHex.toLowerCase();

  const { darkCap, lightCap } = reachToCaps(opts.reach);
  const { floorFrac, exp }    = falloffParams(opts.chromaFalloff);

  const darkBottom = clamp(Math.min(darkCap,  base.L - STEP_DELTA), L_FLOOR, base.L);
  const lightTop   = clamp(Math.max(lightCap, base.L + STEP_DELTA), base.L, L_CEIL);

  let baseIndex: number;
  if (N <= 1) {
    baseIndex = 0;
  } else {
    const span = lightTop - darkBottom;
    const frac = span > 1e-6 ? (base.L - darkBottom) / span : 0.5;
    baseIndex = clamp(Math.round(frac * (N - 1)), 1, N - 2);
  }

  const maxArm = Math.max(baseIndex, N - 1 - baseIndex) || 1;
  const shades: Shade[] = [];

  for (let i = 0; i < N; i++) {
    const pin = opts.pins?.[i];
    if (pin) {
      shades.push({ hex: pin, oklch: hexToOklch(pin) ?? base, pinned: true, gamutClipped: false });
      continue;
    }
    if (i === baseIndex) {
      // Anchor: byte-for-byte the picked color. No curve, falloff, hue shift, or gamut map.
      shades.push({ hex: baseHexLower, oklch: base, pinned: false, gamutClipped: false });
      continue;
    }

    let L: number;
    if (i < baseIndex) {
      // Curve anchored at the far dark end (t=0), reaching base at t=1: small
      // step next to the base, widening toward the extreme.
      const t = i / baseIndex;
      L = darkBottom + (base.L - darkBottom) * evalCurve(lightnessCurve, t, 0, 1);
    } else {
      // Mirror of the dark side: anchored at the far light end so the spacing
      // is symmetric about the base (small step next to base, big step at end).
      const u = (N - 1 - i) / (N - 1 - baseIndex);
      L = lightTop - (lightTop - base.L) * evalCurve(lightnessCurve, u, 0, 1);
    }

    const dist       = Math.abs(i - baseIndex) / maxArm;
    const chromaMult = 1 - (1 - floorFrac) * Math.pow(dist, exp);
    const tGlobal    = N === 1 ? 0.5 : i / (N - 1);
    const C          = base.C * satMult * chromaMult * evalCurve(satCurve, tGlobal, 0, 2);

    let H = base.H;
    if (base.C >= 0.01) {
      const signedDist = (i - baseIndex) / maxArm;
      H = (base.H + signedDist * 15 * opts.hueShiftStrength + signedDist * hueJitter + 360) % 360;
    }

    const ideal: Oklch = { L, C, H };
    const mapped       = gamutMap(ideal, gamut);
    const wasClipped   = mapped.C < ideal.C - 1e-4;
    shades.push({ hex: oklchToHex(mapped), oklch: mapped, pinned: false, gamutClipped: wasClipped });
  }

  const hiddenSet = new Set(opts.hidden ?? []);
  return shades.filter((_, i) => !hiddenSet.has(i));
}
