import { useState } from 'react';

/**
 * Side-by-side comparison panel state: the two slot selectors (sbsLeft/Right,
 * e.g. 'working' | 'classic:<id>' | saved slug), their resolved payloads +
 * load/error flags, the remap source, and the per-slot remap outputs + loading
 * flags. The slot-resolution + remap EFFECTS, the canvas refs, and the
 * snapshot→palette helpers live in App.tsx (wiring layer) because they read
 * document-derived palettes and canvas refs.
 *
 * Side-by-Side image remap: when the Image Preview panel has an uploaded
 * image, each SBS slot also renders a remap of that same image against its
 * slot palette. This lets the user compare how two palettes handle the same
 * reference image. Source decoded once at 256px longest axis (smaller than
 * the main panel's 512px because each slot renders at a smaller display size
 * and we run TWO remaps per palette change here). Dither toggle is SHARED
 * with the main panel via remapDither; we do not add a second control. None
 * of this state is undoable, persisted, or in saved-palette payloads (matches
 * the main remap state policy).
 */
export function useSideBySide() {
  // sbsRemapSource: ImageData decoded from remapImageDataUrl at up to
  // SBS_REMAP_MAX_DIMENSION on the longer axis. Decoded once per upload
  // and reused by both slots. Cleared when the image is removed or
  // replaced. Null when no image is loaded.
  const [sbsRemapSource, setSbsRemapSource] = useState(null);
  // Per-slot remap output cache and loading flag. Auto-recomputes when
  // the slot palette signature, the source, or the dither setting
  // changes. Signature includes the slot's effective palette joined
  // lowercase plus the dither mode, same shape as buildRemapSignature.
  const [sbsLeftRemap, setSbsLeftRemap] = useState(null);
  const [sbsRightRemap, setSbsRightRemap] = useState(null);
  const [sbsLeftRemapLoading, setSbsLeftRemapLoading] = useState(false);
  const [sbsRightRemapLoading, setSbsRightRemapLoading] = useState(false);
  const [sbsLeft, setSbsLeft] = useState('working');
  const [sbsRight, setSbsRight] = useState(null);
  // Per-slot async payload cache. When a slot points at a saved palette
  // slug, the full payload is fetched from storage and stored here so
  // ramps render at full fidelity (pins, hidden shades, hardware, sizes,
  // sats). 'working' and null slots leave this at null and build the
  // snapshot inline from live state at render time. Errors during fetch
  // surface in sbs*Error so the slot can show a clear message.
  const [sbsLeftPayload, setSbsLeftPayload] = useState(null);
  const [sbsRightPayload, setSbsRightPayload] = useState(null);
  const [sbsLeftError, setSbsLeftError] = useState('');
  const [sbsRightError, setSbsRightError] = useState('');
  const [sbsLeftLoading, setSbsLeftLoading] = useState(false);
  const [sbsRightLoading, setSbsRightLoading] = useState(false);
  return {
    sbsRemapSource, setSbsRemapSource, sbsLeftRemap, setSbsLeftRemap,
    sbsRightRemap, setSbsRightRemap, sbsLeftRemapLoading, setSbsLeftRemapLoading,
    sbsRightRemapLoading, setSbsRightRemapLoading,
    sbsLeft, setSbsLeft, sbsRight, setSbsRight,
    sbsLeftPayload, setSbsLeftPayload, sbsRightPayload, setSbsRightPayload,
    sbsLeftError, setSbsLeftError, sbsRightError, setSbsRightError,
    sbsLeftLoading, setSbsLeftLoading, sbsRightLoading, setSbsRightLoading,
  };
}
