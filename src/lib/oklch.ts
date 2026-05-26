// OKLab/OKLCH color space utilities.
// Spec: https://bottosson.github.io/posts/oklab/ and CSS Color 4.

export type Oklch = { L: number; C: number; H: number };
export type Oklab = { L: number; a: number; b: number };
export type LinearRgb = { r: number; g: number; b: number };

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToLinearRgb(hex: string): LinearRgb | null {
  if (!HEX_RE.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b) };
}

export function linearRgbToHex(rgb: LinearRgb): string {
  const to255 = (c: number) => Math.max(0, Math.min(255, Math.round(linearToSrgb(c) * 255)));
  const r = to255(rgb.r);
  const g = to255(rgb.g);
  const b = to255(rgb.b);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function linearRgbToOklab(rgb: LinearRgb): Oklab {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  const lp = Math.cbrt(l);
  const mp = Math.cbrt(m);
  const sp = Math.cbrt(s);

  return {
    L: 0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp,
    a: 1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp,
    b: 0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp,
  };
}

export function oklabToLinearRgb(lab: Oklab): LinearRgb {
  const lp = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mp = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sp = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;

  const l = lp * lp * lp;
  const m = mp * mp * mp;
  const s = sp * sp * sp;

  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const H = C < 1e-6 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, H };
}

export function oklchToOklab(c: Oklch): Oklab {
  const rad = (c.H * Math.PI) / 180;
  return { L: c.L, a: c.C * Math.cos(rad), b: c.C * Math.sin(rad) };
}

export function hexToOklch(hex: string): Oklch | null {
  const lin = hexToLinearRgb(hex);
  if (!lin) return null;
  return oklabToOklch(linearRgbToOklab(lin));
}

export function oklchToHex(c: Oklch): string {
  return linearRgbToHex(oklabToLinearRgb(oklchToOklab(c)));
}
