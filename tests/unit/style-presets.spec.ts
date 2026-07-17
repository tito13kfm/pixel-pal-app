import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STYLE_PRESETS,
  styleToScalars,
  RAMP_STYLES,
  resolveActiveStyle,
  resolveRampScalars,
} from '../../src/lib/style-presets';

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

describe('RAMP_STYLES', () => {
  it('lists all four ramp styles in order', () => {
    expect(RAMP_STYLES).toEqual(['punchy', 'balanced', 'muted', 'custom']);
  });
});

describe('resolveActiveStyle', () => {
  it('returns the override when present', () => {
    expect(resolveActiveStyle({ 2: 'muted' }, 2, 'punchy')).toBe('muted');
  });
  it('falls back to the default when the override is absent', () => {
    expect(resolveActiveStyle({ 2: 'muted' }, 5, 'punchy')).toBe('punchy');
  });
  it('accepts a string-keyed override (post JSON round-trip)', () => {
    const overrides = JSON.parse(JSON.stringify({ 3: 'balanced' }));
    expect(resolveActiveStyle(overrides, 3, 'punchy')).toBe('balanced');
  });
  it('falls back to the default for an empty map', () => {
    expect(resolveActiveStyle({}, 0, 'muted')).toBe('muted');
  });
  it('falls back to the default for a null/undefined map', () => {
    expect(resolveActiveStyle(null, 0, 'muted')).toBe('muted');
    expect(resolveActiveStyle(undefined, 0, 'muted')).toBe('muted');
  });
});

describe('resolveRampScalars', () => {
  it('delegates to styleToScalars for a builtin style', () => {
    expect(
      resolveRampScalars({ style: 'muted', baseIndex: 0, stylePresets: null, rampStyleScalars: null }),
    ).toEqual({ reach: 0.15, chromaFalloff: 0.85 });
  });
  it('returns the ramp-specific scalars for a custom style', () => {
    expect(
      resolveRampScalars({
        style: 'custom',
        baseIndex: 1,
        stylePresets: null,
        rampStyleScalars: { 1: { reach: 0.3, chromaFalloff: 0.7 } },
      }),
    ).toEqual({ reach: 0.3, chromaFalloff: 0.7 });
  });
  it('accepts string-keyed custom scalars (post JSON round-trip)', () => {
    const rampStyleScalars = JSON.parse(JSON.stringify({ 4: { reach: 0.2, chromaFalloff: 0.5 } }));
    expect(
      resolveRampScalars({ style: 'custom', baseIndex: 4, stylePresets: null, rampStyleScalars }),
    ).toEqual({ reach: 0.2, chromaFalloff: 0.5 });
  });
  it('falls back to the balanced preset when custom has no scalars yet', () => {
    expect(
      resolveRampScalars({ style: 'custom', baseIndex: 9, stylePresets: null, rampStyleScalars: {} }),
    ).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
    expect(
      resolveRampScalars({ style: 'custom', baseIndex: 9, stylePresets: null, rampStyleScalars: null }),
    ).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
  });
  it('respects a non-default stylePresets for a builtin style', () => {
    const presets = { muted: { reach: 0.05, chromaFalloff: 0.95 } };
    expect(
      resolveRampScalars({ style: 'muted', baseIndex: 0, stylePresets: presets, rampStyleScalars: null }),
    ).toEqual({ reach: 0.05, chromaFalloff: 0.95 });
  });
});
