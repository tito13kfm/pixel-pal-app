// Perceptual ramp engine.
// Public surface: generateRamp(baseHex, opts) → Shade[]
// Legacy HSV renderer kept here for one-shot palette migration.

import { hexToOklch, oklchToHex, gamutMap } from './oklch';
import type { Oklch, GamutStrategy } from './oklch';

export { generateRamp as _legacyHsvRamp } from './color';

export type Style = 'punchy' | 'balanced' | 'muted';
export type CurvePreset = 'linear' | 'eased' | 's-curve' | 'ease-in' | 'ease-out';

export interface GenerateRampOpts {
  style: Style;
  size: number;
  hueShiftStrength: number;
  satMultiplier?: number;
  curve?: CurvePreset;
  gamut?: GamutStrategy;
  pins?: Record<number, string>;
  hidden?: number[];
  hardwareLock?: string | null;
}

export interface Shade {
  hex: string;
  oklch: Oklch;
  pinned: boolean;
  gamutClipped: boolean;
}

const STYLE_CONFIG: Record<Style, { lMin: number; lMax: number; cMult: number; defaultCurve: CurvePreset }> = {
  punchy:   { lMin: 0.18, lMax: 0.92, cMult: 1.00, defaultCurve: 'linear' },
  balanced: { lMin: 0.25, lMax: 0.85, cMult: 0.80, defaultCurve: 'eased' },
  muted:    { lMin: 0.32, lMax: 0.78, cMult: 0.55, defaultCurve: 'eased' },
};

const L_FLOOR = 0.04;
const L_CEIL = 0.96;

function curveSample(curve: CurvePreset, t: number): number {
  switch (curve) {
    case 'linear':    return t;
    case 'eased':     return t * t * (3 - 2 * t);
    case 's-curve':   return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'ease-in':   return t * t;
    case 'ease-out':  return 1 - (1 - t) * (1 - t);
  }
}

function perSlotHueShift(slotIdx: number, totalSlots: number, baseH: number, strength: number, baseC: number): number {
  if (baseC < 0.01) return baseH;
  const mid = (totalSlots - 1) / 2;
  const dist = mid === 0 ? 0 : (slotIdx - mid) / mid;
  const delta = dist * 15 * strength;
  return (baseH + delta + 360) % 360;
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[] {
  const baseOklch = hexToOklch(baseHex);
  if (!baseOklch) {
    return Array.from({ length: opts.size }, () => ({
      hex: baseHex,
      oklch: { L: 0, C: 0, H: 0 },
      pinned: false,
      gamutClipped: false,
    }));
  }

  const cfg = STYLE_CONFIG[opts.style];
  const curve = opts.curve ?? cfg.defaultCurve;
  const gamut: GamutStrategy = opts.gamut ?? 'auto';
  const satMult = opts.satMultiplier ?? 1.0;

  const lMin = Math.max(L_FLOOR, cfg.lMin);
  const lMax = Math.min(L_CEIL, cfg.lMax);
  const cTarget = baseOklch.C * cfg.cMult * satMult;

  const shades: Shade[] = [];

  for (let i = 0; i < opts.size; i++) {
    const t = opts.size === 1 ? 0.5 : i / (opts.size - 1);
    const tc = curveSample(curve, t);
    const L = lMin + (lMax - lMin) * tc;
    const H = perSlotHueShift(i, opts.size, baseOklch.H, opts.hueShiftStrength, baseOklch.C);

    const ideal: Oklch = { L, C: cTarget, H };
    const mapped = gamutMap(ideal, gamut);
    const wasClipped = mapped.C < ideal.C - 1e-4;

    const pin = opts.pins?.[i];
    if (pin) {
      shades.push({ hex: pin, oklch: ideal, pinned: true, gamutClipped: false });
    } else {
      shades.push({ hex: oklchToHex(mapped), oklch: mapped, pinned: false, gamutClipped: wasClipped });
    }
  }

  const hiddenSet = new Set(opts.hidden ?? []);
  return shades.filter((_, i) => !hiddenSet.has(i));
}
