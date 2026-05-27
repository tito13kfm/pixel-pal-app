import { hexToOklch, oklchToHex, gamutMap } from './oklch';
import type { Oklch, GamutStrategy } from './oklch';
import { evalCurve, LIGHTNESS_PRESETS, SAT_PRESETS } from './curve';
import type { CurvePoints } from './curve';

export type Style = 'punchy' | 'balanced' | 'muted';

export interface GenerateRampOpts {
  style: Style;
  size: number;
  hueShiftStrength: number;
  satMultiplier?: number;
  lightnessCurve?: CurvePoints;
  satCurve?: CurvePoints;
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

const STYLE_CONFIG: Record<Style, {
  lMin: number;
  lMax: number;
  cMult: number;
  defaultLightnessCurve: CurvePoints;
}> = {
  punchy:   { lMin: 0.18, lMax: 0.92, cMult: 1.00, defaultLightnessCurve: LIGHTNESS_PRESETS.linear },
  balanced: { lMin: 0.25, lMax: 0.85, cMult: 0.80, defaultLightnessCurve: LIGHTNESS_PRESETS.eased },
  muted:    { lMin: 0.32, lMax: 0.78, cMult: 0.55, defaultLightnessCurve: LIGHTNESS_PRESETS.eased },
};

const L_FLOOR = 0.04;
const L_CEIL  = 0.96;

function perSlotHueShift(slotIdx: number, totalSlots: number, baseH: number, strength: number, baseC: number): number {
  if (baseC < 0.01) return baseH;
  const mid = (totalSlots - 1) / 2;
  const dist = mid === 0 ? 0 : (slotIdx - mid) / mid;
  return (baseH + dist * 15 * strength + 360) % 360;
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[] {
  const baseOklch = hexToOklch(baseHex);
  if (!baseOklch) {
    return Array.from({ length: opts.size }, () => ({
      hex: baseHex, oklch: { L: 0, C: 0, H: 0 }, pinned: false, gamutClipped: false,
    }));
  }

  const cfg            = STYLE_CONFIG[opts.style];
  const lightnessCurve = opts.lightnessCurve ?? cfg.defaultLightnessCurve;
  const satCurve       = opts.satCurve ?? SAT_PRESETS.flat;
  const gamut          = opts.gamut ?? 'auto' as GamutStrategy;
  const satMult        = opts.satMultiplier ?? 1.0;
  const lMin           = Math.max(L_FLOOR, cfg.lMin);
  const lMax           = Math.min(L_CEIL,  cfg.lMax);

  const shades: Shade[] = [];

  for (let i = 0; i < opts.size; i++) {
    const t   = opts.size === 1 ? 0.5 : i / (opts.size - 1);
    const L   = lMin + (lMax - lMin) * evalCurve(lightnessCurve, t, 0, 1);
    const C   = baseOklch.C * cfg.cMult * satMult * evalCurve(satCurve, t, 0, 2);
    const H   = perSlotHueShift(i, opts.size, baseOklch.H, opts.hueShiftStrength, baseOklch.C);

    const ideal: Oklch = { L, C, H };
    const mapped       = gamutMap(ideal, gamut);
    const wasClipped   = mapped.C < ideal.C - 1e-4;

    const pin = opts.pins?.[i];
    shades.push(pin
      ? { hex: pin,              oklch: ideal,  pinned: true,  gamutClipped: false }
      : { hex: oklchToHex(mapped), oklch: mapped, pinned: false, gamutClipped: wasClipped },
    );
  }

  const hiddenSet = new Set(opts.hidden ?? []);
  return shades.filter((_, i) => !hiddenSet.has(i));
}
