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
