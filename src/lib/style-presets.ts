export interface StyleScalars {
  reach: number;
  chromaFalloff: number;
}

export type StylePresets = Record<string, StyleScalars>;

// Defaults reproduce the approved Punchy/Balanced/Muted look.
export const DEFAULT_STYLE_PRESETS: StylePresets = {
  punchy:   { reach: 0.9,   chromaFalloff: 0.15 },
  balanced: { reach: 0.575, chromaFalloff: 0.475 },
  muted:    { reach: 0.15,  chromaFalloff: 0.85 },
};

export const styleToScalars = (style: string, presets: StylePresets | null): StyleScalars => {
  const p = (presets && presets[style]) || DEFAULT_STYLE_PRESETS[style] || DEFAULT_STYLE_PRESETS.punchy;
  return { reach: p.reach, chromaFalloff: p.chromaFalloff };
};

export type RampStyle = 'punchy' | 'balanced' | 'muted' | 'custom';

export const RAMP_STYLES: RampStyle[] = ['punchy', 'balanced', 'muted', 'custom'];

/** Resolve a ramp's active style: its override, else the palette default. */
export const resolveActiveStyle = (
  overrides: Record<number, RampStyle> | null | undefined,
  baseIndex: number,
  defaultStyle: RampStyle,
): RampStyle => {
  const o = overrides && (overrides[baseIndex] ?? overrides[String(baseIndex) as any]);
  return o ?? defaultStyle;
};

/** Resolve the {reach, chromaFalloff} a ramp renders at, honoring 'custom'. */
export const resolveRampScalars = (args: {
  style: RampStyle;
  baseIndex: number;
  stylePresets: StylePresets | null;
  rampStyleScalars: Record<number, StyleScalars> | null | undefined;
}): StyleScalars => {
  const { style, baseIndex, stylePresets, rampStyleScalars } = args;
  if (style === 'custom') {
    const s = rampStyleScalars && (rampStyleScalars[baseIndex] ?? rampStyleScalars[String(baseIndex) as any]);
    if (s && typeof s.reach === 'number' && typeof s.chromaFalloff === 'number') {
      return { reach: s.reach, chromaFalloff: s.chromaFalloff };
    }
    // No custom scalars yet → fall back to the balanced preset scalars.
    return styleToScalars('balanced', stylePresets);
  }
  return styleToScalars(style, stylePresets);
};
