import { describe, it, expect } from 'vitest';
import { buildRamp } from '../../src/lib/ramp-pipeline';

// Guards buildRamp's 'custom' style resolution (#69 Task 2): a ramp with
// rampStyleScalars set for its index must render using those scalars, not
// the named-preset scalars for whatever style string happens to be passed.

describe('buildRamp custom-scalar resolution', () => {
  const snap = {
    baseColors: ['#37cd76', '#1a2f6b'],
    rampSize: 7,
  };

  it("'custom' with rampStyleScalars[i] set produces the same output as those scalars run through the engine directly", () => {
    const scalars = { reach: 0.33, chromaFalloff: 0.66 };
    const viaRampStyleScalars = buildRamp(
      { ...snap, rampStyleScalars: { 0: scalars } },
      'custom',
      0,
    );
    // Sanity-check the exact scalars by feeding them through a named style
    // slot instead ('punchy' here is just a carrier: its own preset is
    // overridden to the same {reach, chromaFalloff}).
    const viaNamedCarrier = buildRamp(
      { ...snap, stylePresets: { punchy: scalars } as any },
      'punchy',
      0,
    );
    expect(viaRampStyleScalars).toEqual(viaNamedCarrier);
  });

  it("'custom' scalars differ from the punchy default (distinctive scalars produce a different ramp)", () => {
    const punchy = buildRamp(snap, 'punchy', 0);
    const custom = buildRamp(
      { ...snap, rampStyleScalars: { 0: { reach: 0.33, chromaFalloff: 0.66 } } },
      'custom',
      0,
    );
    expect(custom).not.toEqual(punchy);
  });

  it("'custom' with no rampStyleScalars for that index falls back to the balanced preset scalars", () => {
    const custom = buildRamp(snap, 'custom', 0);
    const balanced = buildRamp(snap, 'balanced', 0);
    expect(custom).toEqual(balanced);
  });

  it('only the addressed index uses its custom scalars; other indices are unaffected', () => {
    const scalars = { reach: 0.2, chromaFalloff: 0.9 };
    const withCustom = buildRamp(
      { ...snap, rampStyleScalars: { 0: scalars } },
      'punchy',
      1,
    );
    const plain = buildRamp(snap, 'punchy', 1);
    expect(withCustom).toEqual(plain);
  });
});
