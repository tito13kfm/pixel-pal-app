import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE_PRESETS, styleToScalars } from '../../src/lib/style-presets';

describe('DEFAULT_STYLE_PRESETS', () => {
  it('holds the approved punchy/balanced/muted scalars', () => {
    expect(DEFAULT_STYLE_PRESETS.punchy).toEqual({ reach: 0.9, chromaFalloff: 0.15 });
    expect(DEFAULT_STYLE_PRESETS.balanced).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
    expect(DEFAULT_STYLE_PRESETS.muted).toEqual({ reach: 0.15, chromaFalloff: 0.85 });
  });
});

describe('styleToScalars', () => {
  it('returns default scalars when no override map is given', () => {
    expect(styleToScalars('balanced', null)).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
  });
  it('prefers the override map when present', () => {
    const presets = { balanced: { reach: 0.4, chromaFalloff: 0.6 } };
    expect(styleToScalars('balanced', presets)).toEqual({ reach: 0.4, chromaFalloff: 0.6 });
  });
  it('falls back to punchy for an unknown style', () => {
    expect(styleToScalars('nonsense', null)).toEqual({ reach: 0.9, chromaFalloff: 0.15 });
  });
  it('falls back to defaults when override map exists but lacks the key', () => {
    const presets = { muted: { reach: 0.1, chromaFalloff: 0.9 } };
    expect(styleToScalars('balanced', presets)).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
  });
});
