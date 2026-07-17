// Stateful wrapper owning the Side-by-Side compare pipeline (#113).
//
// Extracted from App.tsx: the per-slot saved-payload fetch effects, the
// slot -> snapshot resolution (working / classic / saved-slug), the slot
// display labels, and the SBS image-remap pipeline (shared source decode +
// per-slot worker remaps keyed by palette signature).
//
// Owns no state: everything flows through the useSideBySide() state bag
// plus the ramp-core inputs the snapshot builders need, all bound here as
// params by App.tsx (same binding pattern as useImageRemapCompute). The
// remap source image is SHARED with the main Image Preview panel via
// remapImageDataUrl (one upload feeds both pipelines).
import { useEffect } from 'react';
import { CLASSIC_PALETTES } from '../lib/constants';
import { buildRampsForSnapshot } from '../lib/snapshot-ramps';
import type { RampSnapshot } from '../lib/snapshot-ramps';
import type { RampStyle } from '../lib/style-presets';
import { requestRemap } from '../lib/remap-worker-client';
import type { RemapOptions } from '../lib/image-remap';

// Snapshot bundles are the RampSnapshot shape buildRampsForSnapshot consumes;
// saved payloads are the untyped artifact shape pulled from storage (a
// RampSnapshot superset once validated). The builders below construct them
// field-by-field, exactly as the old inline App.tsx code did.
type SnapshotBundle = RampSnapshot;
type SavedPayload = { name?: string; baseColors?: unknown } & Record<string, unknown>;
type SlotValue = string | null;
type RemapDither = NonNullable<RemapOptions['dither']>;

interface UseSideBySideComputeParams {
  // Ramp-core inputs for the snapshot builders. workingRenderInputs is the
  // shared render-input field set (see App.tsx: liveRampSnapshot and
  // buildWorkingSnapshot must carry the same buildRamp inputs, #36/#37/#62).
  // Returns the shared render-input bundle WITHOUT hiddenShades (the live
  // grid hides at the display boundary); buildWorkingSnapshot adds it.
  workingRenderInputs: () => SnapshotBundle;
  hiddenShades: SnapshotBundle['hiddenShades'];
  rampSize: number;
  stylePresets: SnapshotBundle['stylePresets'];
  hueShiftStrength: number;
  vizStyle: string;
  savedPalettes: { slug: string; name: string }[];

  // Shared remap upload (owned by useImageRemap, same image as the main
  // Image Preview panel) + dither mode.
  remapImageDataUrl: string | null;
  remapDither: RemapDither;

  // useSideBySide() state (App.tsx destructures the hook and passes through).
  sbsLeft: SlotValue;
  sbsRight: SlotValue;
  sbsLeftPayload: SavedPayload | null;
  setSbsLeftPayload: (v: SavedPayload | null) => void;
  sbsRightPayload: SavedPayload | null;
  setSbsRightPayload: (v: SavedPayload | null) => void;
  setSbsLeftError: (v: string) => void;
  setSbsRightError: (v: string) => void;
  setSbsLeftLoading: (v: boolean) => void;
  setSbsRightLoading: (v: boolean) => void;
  sbsRemapSource: ImageData | null;
  setSbsRemapSource: (v: ImageData | null) => void;
  setSbsLeftRemap: (v: unknown) => void;
  setSbsRightRemap: (v: unknown) => void;
  setSbsLeftRemapLoading: (v: boolean) => void;
  setSbsRightRemapLoading: (v: boolean) => void;
}

export function useSideBySideCompute(p: UseSideBySideComputeParams) {
  const {
    workingRenderInputs, hiddenShades, rampSize, stylePresets, hueShiftStrength,
    vizStyle, savedPalettes, remapImageDataUrl, remapDither,
    sbsLeft, sbsRight, sbsLeftPayload, setSbsLeftPayload, sbsRightPayload, setSbsRightPayload,
    setSbsLeftError, setSbsRightError, setSbsLeftLoading, setSbsRightLoading,
    sbsRemapSource, setSbsRemapSource, setSbsLeftRemap, setSbsRightRemap,
    setSbsLeftRemapLoading, setSbsRightRemapLoading,
  } = p;

  // Side-by-side slot fetcher. When a slot points at a saved-palette slug,
  // pull the full payload from storage so ramps render at full fidelity
  // (pins, hidden shades, hardware lock, per-ramp sizes/sats, shuffleSeed).
  // When the slot is 'working' or null, no fetch is needed. We use an
  // ignore flag to avoid late-resolving fetches clobbering newer state.
  useEffect(() => {
    if (sbsLeft === null || sbsLeft === 'working' || (typeof sbsLeft === 'string' && sbsLeft.startsWith('classic:'))) {
      // Empty, working, or a classic palette. None of these require a
      // storage fetch: empty and working render from live state, and
      // classics render from the CLASSIC_PALETTES constant.
      setSbsLeftPayload(null);
      setSbsLeftError('');
      setSbsLeftLoading(false);
      return;
    }
    let ignore = false;
    setSbsLeftLoading(true);
    setSbsLeftError('');
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.storage) {
          throw new Error('Storage unavailable');
        }
        const got = await window.storage.get(`palettes:${sbsLeft}`);
        if (ignore) return;
        if (!got || !got.value) {
          setSbsLeftPayload(null);
          setSbsLeftError('Palette not found');
        } else {
          const parsed = JSON.parse(got.value);
          if (!parsed || !Array.isArray(parsed.baseColors)) {
            setSbsLeftPayload(null);
            setSbsLeftError('Palette payload malformed');
          } else {
            setSbsLeftPayload(parsed);
          }
        }
      } catch (err) {
        if (ignore) return;
        setSbsLeftPayload(null);
        setSbsLeftError(`Load failed: ${err && (err as Error).message ? (err as Error).message : 'unknown error'}`);
      } finally {
        if (!ignore) setSbsLeftLoading(false);
      }
    })();
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [sbsLeft]);

  useEffect(() => {
    if (sbsRight === null || sbsRight === 'working' || (typeof sbsRight === 'string' && sbsRight.startsWith('classic:'))) {
      // Empty, working, or a classic palette. None of these require a
      // storage fetch: empty and working render from live state, and
      // classics render from the CLASSIC_PALETTES constant.
      setSbsRightPayload(null);
      setSbsRightError('');
      setSbsRightLoading(false);
      return;
    }
    let ignore = false;
    setSbsRightLoading(true);
    setSbsRightError('');
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.storage) {
          throw new Error('Storage unavailable');
        }
        const got = await window.storage.get(`palettes:${sbsRight}`);
        if (ignore) return;
        if (!got || !got.value) {
          setSbsRightPayload(null);
          setSbsRightError('Palette not found');
        } else {
          const parsed = JSON.parse(got.value);
          if (!parsed || !Array.isArray(parsed.baseColors)) {
            setSbsRightPayload(null);
            setSbsRightError('Palette payload malformed');
          } else {
            setSbsRightPayload(parsed);
          }
        }
      } catch (err) {
        if (ignore) return;
        setSbsRightPayload(null);
        setSbsRightError(`Load failed: ${err && (err as Error).message ? (err as Error).message : 'unknown error'}`);
      } finally {
        if (!ignore) setSbsRightLoading(false);
      }
    })();
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [sbsRight]);

  // Resolve a slot value to a snapshot bundle understood by
  // buildRampsForSnapshot. Returns null if the slot is empty, still
  // loading, or errored. Used by both sbs slots.
  //   - null              -> null (empty slot)
  //   - 'working'         -> live snapshot of the working palette built
  //                          from current state. Re-evaluated on every
  //                          render so the slot tracks edits in real time.
  //   - 'classic:<id>'    -> a synthetic snapshot built from the named
  //                          CLASSIC_PALETTES entry. Wraps the classic's
  //                          baseColors and uses the user's LIVE rampSize
  //                          and hueShiftStrength so the comparison is
  //                          apples-to-apples with the working palette's
  //                          shade count and stylization. shuffleSeed is
  //                          forced to 0 so the classic doesn't drift as
  //                          the user shuffles their working palette
  //                          (a comparison reference should stay stable).
  //                          All per-ramp overrides (pins, hidden shades,
  //                          per-ramp sizes/sats, shuffle offsets) and
  //                          hardwareLock are empty: those are working-
  //                          palette identity, not the classic's, and
  //                          bleeding them through would produce nonsense.
  //   - <slug>            -> the cached payload from sbs*Payload, or null
  //                          while loading or on error.
  const buildWorkingSnapshot = () => {
    return {
      ...workingRenderInputs(),
      hiddenShades, // working-only: the live grid hides at the display
                    // boundary instead (see liveRampSnapshot comment in App.tsx)
    };
  };
  // Build a classic-palette snapshot bundle. See the "classic:<id>" rule
  // in getSnapshotForSlot above for the policy.
  const buildClassicSnapshot = (classicId: string) => {
    const classic = CLASSIC_PALETTES.find(c => c.id === classicId);
    if (!classic) return null;
    return {
      baseColors: classic.baseColors,
      aiColorNames: classic.names || [],
      rampSize,
      stylePresets,
      shuffleSeed: 0,
      overrides: {},
      rampSizeOverrides: {},
      rampSatOverrides: {},
      rampShuffleOffsets: {},
      hiddenShades: {},
      hardwareLock: null,
      hueShiftStrength,
      paletteDefaultStyle: 'punchy' as RampStyle,
      rampStyleOverrides: {},
      rampStyleScalars: {},
    };
  };
  const getSnapshotForSlot = (slot: SlotValue, cachedPayload: SavedPayload | null) => {
    if (slot === null) return null;
    if (slot === 'working') return buildWorkingSnapshot();
    if (typeof slot === 'string' && slot.startsWith('classic:')) {
      return buildClassicSnapshot(slot.slice('classic:'.length));
    }
    // null while loading or on error. The fetch effects validated
    // baseColors is an array before caching, so the payload is a usable
    // RampSnapshot superset by the time it lands here.
    return cachedPayload as SnapshotBundle | null;
  };
  // Friendly display name for a slot, used in the column header.
  // Prefer the in-memory savedPalettes index over the cached payload's
  // `name` field: the index is updated immediately after rename, while
  // a cached payload that was loaded before rename still holds the old
  // name. The cached-payload `.name` is only the fallback for the brief
  // window where a slot was just picked but the index has not yet
  // refreshed (e.g. immediately after a save).
  const getSlotLabel = (slot: SlotValue, cachedPayload: SavedPayload | null) => {
    if (slot === null) return '(empty)';
    if (slot === 'working') return 'Current working palette';
    if (typeof slot === 'string' && slot.startsWith('classic:')) {
      const classic = CLASSIC_PALETTES.find(c => c.id === slot.slice('classic:'.length));
      return classic ? `${classic.name} (classic)` : '(unknown classic)';
    }
    const meta = savedPalettes.find(p => p.slug === slot);
    if (meta) return meta.name;
    if (cachedPayload && typeof cachedPayload.name === 'string') return cachedPayload.name;
    return '(loading)';
  };

  // Side-by-Side image remap pipeline. Mirrors the main Image Preview
  // panel's pipeline but operates on snapshot palettes rather than on
  // the live working palette. See the "sbsRemapSource" state block in
  // useSideBySide for the policy summary.
  //
  // Source decode ceiling for SBS slots. 256 vs the main panel's 512
  // because each slot renders at a smaller display size AND we run two
  // remaps per relevant change. Halving the longer axis is a 4x cost
  // reduction per remap, 8x across both slots vs the main panel.
  const SBS_REMAP_MAX_DIMENSION = 256;
  // Derive a remap-ready palette (flat, deduped, lowercase) from a
  // snapshot under the current vizStyle. Returns [] for an unusable
  // snapshot. The flatten + dedupe is byte-identical to what the live
  // pipeline's getActiveRemapPalette produces when fed the same input,
  // because buildRampsForSnapshot already applies hidden-shade filter,
  // hardware lock, pins, sizes, saturations, and shuffle internally.
  const paletteFromSnapshotForRemap = (snapshot: SnapshotBundle) => {
    const ramps = buildRampsForSnapshot(snapshot, vizStyle);
    if (!ramps || ramps.length === 0) return [];
    const seen = new Set();
    const out: string[] = [];
    for (const ramp of ramps) {
      for (const hex of ramp) {
        const k = hex.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(hex); }
      }
    }
    return out;
  };
  // Stable signature for a slot palette + dither, used as the useEffect
  // dependency for the per-slot remap. Same shape as the main preview's
  // signature in useImageRemapCompute.
  // Empty palette signals "do not run a remap" via the empty-palette
  // guard inside the effect.
  const buildSbsRemapKey = (palette: string[], dither: string) => palette.length === 0
    ? ''
    : (dither + '|' + palette.map(c => c.toLowerCase()).join(','));

  // Decode the uploaded image once per upload into an ImageData at up
  // to SBS_REMAP_MAX_DIMENSION on the longer axis. Both slots reuse
  // this source. Cleared when remapImageDataUrl becomes null (user
  // removed the image).
  useEffect(() => {
    if (!remapImageDataUrl) {
      setSbsRemapSource(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const longer = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longer > SBS_REMAP_MAX_DIMENSION ? SBS_REMAP_MAX_DIMENSION / longer : 1;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // A null context lands in the catch below, same net effect as the
        // TypeError the old untyped code would have thrown.
        if (!ctx) throw new Error('2d context unavailable');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        if (!cancelled) setSbsRemapSource(data);
      } catch {
        if (!cancelled) setSbsRemapSource(null);
      }
    };
    img.onerror = () => { if (!cancelled) setSbsRemapSource(null); };
    img.src = remapImageDataUrl;
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [remapImageDataUrl]);

  // Per-slot remap effects. Each fires when the source, the slot
  // palette signature (vizStyle is baked into the signature via the
  // snapshot ramps), or the dither mode changes. Empty palette or
  // missing source -> clear the slot's output and bail. The remap itself
  // runs in a worker via requestRemap (issue #110); the `cancelled` flag
  // still guards against a stale response landing after a newer request
  // for the same slot has been fired (e.g. rapid palette edits).
  const leftSnapForRemap = getSnapshotForSlot(sbsLeft, sbsLeftPayload);
  const rightSnapForRemap = getSnapshotForSlot(sbsRight, sbsRightPayload);
  const leftRemapPalette = leftSnapForRemap ? paletteFromSnapshotForRemap(leftSnapForRemap) : [];
  const rightRemapPalette = rightSnapForRemap ? paletteFromSnapshotForRemap(rightSnapForRemap) : [];
  const leftRemapKey = buildSbsRemapKey(leftRemapPalette, remapDither);
  const rightRemapKey = buildSbsRemapKey(rightRemapPalette, remapDither);

  useEffect(() => {
    if (!sbsRemapSource || leftRemapKey === '') {
      setSbsLeftRemap(null);
      setSbsLeftRemapLoading(false);
      return;
    }
    setSbsLeftRemapLoading(true);
    let cancelled = false;
    requestRemap(sbsRemapSource, leftRemapPalette, { dither: remapDither }).then((result) => {
      if (!cancelled) {
        setSbsLeftRemap(result);
        setSbsLeftRemapLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setSbsLeftRemap(null);
        setSbsLeftRemapLoading(false);
      }
    });
    return () => { cancelled = true; };
    // leftRemapPalette and remapDither are captured via closure; the
    // signature key in deps changes whenever either of them changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbsRemapSource, leftRemapKey]);

  useEffect(() => {
    if (!sbsRemapSource || rightRemapKey === '') {
      setSbsRightRemap(null);
      setSbsRightRemapLoading(false);
      return;
    }
    setSbsRightRemapLoading(true);
    let cancelled = false;
    requestRemap(sbsRemapSource, rightRemapPalette, { dither: remapDither }).then((result) => {
      if (!cancelled) {
        setSbsRightRemap(result);
        setSbsRightRemapLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setSbsRightRemap(null);
        setSbsRightRemapLoading(false);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbsRemapSource, rightRemapKey]);

  return { getSnapshotForSlot, getSlotLabel };
}
