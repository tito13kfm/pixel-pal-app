import { useState } from 'react';

/**
 * Image-remap panel state: the uploaded source image + its natural size, the
 * computed remap output + signature, dither mode, load/error flags, the export
 * scale + two-click download confirmation, and drag state. The remap COMPUTE
 * pipeline (active-palette derivation, upload/clear/download handlers, the
 * debounced auto-refresh effect) lives in useImageRemapCompute, which App.tsx
 * wires to this hook's state; the draw effect + canvas ref live in
 * VizComparePanel.
 *
 * Feature overview: a separate image slot from the From Image extraction
 * feature. The user uploads a reference image and remaps every pixel to the
 * nearest color in the currently active palette (vizStyle, hidden shades,
 * hardware lock applied). Manual refresh via a button. None of this state is
 * persisted (matches the From Image mode), saved with palettes, or in the
 * history snapshot. See IMAGE_REMAP_PLAN.md and ARCHITECTURE.md's remap
 * section for the full design.
 */
export function useImageRemap() {
  // remapImageDataUrl: the uploaded image as a data URL, or null. Survives
  // palette edits (the user uploaded it intentionally; only the OUTPUT is
  // invalidated by palette changes).
  const [remapImageDataUrl, setRemapImageDataUrl] = useState(null);
  // remapImageNaturalSize: { w, h } of the uploaded image's natural size.
  const [remapImageNaturalSize, setRemapImageNaturalSize] = useState(null);
  // remapOutput: the cached remap result as { width, height, data }. Stays
  // up after a palette change to let the user compare visually; a stale
  // badge appears above it. Cleared by reset paths via clearRemapOutput().
  const [remapOutput, setRemapOutput] = useState(null);
  // remapOutputSignature: a string capturing the inputs that produced the
  // current remapOutput. Compared to the LIVE signature each render; when
  // they differ, the output is stale.
  const [remapOutputSignature, setRemapOutputSignature] = useState(null);
  // remapDither: 'none' | 'floyd-steinberg'. Session-only (not persisted,
  // matches the v1 decision; easy to upgrade later).
  const [remapDither, setRemapDither] = useState('none');
  // remapLoading: shown during the actual remap call.
  const [remapLoading, setRemapLoading] = useState(false);
  // remapError: surfaced upload / processing errors.
  const [remapError, setRemapError] = useState('');
  const [remapImageName, setRemapImageName] = useState('');
  // remapDownloadScale: float multiplier applied to the UPLOAD's natural
  // size at export time. The valid set is computed dynamically from the
  // upload size by computeRemapScaleOptions; scales are filtered so the
  // output stays under 8192px per axis (a conservative canvas-size
  // ceiling that matches the WebGL MAX_TEXTURE_SIZE floor on consumer
  // devices). Default 1 (one-to-one with the upload) when 1 is in the
  // valid set, else the largest available scale <= 1. Session-only,
  // no undo, no persistence.
  //
  // Note: this is the EXPORT scale, not the PREVIEW scale. The on-screen
  // preview always runs against the downsampled (<= 512px) source for
  // responsiveness; the export re-decodes the data URL and runs the
  // remap math against the ORIGINAL upload at this multiplier so the
  // PNG is a true full-resolution result rather than an upscaled
  // version of the preview.
  const [remapDownloadScale, setRemapDownloadScale] = useState(1);
  // remapDownloadConfirmPending: when true, the next Download click
  // commits a potentially long-running full-resolution export. Set by
  // the first click when projected cost exceeds the warn threshold;
  // cleared by a 5-second auto-disarm timer or by a successful commit.
  // Same two-click pattern as confirmReset. (The auto-disarm timer
  // handle, remapDownloadConfirmTimerRef, lives in App.tsx alongside
  // the download handler.)
  const [remapDownloadConfirmPending, setRemapDownloadConfirmPending] = useState(false);
  // remapDragOver: true while a file is being dragged over the panel's
  // empty-state drop zone. Drives a visual highlight (border color +
  // background) so the user knows the drop will land. Cleared on drop
  // or drag leave. Panel-local; no relation to the From Image mode's
  // `isDragging` state, which is gated on `mode === 'image'`.
  const [remapDragOver, setRemapDragOver] = useState(false);
  return {
    remapImageDataUrl, setRemapImageDataUrl, remapImageNaturalSize, setRemapImageNaturalSize,
    remapOutput, setRemapOutput, remapOutputSignature, setRemapOutputSignature,
    remapDither, setRemapDither, remapLoading, setRemapLoading,
    remapError, setRemapError, remapImageName, setRemapImageName,
    remapDownloadScale, setRemapDownloadScale,
    remapDownloadConfirmPending, setRemapDownloadConfirmPending,
    remapDragOver, setRemapDragOver,
  };
}
