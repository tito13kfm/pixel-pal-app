import { hexToHsl, hslToHex } from './color';

export interface HarmonySet {
  complementary: string;
  analogous1: string; analogous2: string;
  triadic1: string; triadic2: string;
  splitComp1: string; splitComp2: string;
  tetradic1: string; tetradic2: string; tetradic3: string;
  square1: string; square2: string; square3: string;
}

type Hsl = { h: number; s: number; l: number };

export const generateHarmony = (baseHexes: string[]): HarmonySet => {
  let anchor = baseHexes[0], maxSat = 0;
  for (const hex of baseHexes) {
    const hsl = hexToHsl(hex) as Hsl;
    if (hsl.s > maxSat) { maxSat = hsl.s; anchor = hex; }
  }
  const base = hexToHsl(anchor) as Hsl;
  const tone = (hsl: Hsl) => ({
    h: hsl.h,
    s: Math.min(95, Math.max(55, hsl.s)),
    l: Math.min(70, Math.max(40, hsl.l)),
  });
  return {
    complementary: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    analogous1: hslToHex(tone({ h: base.h + 30, s: base.s, l: base.l })),
    analogous2: hslToHex(tone({ h: base.h - 30, s: base.s, l: base.l })),
    triadic1: hslToHex(tone({ h: base.h + 120, s: base.s, l: base.l })),
    triadic2: hslToHex(tone({ h: base.h + 240, s: base.s, l: base.l })),
    splitComp1: hslToHex(tone({ h: base.h + 150, s: base.s, l: base.l })),
    splitComp2: hslToHex(tone({ h: base.h + 210, s: base.s, l: base.l })),
    // Tetradic: rectangle on the wheel, two complementary pairs at 60° + 180° + 240°
    tetradic1: hslToHex(tone({ h: base.h + 60, s: base.s, l: base.l })),
    tetradic2: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    tetradic3: hslToHex(tone({ h: base.h + 240, s: base.s, l: base.l })),
    // Square: even 90° spacing
    square1: hslToHex(tone({ h: base.h + 90, s: base.s, l: base.l })),
    square2: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    square3: hslToHex(tone({ h: base.h + 270, s: base.s, l: base.l })),
  };
};
