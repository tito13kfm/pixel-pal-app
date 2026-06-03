import { describe, it, expect } from 'vitest';
import {
  remapImageToPalette, computeRemapScaleOptions, estimateRemapCost,
} from '../../src/lib/image-remap';

describe('computeRemapScaleOptions', () => {
  it('keeps all scales within the cap', () => {
    expect(computeRemapScaleOptions(100, 100, 8192)).toEqual([0.25, 0.5, 1, 2, 4, 8]);
  });
  it('drops scales that exceed the cap', () => {
    expect(computeRemapScaleOptions(2000, 2000, 8192)).toEqual([0.25, 0.5, 1, 2, 4]);
  });
  it('drops scales that round below 1px', () => {
    expect(computeRemapScaleOptions(2, 2, 8192)).toEqual([0.5, 1, 2, 4, 8]);
  });
});

describe('estimateRemapCost', () => {
  it('models no-dither as uniqueCap*palette + pixels', () => {
    expect(estimateRemapCost(10, 10, 5, 'none')).toBe(600);
  });
  it('models floyd-steinberg as pixels*palette', () => {
    expect(estimateRemapCost(10, 10, 5, 'floyd-steinberg')).toBe(500);
  });
  it('is zero when the palette is empty', () => {
    expect(estimateRemapCost(10, 10, 0, 'none')).toBe(0);
  });
});

describe('remapImageToPalette', () => {
  it('returns an empty result for a degenerate image', () => {
    const out = remapImageToPalette({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, ['#ff0000'], {});
    expect(out).toEqual({ width: 0, height: 0, data: new Uint8ClampedArray(0) });
  });
  it('passes pixels through unchanged when the palette is empty', () => {
    const src = new Uint8ClampedArray([12, 34, 56, 255]);
    const out = remapImageToPalette({ width: 1, height: 1, data: src }, [], {});
    expect(Array.from(out.data)).toEqual([12, 34, 56, 255]);
  });
  it('maps a pixel to the single palette color (no dither)', () => {
    const src = new Uint8ClampedArray([10, 10, 10, 255]);
    const out = remapImageToPalette({ width: 1, height: 1, data: src }, ['#ff0000'], { dither: 'none' });
    expect(out.width).toBe(1);
    expect(Array.from(out.data.slice(0, 3))).toEqual([255, 0, 0]);
  });
  it('error diffusion flips pixel 1 below-midpoint (diverges from no-dither)', () => {
    const src = new Uint8ClampedArray([245,245,245,255, 128,128,128,255, 128,128,128,255]);
    const palette = ['#ffffff', '#000000'];
    const fs = remapImageToPalette({ width: 3, height: 1, data: src }, palette, { dither: 'floyd-steinberg' });
    const nd = remapImageToPalette({ width: 3, height: 1, data: src }, palette, { dither: 'none' });
    expect(Array.from(fs.data)).toEqual([255,255,255,255, 0,0,0,255, 255,255,255,255]);
    expect(Array.from(nd.data)).toEqual([255,255,255,255, 255,255,255,255, 255,255,255,255]);
  });
  it('alpha=0 pixel is zeroed and does not absorb diffused error', () => {
    const src = new Uint8ClampedArray([255,0,0,255, 255,0,0,0, 0,0,255,255]);
    const palette = ['#ff0000', '#0000ff'];
    const out = remapImageToPalette({ width: 3, height: 1, data: src }, palette, { dither: 'floyd-steinberg' });
    expect(Array.from(out.data)).toEqual([255,0,0,255, 0,0,0,0, 0,0,255,255]);
  });
});
