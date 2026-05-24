// @ts-nocheck
// Color math extracted verbatim from pixel-pal.tsx.
// Do NOT refactor — the existing test suite verifies these exact implementations.

export const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

export const rgbToHex = (r, g, b) => {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const rgbToHsl = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
};

export const hslToRgb = ({ h, s, l }) => {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl) => { const { r, g, b } = hslToRgb(hsl); return rgbToHex(r, g, b); };

export const rgbToHsv = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s: s * 100, v: v * 100 };
};

export const hsvToRgb = ({ h, s, v }) => {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

export const hexToHsv = (hex) => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv) => { const { r, g, b } = hsvToRgb(hsv); return rgbToHex(r, g, b); };

export const getShadowHueShift = (h) => {
  if (h >= 0 && h < 20) return -8;
  if (h >= 20 && h < 50) return -15;
  if (h >= 50 && h < 80) return -20;
  if (h >= 80 && h < 150) return -12;
  if (h >= 150 && h < 200) return 15;
  if (h >= 200 && h < 250) return 10;
  if (h >= 250 && h < 290) return 12;
  if (h >= 290 && h < 340) return -10;
  return -5;
};

export const getHighlightHueShift = (h) => {
  if (h >= 0 && h < 20) return 12;
  if (h >= 20 && h < 50) return 18;
  if (h >= 50 && h < 70) return 10;
  if (h >= 70 && h < 100) return -15;
  if (h >= 100 && h < 150) return -15;
  if (h >= 150 && h < 200) return -20;
  if (h >= 200 && h < 250) return -10;
  if (h >= 250 && h < 290) return 8;
  if (h >= 290 && h < 340) return 5;
  return 3;
};

export const seededRandom = (seed) => {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
};

export const generateRamp = (baseHex, numColors = 4, seed = 0, style = 'punchy', hueShiftStrength = 1.0) => {
  const base = hexToHsl(baseHex);
  const rand = seededRandom(seed + Math.floor(base.h * 7 + base.s * 3 + base.l * 11));
  const variation = seed === 0 ? 0 : 1;
  const hueJitter = variation * (rand() - 0.5) * 12;
  const satJitter = variation * (rand() - 0.5) * 0.15;
  const shadowDepthJitter = variation * (rand() - 0.5) * 0.1;
  const highlightLiftJitter = variation * (rand() - 0.5) * 0.08;

  const isGrayscale = base.s < 8;
  // hueShiftStrength scales the hue-shift amounts applied to shadows and
  // highlights. 1.0 = current behavior (preserves byte-identity for
  // legacy callers that don't pass the arg). 0.0 = no hue shift, flatter
  // ramps. 2.0 = double the shift, more painterly stylized output.
  // Grayscale bases already get 0 shift; the multiplier on 0 is still 0.
  const shadowShift = (isGrayscale ? 0 : getShadowHueShift(base.h)) * hueShiftStrength;
  const highlightShift = (isGrayscale ? 0 : getHighlightHueShift(base.h)) * hueShiftStrength;
  const outlineSatFloor = isGrayscale ? 0 : 70;

  // Style curves: 'punchy' uses full dynamic range; 'balanced' is moderate; 'muted' is compressed.
  // Each curve defines: floor caps (min lightness), ceiling caps (max lightness),
  // lift fractions (how far toward white the highlight reaches), and shadow drop fractions.
  const c = style === 'balanced'
    ? {
        outlineFloor: 10,  outlineDrop: 0.32,
        deepShadowFloor: 18, deepShadowDrop: 0.50,
        shadowFloor: 26, shadowDrop: 0.72,
        midShadowFloor: 32, midShadowDrop: 0.85,
        midHighlightCeil: 78, midHighlightLift: 0.18,
        highlightCeil: 85, highlightLift: 0.38,
        brightCeil: 92, brightLift: 0.62,
        satBoost: 1.05,
      }
    : style === 'muted'
    ? {
        outlineFloor: 28, outlineDrop: 0.55,
        deepShadowFloor: 34, deepShadowDrop: 0.68,
        shadowFloor: 40, shadowDrop: 0.80,
        midShadowFloor: 44, midShadowDrop: 0.90,
        midHighlightCeil: 70, midHighlightLift: 0.12,
        highlightCeil: 78, highlightLift: 0.22,
        brightCeil: 85, brightLift: 0.40,
        satBoost: 0.85,
      }
    : {
        outlineFloor: 2,  outlineDrop: 0.18,
        deepShadowFloor: 10, deepShadowDrop: 0.38,
        shadowFloor: 20, shadowDrop: 0.62,
        midShadowFloor: 28, midShadowDrop: 0.80,
        midHighlightCeil: 90, midHighlightLift: 0.35,
        highlightCeil: 95, highlightLift: 0.62,
        brightCeil: 98, brightLift: 0.88,
        satBoost: 1.15,
      };

  // Scale shadow floors when the base is darker than the nominal L=50.
  // Without this, a base at L=14 would have shadows clamped to fixed floors like
  // L=20 or L=28, which end up brighter than the base itself and break the ramp.
  const floorScale = Math.min(1, base.l / 50);
  const outline = {
    h: base.h + (shadowShift * 0.5) + hueJitter * 0.3,
    s: Math.min(100, Math.max(outlineSatFloor, base.s * (0.95 + satJitter))),
    l: Math.max(c.outlineFloor * floorScale, base.l * (c.outlineDrop + shadowDepthJitter * 0.5))
  };
  const deepShadow = {
    h: base.h + shadowShift * 1.2 + hueJitter,
    s: Math.min(100, base.s * (c.satBoost + satJitter)),
    l: Math.max(c.deepShadowFloor * floorScale, base.l * (c.deepShadowDrop + shadowDepthJitter))
  };
  const shadow = {
    h: base.h + shadowShift + hueJitter,
    s: Math.min(100, base.s * (c.satBoost * 0.95 + satJitter)),
    l: Math.max(c.shadowFloor * floorScale, base.l * (c.shadowDrop + shadowDepthJitter))
  };
  const midShadow = {
    h: base.h + (shadowShift + hueJitter) * 0.5,
    s: Math.min(100, base.s * (1.05 + satJitter * 0.5)),
    l: Math.max(c.midShadowFloor * floorScale, base.l * (c.midShadowDrop + shadowDepthJitter * 0.5))
  };
  const baseColor = { ...base };
  const midHighlight = {
    h: base.h + (highlightShift + hueJitter) * 0.5,
    s: Math.min(100, base.s * (1.08 + satJitter * 0.5)),
    l: Math.min(c.midHighlightCeil, base.l + (100 - base.l) * (c.midHighlightLift + highlightLiftJitter * 0.5))
  };
  const highlight = {
    h: base.h + highlightShift + hueJitter,
    s: Math.min(100, base.s * (c.satBoost + satJitter)),
    l: Math.min(c.highlightCeil, base.l + (100 - base.l) * (c.highlightLift + highlightLiftJitter))
  };
  const brightHighlight = {
    h: base.h + (highlightShift + hueJitter) * 1.2,
    s: Math.min(100, base.s * (0.85 + satJitter * 0.5)),
    l: Math.min(c.brightCeil, base.l + (100 - base.l) * (c.brightLift + highlightLiftJitter))
  };

  // Defense-in-depth: sort the assembled ramp by lightness so labels always line up
  // with the actual progression, even if extreme edge cases produce out-of-order values.
  const sortByLightness = (hexArr) => {
    return hexArr
      .map(hex => ({ hex, l: hexToHsl(hex).l }))
      .sort((a, b) => a.l - b.l)
      .map(({ hex }) => hex);
  };

  if (numColors === 4) return sortByLightness([hslToHex(outline), hslToHex(shadow), hslToHex(baseColor), hslToHex(highlight)]);
  if (numColors === 5) return sortByLightness([hslToHex(outline), hslToHex(shadow), hslToHex(baseColor), hslToHex(highlight), hslToHex(brightHighlight)]);
  if (numColors === 6) return sortByLightness([hslToHex(outline), hslToHex(deepShadow), hslToHex(shadow), hslToHex(baseColor), hslToHex(highlight), hslToHex(brightHighlight)]);
  if (numColors === 7) return sortByLightness([hslToHex(outline), hslToHex(deepShadow), hslToHex(shadow), hslToHex(baseColor), hslToHex(midHighlight), hslToHex(highlight), hslToHex(brightHighlight)]);
  return sortByLightness([hslToHex(outline), hslToHex(deepShadow), hslToHex(shadow), hslToHex(midShadow), hslToHex(baseColor), hslToHex(midHighlight), hslToHex(highlight), hslToHex(brightHighlight)]);
};

export const shadeLabelsFor = (n) => {
  if (n === 4) return ['outline', 'shadow', 'base', 'highlight'];
  if (n === 5) return ['outline', 'shadow', 'base', 'highlight', 'bright'];
  if (n === 6) return ['outline', 'deep shadow', 'shadow', 'base', 'highlight', 'bright'];
  if (n === 7) return ['outline', 'deep shadow', 'shadow', 'base', 'mid highlight', 'highlight', 'bright'];
  return ['outline', 'deep shadow', 'shadow', 'mid shadow', 'base', 'mid highlight', 'highlight', 'bright'];
};
