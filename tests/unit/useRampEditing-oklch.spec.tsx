// updateEditorOklch / updateEditorMode hook-level coverage (#129).
//
// The RampsPanel specs cover the presentational side (which sliders render,
// which callbacks fire); these tests pin the two behaviors that live in
// useRampEditing itself:
//   1. updateEditorOklch gamut-maps ('auto') before writing hex to
//      baseColors, while editorOklch keeps the raw slider value (the
//      documented slider/swatch divergence for out-of-gamut edits).
//   2. updateEditorMode re-seeds the representation being switched TO from
//      the current base hex, so neither cache drifts from the other.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRampEditing } from '../../src/hooks/useRampEditing';
import { useRampsStore } from '../../src/store/rampsStore';
import { hexToOklch, oklchToHex } from '../../src/lib/oklch';
import { hexToHsv } from '../../src/lib/color';

// C 0.37 at L 0.5 is far outside sRGB for any hue; 'auto' must shrink C.
const OUT_OF_GAMUT = { L: 0.5, C: 0.37, H: 145 };

function resetStore() {
  useRampsStore.setState({
    baseColors: ['#ff0000', '#00ff00', '#0000ff'],
    aiColorNames: ['red', 'green', 'blue'],
    editingIndex: 1,
    editorHsv: { h: 0, s: 0, v: 0 },
    editorOklch: { L: 0, C: 0, H: 0 },
    editorMode: 'hsv',
    pinEditor: null,
    compareMode: false,
    compareAnchor: null,
    compareResult: null,
  });
}

function setupHook() {
  return renderHook(() => useRampEditing({
    tagNextLabel: vi.fn(),
    setExportFeedback: vi.fn(),
    setGamutPerRamp: vi.fn(),
  }));
}

describe('updateEditorOklch', () => {
  beforeEach(resetStore);

  it('writes an in-gamut value straight through to baseColors as hex', () => {
    const hook = setupHook();
    const inGamut = hexToOklch('#4488cc')!;
    act(() => { hook.result.current.updateEditorOklch(inGamut); });

    const s = useRampsStore.getState();
    expect(s.baseColors[1]).toBe('#4488cc');
    expect(s.editorOklch).toEqual(inGamut);
    // Untouched ramps stay untouched.
    expect(s.baseColors[0]).toBe('#ff0000');
    expect(s.baseColors[2]).toBe('#0000ff');
  });

  it('gamut-maps an out-of-sRGB value before committing: chroma shrinks, L and H hold', () => {
    const hook = setupHook();
    act(() => { hook.result.current.updateEditorOklch(OUT_OF_GAMUT); });

    const s = useRampsStore.getState();
    expect(s.baseColors[1]).toMatch(/^#[0-9a-f]{6}$/);
    // Without gamut mapping, oklchToHex would per-channel clamp to a
    // different (hue-distorted) color; the committed hex must match the
    // chroma-reduced mapping instead.
    expect(s.baseColors[1]).not.toBe(oklchToHex(OUT_OF_GAMUT));
    const committed = hexToOklch(s.baseColors[1])!;
    expect(committed.C).toBeLessThan(OUT_OF_GAMUT.C);
    expect(committed.L).toBeCloseTo(OUT_OF_GAMUT.L, 1);
    expect(Math.abs(committed.H - OUT_OF_GAMUT.H)).toBeLessThan(2);
  });

  it('keeps the raw (unmapped) value in editorOklch so the drag stays continuous', () => {
    const hook = setupHook();
    act(() => { hook.result.current.updateEditorOklch(OUT_OF_GAMUT); });
    expect(useRampsStore.getState().editorOklch).toEqual(OUT_OF_GAMUT);
  });

  it('with no editor open, updates only the editorOklch cache', () => {
    useRampsStore.setState({ editingIndex: null });
    const hook = setupHook();
    act(() => { hook.result.current.updateEditorOklch({ L: 0.6, C: 0.1, H: 30 }); });

    const s = useRampsStore.getState();
    expect(s.editorOklch).toEqual({ L: 0.6, C: 0.1, H: 30 });
    expect(s.baseColors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });
});

describe('updateEditorMode', () => {
  beforeEach(resetStore);

  it('switching to oklch re-seeds editorOklch from the current base hex', () => {
    const hook = setupHook();
    act(() => { hook.result.current.updateEditorMode('oklch'); });

    const s = useRampsStore.getState();
    expect(s.editorMode).toBe('oklch');
    expect(s.editorOklch).toEqual(hexToOklch('#00ff00'));
    // The representation being switched AWAY from is left alone.
    expect(s.editorHsv).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('switching back to hsv re-seeds editorHsv from the current base hex', () => {
    useRampsStore.setState({ editorMode: 'oklch' });
    const hook = setupHook();
    act(() => { hook.result.current.updateEditorMode('hsv'); });

    const s = useRampsStore.getState();
    expect(s.editorMode).toBe('hsv');
    expect(s.editorHsv).toEqual(hexToHsv('#00ff00'));
    expect(s.editorOklch).toEqual({ L: 0, C: 0, H: 0 });
  });

  it('with no editor open, switches the mode without touching either cache', () => {
    useRampsStore.setState({ editingIndex: null });
    const hook = setupHook();
    act(() => { hook.result.current.updateEditorMode('oklch'); });

    const s = useRampsStore.getState();
    expect(s.editorMode).toBe('oklch');
    expect(s.editorHsv).toEqual({ h: 0, s: 0, v: 0 });
    expect(s.editorOklch).toEqual({ L: 0, C: 0, H: 0 });
  });
});
