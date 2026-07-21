// Regression coverage: reExtractFromImage (the color-count slider re-run)
// was missing three guards that handleImageUpload (the initial upload) had:
// no reset of a stale error message, no empty-extraction guard, no
// img.onerror handler (a decode failure left imageLoading stuck true
// forever, spinner never clears).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageExtractHandlers } from '../../src/hooks/useImageExtractHandlers';
import { useRampsStore } from '../../src/store/rampsStore';
import * as imageExtract from '../../src/lib/image-extract';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 10;
  height = 10;
  private _src = '';
  get src() { return this._src; }
  set src(v: string) {
    this._src = v;
    queueMicrotask(() => {
      if (v === 'BAD_IMAGE') this.onerror?.();
      else this.onload?.();
    });
  }
}

function resetStore() {
  useRampsStore.setState({
    baseColors: ['#ff0000'],
    aiColorNames: [],
    rampSize: 6,
    shuffleSeed: 0,
    overrides: {},
    harmonyAnchor: 0,
    rampSizeOverrides: {},
    rampSatOverrides: {},
    hueShiftStrengthPerRamp: {},
    hiddenShades: {},
    rampShuffleOffsets: {},
    hardwareLock: null,
    hueShiftStrength: 1.0,
    lockedRamps: new Set(),
    collapsedRamps: new Set(),
    lightnessCurvePerRamp: {},
    satCurvePerRamp: {},
    rampStyleOverrides: {},
    rampStyleScalars: {},
    editingIndex: null,
    editorHsv: { h: 0, s: 0, v: 0 },
    pinEditor: null,
    compareMode: false,
    compareAnchor: null,
    compareResult: null,
  });
}

function setupHook(imageDataUrl: string | null) {
  const setImageLoading = vi.fn();
  const setImageError = vi.fn();
  const hook = renderHook(() => useImageExtractHandlers({
    mode: 'image',
    imageDataUrl,
    setImageDataUrl: vi.fn(),
    imageColorCount: 4,
    setImageLoading,
    setImageError,
    setIsDragging: vi.fn(),
    eyedropperActive: false,
    setImageZoom: vi.fn(),
    setImageNaturalSize: vi.fn(),
    setHoveredColor: vi.fn(),
    tagNextLabel: vi.fn(),
    resetPaletteState: vi.fn(),
    bumpShuffleSeed: vi.fn(),
  }));
  return { hook, setImageLoading, setImageError };
}

describe('reExtractFromImage matches handleImageUpload guards', () => {
  const realImage = global.Image;
  const realGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    resetStore();
    // @ts-expect-error test stub
    global.Image = FakeImage;
    // @ts-expect-error test stub
    HTMLCanvasElement.prototype.getContext = () => ({
      imageSmoothingEnabled: false,
      drawImage: () => {},
      getImageData: () => ({}) as ImageData,
    });
  });

  afterEach(() => {
    global.Image = realImage;
    HTMLCanvasElement.prototype.getContext = realGetContext;
    vi.restoreAllMocks();
  });

  it('clears a stale error message and reports "No colors found" instead of silently emptying the palette', async () => {
    vi.spyOn(imageExtract, 'extractDominantColors').mockReturnValue([]);
    const { hook, setImageError } = setupHook('GOOD_IMAGE');
    await act(async () => {
      hook.result.current.reExtractFromImage();
      await Promise.resolve();
    });
    expect(setImageError).toHaveBeenCalledWith('');
    expect(setImageError).toHaveBeenCalledWith('No colors found');
    expect(useRampsStore.getState().baseColors).toEqual(['#ff0000']);
  });

  it('clears imageLoading and reports an error when the image fails to decode, instead of hanging forever', async () => {
    const { hook, setImageLoading, setImageError } = setupHook('BAD_IMAGE');
    await act(async () => {
      hook.result.current.reExtractFromImage();
      await Promise.resolve();
    });
    expect(setImageError).toHaveBeenCalledWith('Failed to load');
    expect(setImageLoading).toHaveBeenLastCalledWith(false);
  });
});
