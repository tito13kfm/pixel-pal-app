// Stateful wrapper owning the Image Preview remap pipeline (#113).
//
// Extracted from App.tsx. Owns no palette state itself: reads/writes through
// the params passed in, which App.tsx sources from useImageRemap() (the remap
// panel state) plus the ramp-core values the active-palette derivation needs
// (baseColors, rampsActive, and the bound ramp helpers, same binding pattern
// as useExport). The only state owned here is the
// two-click download confirmation's auto-disarm timer handle, which is only
// touched by the download handler.
//
// This hook also restores the debounced auto-refresh effect that recomputes
// the preview whenever the active palette, dither mode, or upload changes.
// That effect was lost in the Tier-C VizComparePanel extraction (bc00c18):
// the canvas-draw effect moved into the panel, but the effect that actually
// CALLED refreshRemap() was dropped, so the preview stayed on "Remapping..."
// forever. See PR for #113 slice 1.
import { useEffect, useRef } from 'react';
import type { RemapImage, RemapOptions } from '../lib/image-remap';
import { computeRemapScaleOptions, estimateRemapCost } from '../lib/image-remap';
import { requestRemap } from '../lib/remap-worker-client';
import { saveFile } from '../lib/save-file';

type RemapDither = NonNullable<RemapOptions['dither']>;
type RemapNaturalSize = { w: number; h: number };

interface UseImageRemapComputeParams {
  // Ramp-core inputs for the active-palette derivation. resolveBaseForRamp /
  // filterHidden are the bound wrappers App.tsx builds over lib/ramp-helpers
  // (rampSatOverrides / hiddenShades pre-applied), same as useExport receives.
  baseColors: string[];
  rampsActive: string[][];
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };

  // useImageRemap() state (App.tsx destructures the hook and passes through).
  remapImageDataUrl: string | null;
  setRemapImageDataUrl: (v: string | null) => void;
  remapImageNaturalSize: RemapNaturalSize | null;
  setRemapImageNaturalSize: (v: RemapNaturalSize | null) => void;
  setRemapOutput: (v: RemapImage | null) => void;
  setRemapOutputSignature: (v: string | null) => void;
  remapDither: RemapDither;
  setRemapLoading: (v: boolean) => void;
  setRemapError: (v: string) => void;
  remapImageName: string;
  setRemapImageName: (v: string) => void;
  remapDownloadScale: number;
  setRemapDownloadScale: (v: number) => void;
  remapDownloadConfirmPending: boolean;
  setRemapDownloadConfirmPending: (v: boolean) => void;
}

// Performance note: the source image is downsampled to REMAP_MAX_DIMENSION
// (512) on the longer axis before the actual remap. This keeps
// Floyd-Steinberg responsive on photographic inputs and matches the
// worst-case bounds in IMAGE_REMAP_PLAN.md.
const REMAP_MAX_DIMENSION = 512;

export function useImageRemapCompute(p: UseImageRemapComputeParams) {
  // remapDownloadConfirmTimerRef: 5-second auto-disarm timer handle for the
  // two-click download confirmation (remapDownloadConfirmPending). Owned here
  // because it's only touched by the download handler (and the export-scale
  // dropdown in VizComparePanel, which receives it as a prop).
  const remapDownloadConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute the active palette for remap. Reads rampsActive (each ramp at its
  // own active style, #69), filters hidden shades, dedupes. The result is the
  // SAME flat hex set the chromatic plot dots come from, which guarantees
  // parity with what the Visualization section shows.
  const getActiveRemapPalette = (): string[] => {
    const visible = p.rampsActive.map((ramp, i) => {
      const effectiveBase = p.resolveBaseForRamp(p.baseColors[i], i);
      const labels = p.labelsForRamp(ramp, effectiveBase);
      return p.filterHidden(ramp, labels, i).hexes;
    });
    const all = visible.flat();
    // Dedupe while preserving order; the remapper does not need uniqueness
    // for correctness but a smaller palette is faster.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const hex of all) {
      const k = hex.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(hex); }
    }
    return out;
  };

  // Build a signature string capturing the inputs that produced a remap
  // output. Two outputs are considered "the same" iff their signatures
  // match. Also used as the auto-refresh effect's change indicator.
  //
  // Includes: dither mode, the active palette (joined).
  // Excludes: the image itself (a new image triggers a fresh remap through
  // the effect's remapImageDataUrl dependency).
  const buildRemapSignature = (paletteColors: string[], dither: string): string => {
    return dither + '|' + paletteColors.map(c => c.toLowerCase()).join(',');
  };

  // Handle a freshly-uploaded image for the remap panel. Stores the data
  // URL and the natural size, clears any prior output, and clears any
  // previous error. Also picks an appropriate default export scale based
  // on the upload's natural size: 1x if it fits under the 8192px ceiling,
  // otherwise the largest available scale <= 1.
  const handleRemapImageUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      p.setRemapError('Please upload an image file');
      return;
    }
    p.setRemapError('');
    p.setRemapOutput(null);
    p.setRemapOutputSignature(null);
    p.setRemapImageName(file.name || 'image');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const probe = new Image();
      probe.onload = () => {
        const nw = probe.naturalWidth;
        const nh = probe.naturalHeight;
        p.setRemapImageNaturalSize({ w: nw, h: nh });
        p.setRemapImageDataUrl(dataUrl);
        // Pick the default export scale: prefer 1x when valid, else the
        // largest available <= 1. Compute the options synchronously here
        // since the dropdown render does the same computation; staying in
        // lock-step with the dropdown's options avoids a flash of an
        // invalid value.
        const opts = computeRemapScaleOptions(nw, nh, 8192);
        let pick = 1;
        if (opts.includes(1)) {
          pick = 1;
        } else {
          // Largest option <= 1, or smallest option if none <= 1.
          const leOne = opts.filter(s => s <= 1);
          pick = leOne.length > 0 ? leOne[leOne.length - 1] : (opts[0] || 1);
        }
        p.setRemapDownloadScale(pick);
        p.setRemapDownloadConfirmPending(false);
        if (remapDownloadConfirmTimerRef.current) {
          clearTimeout(remapDownloadConfirmTimerRef.current);
          remapDownloadConfirmTimerRef.current = null;
        }
      };
      probe.onerror = () => { p.setRemapError('Failed to load image'); };
      probe.src = dataUrl;
    };
    reader.onerror = () => { p.setRemapError('Failed to read file'); };
    reader.readAsDataURL(file);
  };

  // Clear the uploaded image and all derived state.
  const clearRemapImage = () => {
    p.setRemapImageDataUrl(null);
    p.setRemapImageNaturalSize(null);
    p.setRemapImageName('');
    p.setRemapOutput(null);
    p.setRemapOutputSignature(null);
    p.setRemapError('');
    p.setRemapDownloadConfirmPending(false);
    if (remapDownloadConfirmTimerRef.current) {
      clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = null;
    }
  };

  // The actual remap: loads the data URL into an Image, draws to a
  // canvas (downsampling if needed with imageSmoothingEnabled=false to
  // preserve pixel-art aesthetics), reads ImageData, and calls
  // requestRemap (runs remapImageToPalette in a worker, see
  // src/workers/remap.worker.ts and src/lib/remap-worker-client.ts, issue
  // #110). The result is stored in remapOutput and a fresh signature is
  // captured.
  //
  // Still wrapped in setTimeout(..., 0) so React renders the "Computing..."
  // badge before work begins.
  const refreshRemap = () => {
    if (!p.remapImageDataUrl) {
      p.setRemapError('No image loaded');
      return;
    }
    const sourceDataUrl = p.remapImageDataUrl;
    p.setRemapError('');
    p.setRemapLoading(true);
    setTimeout(() => {
      try {
        const img = new Image();
        img.onload = async () => {
          try {
            const palette = getActiveRemapPalette();
            // Downsample to REMAP_MAX_DIMENSION on the longer axis.
            const longer = Math.max(img.naturalWidth, img.naturalHeight);
            const scale = longer > REMAP_MAX_DIMENSION ? REMAP_MAX_DIMENSION / longer : 1;
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('canvas 2d context unavailable');
            // Nearest-neighbor on downsample: preserve source pixel hexes
            // and the pixel-art aesthetic. See IMAGE_REMAP_PLAN.md G4.
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, w, h);
            const source = ctx.getImageData(0, 0, w, h);
            // Runs in a worker (src/workers/remap.worker.ts) so the
            // per-pixel dithering loop doesn't block the main thread.
            const result = await requestRemap(source, palette, { dither: p.remapDither });
            p.setRemapOutput(result);
            p.setRemapOutputSignature(buildRemapSignature(palette, p.remapDither));
            p.setRemapLoading(false);
          } catch (err) {
            p.setRemapError('Failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
            p.setRemapLoading(false);
          }
        };
        img.onerror = () => {
          p.setRemapError('Failed to decode image');
          p.setRemapLoading(false);
        };
        img.src = sourceDataUrl;
      } catch (err) {
        p.setRemapError('Failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
        p.setRemapLoading(false);
      }
    }, 0);
  };

  // Auto-refresh the main Image Preview on any relevant state change.
  // Debounced 300ms so slider drags (hue shift strength, HSV editor
  // sliders) and rapid clicks (style toggle, hidden-shade toggling)
  // coalesce into a single remap rather than firing one per change.
  //
  // The trigger is `livePaletteSig`, a string capturing the active
  // palette plus dither mode. React tracks all the underlying palette
  // state because the sig string is recomputed every render, so any
  // change that affects the active palette also changes the sig string.
  // We then key the useEffect on the SIG (plus remapImageDataUrl for the
  // upload-arrival case), which is stable across renders that don't
  // change the palette.
  //
  // No manual Refresh button: with debouncing the auto-fire is responsive
  // enough that a manual trigger is redundant; steady state is never stale.
  //
  // The remapDither dep stays IMPLICIT via livePaletteSig (the sig
  // includes the dither mode). Keeping it out of the deps array
  // avoids double-firing on dither change.
  const livePaletteSig = p.remapImageDataUrl
    ? buildRemapSignature(getActiveRemapPalette(), p.remapDither)
    : '';
  useEffect(() => {
    if (!p.remapImageDataUrl) return;
    const timer = setTimeout(() => {
      refreshRemap();
    }, 300);
    return () => clearTimeout(timer);
    // refreshRemap reads closure state; the sig is the canonical
    // change indicator. ESLint can't infer this; suppress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.remapImageDataUrl, livePaletteSig]);

  // Download the current remap as a PNG at the configured scale.
  //
  // Pipeline:
  //   1. Compute the export dimensions: floor(naturalSize * scale).
  //   2. Estimate cost; if it exceeds the warn threshold and the user
  //      has not yet confirmed (remapDownloadConfirmPending), arm the
  //      two-click confirmation and stop. The second click within 5
  //      seconds commits.
  //   3. Decode remapImageDataUrl into an Image at its full natural size.
  //   4. Draw it onto a canvas at export dimensions with
  //      imageSmoothingEnabled = false. This gives us a fresh ImageData
  //      at the actual export resolution that the remap runs against.
  //   5. Run remapImageToPalette against THAT image with the current
  //      dither setting. The remap math runs on real pixels, not on
  //      upscaled preview pixels. Result is a true full-resolution PNG.
  //   6. Render the result to an export canvas and toBlob it.
  //
  // Notes:
  //   - We do NOT use the cached remapOutput. That is the downsampled
  //     PREVIEW; export does its own full-res computation so the user
  //     gets pixel-accurate output for their actual upload size.
  //   - For very large outputs (e.g. 4K Floyd-Steinberg), the remap runs in
  //     a worker (see requestRemap), so the main thread stays responsive;
  //     the warn-then-confirm guard is now a "this may take a while" UX
  //     hint rather than a correctness guard against freezing the tab.
  //   - Still wrapped in setTimeout(..., 0) so React paints the
  //     "Computing..." badge before the (now off-thread) work kicks off.
  const downloadRemap = () => {
    if (!p.remapImageDataUrl || !p.remapImageNaturalSize) {
      p.setRemapError('No image loaded');
      return;
    }
    const sourceDataUrl = p.remapImageDataUrl;
    const scale = (typeof p.remapDownloadScale === 'number' && p.remapDownloadScale > 0) ? p.remapDownloadScale : 1;
    const exportW = Math.max(1, Math.floor(p.remapImageNaturalSize.w * scale));
    const exportH = Math.max(1, Math.floor(p.remapImageNaturalSize.h * scale));
    // Cost projection: use the active palette size and the current dither
    // mode. Warn threshold is 50M distance ops (about 10 seconds of
    // main-thread freeze at 200ns / op). Only the heavy combinations
    // trigger the warning; small images and no-dither at moderate
    // resolutions pass through silently.
    const activePalette = getActiveRemapPalette();
    const projectedCost = estimateRemapCost(exportW, exportH, activePalette.length, p.remapDither);
    const WARN_THRESHOLD = 50000000;
    if (projectedCost > WARN_THRESHOLD && !p.remapDownloadConfirmPending) {
      p.setRemapDownloadConfirmPending(true);
      if (remapDownloadConfirmTimerRef.current) clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = setTimeout(() => {
        p.setRemapDownloadConfirmPending(false);
        remapDownloadConfirmTimerRef.current = null;
      }, 5000);
      return;
    }
    // Commit path: either cost is under threshold, or the user has
    // confirmed. Disarm the confirmation if it was armed.
    if (remapDownloadConfirmTimerRef.current) {
      clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = null;
    }
    p.setRemapDownloadConfirmPending(false);
    p.setRemapError('');
    p.setRemapLoading(true);
    setTimeout(() => {
      try {
        const img = new Image();
        img.onload = async () => {
          try {
            // Draw the upload into a canvas at the EXPORT dimensions with
            // nearest-neighbor scaling. This produces the source for the
            // remap run. For scale = 1 the canvas matches natural size.
            // For scale < 1 we downsample; for scale > 1 we upsample.
            // In both cases imageSmoothingEnabled=false preserves the
            // pixel-art aesthetic.
            const sourceCanvas = document.createElement('canvas');
            sourceCanvas.width = exportW;
            sourceCanvas.height = exportH;
            const sourceCtx = sourceCanvas.getContext('2d');
            if (!sourceCtx) throw new Error('canvas 2d context unavailable');
            sourceCtx.imageSmoothingEnabled = false;
            sourceCtx.drawImage(img, 0, 0, exportW, exportH);
            const sourceImageData = sourceCtx.getImageData(0, 0, exportW, exportH);

            // Run the SAME remap helper on the export-resolution source, in
            // a worker (this is the largest cost site: up to 8192px/axis).
            const result = await requestRemap(sourceImageData, activePalette, { dither: p.remapDither });

            // Write the result to a fresh canvas and export.
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = result.width;
            exportCanvas.height = result.height;
            const exportCtx = exportCanvas.getContext('2d');
            if (!exportCtx) throw new Error('canvas 2d context unavailable');
            try {
              // RemapImage.data is typed against ArrayBufferLike (worker
              // transferables); ImageData's constructor wants a plain
              // ArrayBuffer backing. The catch-arm below covers runtimes
              // where this constructor form is unavailable.
              const imgData = new ImageData(result.data as Uint8ClampedArray<ArrayBuffer>, result.width, result.height);
              exportCtx.putImageData(imgData, 0, 0);
            } catch {
              const imgData = exportCtx.createImageData(result.width, result.height);
              imgData.data.set(result.data);
              exportCtx.putImageData(imgData, 0, 0);
            }

            // Filename: sanitize the original upload name (extension
            // stripped, lowercased, non-alphanumeric chars normalized to
            // dashes) and append -remapped-{scale-tag}.png. The scale
            // tag formats integer scales as "{n}x" and fractional scales
            // as "0p25x" etc. so the filename is shell-friendly.
            const sanitize = (s: string) => s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            const scaleTag = Number.isInteger(scale)
              ? scale + 'x'
              : scale.toString().replace('.', 'p') + 'x';
            const base = p.remapImageName ? sanitize(p.remapImageName) : '';
            const filename = (base || 'remapped') + '-remapped-' + scaleTag + '.png';

            exportCanvas.toBlob(async (blob) => {
              if (!blob) {
                p.setRemapError('Failed to encode PNG');
                p.setRemapLoading(false);
                return;
              }
              const saved = await saveFile({
                defaultName: filename,
                filters: [{ name: 'PNG image', extensions: ['png'] }],
                data: { bytes: blob },
                folderKey: 'png',
              });
              if (!saved.ok && !saved.canceled) {
                p.setRemapError('Failed to save PNG');
              }
              p.setRemapLoading(false);
            }, 'image/png');
          } catch (err) {
            p.setRemapError('Download failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
            p.setRemapLoading(false);
          }
        };
        img.onerror = () => {
          p.setRemapError('Failed to decode source image for export');
          p.setRemapLoading(false);
        };
        img.src = sourceDataUrl;
      } catch (err) {
        p.setRemapError('Download failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
        p.setRemapLoading(false);
      }
    }, 0);
  };

  return {
    getActiveRemapPalette,
    handleRemapImageUpload,
    clearRemapImage,
    downloadRemap,
    remapDownloadConfirmTimerRef,
  };
}
