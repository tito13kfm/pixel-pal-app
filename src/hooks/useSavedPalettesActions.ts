// Stateful wrapper owning the saved-palette persistence + import pipeline
// (#113 slice 2).
//
// Extracted from App.tsx. Owns the save / load / delete / rename handlers,
// the classic-palette and .gpl import loaders, the mount-time list refresh,
// and the two-click delete-confirmation timer. Document state (baseColors,
// overrides, per-ramp maps, ...) is read/written straight through
// usePaletteState(), which is Zustand-backed, so this hook shares the exact
// same store App.tsx renders from and none of those 20 fields need to be
// threaded through params. Everything that is NOT store-backed (the
// useSavedPalettes() state bag, sprite/export/viz settings, panel-layout
// advancedOpen, App-local gamutPerRamp / v2NoticePending, tagNextLabel,
// resetPaletteState) arrives via the params object, same binding pattern as
// useExport / useImageRemapCompute.
//
// The only state owned here is:
//   - gplImport: the parsed-.gpl modal state ({ name, colors, error } | null).
//     Returned (with its setter) because the Escape-key handler and the modal
//     JSX in App.tsx read/clear it.
//   - confirmTimerRef: the 3s auto-disarm timer for two-click delete.
import { useEffect, useRef, useState } from 'react';
import { usePaletteState } from './usePaletteState';
import { slugify } from '../lib/palette';
import type { GamutStrategySerialized } from '../lib/palette';
import { presetToPoints } from '../lib/curve';
import type { CurvePoints } from '../lib/curve';
import { parseGpl, subsetGplColors } from '../lib/palette-import';
import { isValidRampSize } from '../lib/ramp-engine';
import { DEFAULT_STYLE_PRESETS, RAMP_STYLES } from '../lib/style-presets';
import type { RampStyle, StyleScalars } from '../lib/style-presets';
import { DEFAULT_SPRITE_LIBRARY, HARDWARE_PALETTES } from '../lib/constants';
import { isPreV2Palette } from '../components/V2EngineNotice';

export interface SavedPaletteEntry {
  slug: string;
  name: string;
  savedAt: number;
  baseColors: string[];
}

export interface GplImportState {
  name: string;
  colors: string[];
  error: string | null;
}

// Minimal shape loadClassicPalette needs from a CLASSIC_PALETTES entry.
export interface ClassicPaletteLike {
  name: string;
  baseColors: string[];
  names?: string[];
}

export const SAVED_PALETTE_LIMIT = 100;

interface UseSavedPalettesActionsParams {
  // useSavedPalettes() state bag (App.tsx destructures the hook and passes
  // through; that hook is plain useState, so unlike the ramps store it can't
  // be re-read here).
  savedPalettes: SavedPaletteEntry[];
  setSavedPalettes: (v: SavedPaletteEntry[]) => void;
  saveName: string;
  setSaveName: (v: string) => void;
  setSavedError: (v: string) => void;
  setSavedBusy: (v: boolean) => void;
  confirmDeleteSlug: string | null;
  setConfirmDeleteSlug: (v: string | null) => void;
  setRenamingSlug: (v: string | null) => void;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  setRenameError: (v: string) => void;

  // Cross-domain wiring (non-store state owned by other hooks / App.tsx).
  spriteKey: string;
  setSpriteKey: (v: string) => void;
  customSprites: Record<string, unknown>;
  setCustomSprites: (v: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  gamutPerRamp: Record<string, GamutStrategySerialized>;
  setGamutPerRamp: (v: Record<string, GamutStrategySerialized>) => void;
  advancedOpen: Record<string, boolean>;
  setAdvancedOpen: (v: Record<string, boolean>) => void;
  setV2NoticePending: (v: boolean) => void;
  setExportFeedback: (v: string) => void;
  tagNextLabel: (label: string) => void;
  // Shared "clear every customization layer" reset. Stays in App.tsx because
  // it also clears side-by-side + image-remap state owned there.
  resetPaletteState: () => void;
}

export function useSavedPalettesActions(p: UseSavedPalettesActionsParams) {
  const {
    baseColors, setBaseColors, setAiColorNames, aiColorNames,
    rampSize, setRampSize, shuffleSeed, setShuffleSeed,
    overrides, setOverrides, harmonyAnchor, setHarmonyAnchor,
    rampSizeOverrides, setRampSizeOverrides, rampSatOverrides, setRampSatOverrides,
    hueShiftStrengthPerRamp, setHueShiftStrengthPerRamp,
    hiddenShades, setHiddenShades, rampShuffleOffsets, setRampShuffleOffsets,
    hardwareLock, setHardwareLock, hueShiftStrength, setHueShiftStrength,
    lockedRamps, setLockedRamps,
    lightnessCurvePerRamp, setLightnessCurvePerRamp,
    satCurvePerRamp, setSatCurvePerRamp,
    stylePresets, setStylePresets, setPinEditor,
    paletteDefaultStyle, setPaletteDefaultStyle,
    rampStyleOverrides, setRampStyleOverrides,
    rampStyleScalars, setRampStyleScalars,
  } = usePaletteState();

  // gplImport: parsed .gpl modal state. See handleGplFile / applyGplImport.
  //   - name: palette name pulled from the file (cosmetic)
  //   - colors: full array of parsed hex strings (used for the "all" branch)
  //   - error: present if parsing failed and the modal should show an error
  const [gplImport, setGplImport] = useState<GplImportState | null>(null);

  // 3-second auto-disarm timer handle for the two-click delete confirmation
  // (confirmDeleteSlug). Only touched by requestDeletePalette / startRename.
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSavedPalettes = async () => {
    if (typeof window === 'undefined' || !window.storage) return;
    try {
      const listResult = await window.storage.list('palettes:');
      if (!listResult || !listResult.keys) { p.setSavedPalettes([]); return; }
      const entries: SavedPaletteEntry[] = [];
      for (const key of listResult.keys) {
        try {
          const got = await window.storage.get(key);
          if (!got || !got.value) continue;
          const parsed = JSON.parse(got.value);
          if (!parsed || !Array.isArray(parsed.baseColors)) continue;
          entries.push({
            slug: key.replace(/^palettes:/, ''),
            name: parsed.name || '(unnamed)',
            savedAt: parsed.savedAt || 0,
            baseColors: parsed.baseColors,
          });
        } catch (err) {
          // Individual key failed; skip it but keep going.
          console.warn('Failed to read palette key', key, err);
        }
      }
      entries.sort((a, b) => b.savedAt - a.savedAt);
      p.setSavedPalettes(entries);
    } catch (err) {
      console.error('refreshSavedPalettes failed', err);
      p.setSavedPalettes([]);
    }
  };

  // Load saved palettes once at mount. If storage is unavailable (e.g. running
  // outside the artifact sandbox), the list just stays empty and the panel
  // shows a clear notice.
  useEffect(() => {
    refreshSavedPalettes();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only, verbatim from App.tsx
  }, []);

  // Cleanup the confirm-delete timer if the component unmounts mid-confirm.
  useEffect(() => {
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, []);

  const saveCurrentPalette = async () => {
    p.setSavedError('');
    const trimmed = p.saveName.trim();
    if (!trimmed) { p.setSavedError('Please enter a name'); return; }
    if (typeof window === 'undefined' || !window.storage) {
      p.setSavedError('Storage is not available in this environment');
      return;
    }
    if (p.savedPalettes.length >= SAVED_PALETTE_LIMIT && !p.savedPalettes.some(pal => pal.name === trimmed)) {
      p.setSavedError(`Limit of ${SAVED_PALETTE_LIMIT} saved palettes reached. Delete one first.`);
      return;
    }
    const slug = slugify(trimmed);
    if (!slug) { p.setSavedError('Name must contain at least one letter or digit'); return; }
    const payload = {
      name: trimmed,
      savedAt: Date.now(),
      baseColors,
      aiColorNames,
      rampSize,
      spriteKey: p.spriteKey,
      shuffleSeed, // critical: ramps are deterministic only if we restore this exactly
      customSprites: p.customSprites, // snapshot the full custom sprite library
      overrides, // sparse per-shade pin map; absent in pre-feature-A payloads
      harmonyAnchor, // index into baseColors used as the harmony source
      rampSizeOverrides, // per-ramp shade count overrides; absent in older payloads
      rampSatOverrides, // per-ramp saturation multipliers; absent in older payloads
      hueShiftStrengthPerRamp, // per-ramp hue shift strength overrides; absent in older payloads
      hiddenShades, // per-base array of hidden shade indices; absent in older payloads
      rampShuffleOffsets, // per-ramp shuffle counter; absent in older payloads
      hardwareLock, // null | 'nes' | 'gameboy' | 'cga16' | 'ega64' | 'c64'; persistent hardware lock; absent in older payloads
      hueShiftStrength, // number in [0.0, 2.0], default 1.0; absent in older payloads (legacy palettes restore at 1.0)
      // lockedRamps is a Set in component state; we serialize as a sorted
      // array of base indices. Absent in payloads saved before this
      // feature shipped; legacy loads should default to empty (nothing
      // locked). Sorted purely for diff-friendliness when inspecting
      // stored JSON; load order doesn't matter.
      lockedRamps: [...lockedRamps].sort((a, b) => a - b),
      // Perceptual ramp engine per-ramp settings.
      lightnessCurvePerRamp,
      satCurvePerRamp,
      gamutPerRamp: p.gamutPerRamp,
      advancedOpen: p.advancedOpen,
      stylePresets,
      // Per-ramp style (#69): the palette-default scalar style + the two
      // per-ramp maps. Old payloads lack these; load() migrates via vizStyle.
      paletteDefaultStyle,
      rampStyleOverrides,
      rampStyleScalars,
      engineVersion: 2, // frozen constant: marks this as a v2 save so load() won't fire the migration notice (#70)
    };
    p.setSavedBusy(true);
    try {
      const result = await window.storage.set(`palettes:${slug}`, JSON.stringify(payload));
      if (!result) {
        p.setSavedError('Save failed (storage returned null)');
        p.setSavedBusy(false);
        return;
      }
      p.setSaveName('');
      p.setExportFeedback(`Saved as "${trimmed}"`);
      setTimeout(() => p.setExportFeedback(''), 2000);
      await refreshSavedPalettes();
    } catch (err) {
      console.error('saveCurrentPalette failed', err);
      p.setSavedError('Save failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    } finally {
      p.setSavedBusy(false);
    }
  };

  const loadPalette = async (slug: string) => {
    p.setSavedError('');
    if (typeof window === 'undefined' || !window.storage) {
      p.setSavedError('Storage is not available in this environment');
      return;
    }
    p.setSavedBusy(true);
    try {
      const got = await window.storage.get(`palettes:${slug}`);
      if (!got || !got.value) {
        p.setSavedError('Palette not found');
        return;
      }
      const parsed = JSON.parse(got.value);
      if (!parsed || !Array.isArray(parsed.baseColors) || parsed.baseColors.length === 0) {
        p.setSavedError('Palette data is invalid');
        return;
      }
      // Merge any saved custom sprites back in. We don't replace the current
      // custom library wholesale, since the user may have other sprites they
      // want to keep. New sprites from the snapshot only fill in gaps.
      if (parsed.customSprites && typeof parsed.customSprites === 'object') {
        p.setCustomSprites(prev => {
          const merged = { ...parsed.customSprites, ...prev };
          return merged;
        });
      }
      p.tagNextLabel(`Load: ${parsed.name || slug}`);
      setBaseColors(parsed.baseColors);
      setAiColorNames(Array.isArray(parsed.aiColorNames) ? parsed.aiColorNames : []);
      if (isValidRampSize(parsed.rampSize)) setRampSize(parsed.rampSize);
      // hueShiftStrength: number in [0.0, 2.0]. Missing field (pre-E
      // saved palettes) restores to 1.0, which matches their original
      // generation behavior byte-for-byte. Invalid values silently clamp
      // into range rather than failing the whole load.
      if (typeof parsed.hueShiftStrength === 'number' && Number.isFinite(parsed.hueShiftStrength)) {
        setHueShiftStrength(Math.max(0, Math.min(2, parsed.hueShiftStrength)));
      } else {
        setHueShiftStrength(1.0);
      }
      // engineVersion: v1 is gone; every palette renders on v2. A pre-v2 save
      // (engineVersion absent or !== 2) is auto-migrated on render; flag the
      // one-time notice. Migration persists lazily on the user's next save
      // (the save payload always writes engineVersion: 2). (#70)
      if (isPreV2Palette(parsed)) p.setV2NoticePending(true);
      // The legacy global vizStyle/gplStyle are gone (#69); a saved payload's
      // vizStyle/gplStyle now feeds paletteDefaultStyle migration below.
      // Only restore the sprite key if it exists in the library after the merge above.
      if (parsed.spriteKey && ((DEFAULT_SPRITE_LIBRARY as Record<string, unknown>)[parsed.spriteKey] || (parsed.customSprites && parsed.customSprites[parsed.spriteKey]) || p.customSprites[parsed.spriteKey])) {
        p.setSpriteKey(parsed.spriteKey);
      }
      // Restore the exact shuffleSeed so ramp jitter reproduces identically.
      // Older saved palettes (pre-fix) lack this field; fall back to 0, which
      // gives the deterministic no-jitter ramps. Those old palettes will look
      // slightly different from what was originally saved, but only on first
      // load after this fix, and will be exact on every subsequent save.
      if (typeof parsed.shuffleSeed === 'number' && Number.isFinite(parsed.shuffleSeed)) {
        setShuffleSeed(parsed.shuffleSeed);
      } else {
        setShuffleSeed(0);
      }
      // Restore per-shade overrides. New schema (per-style):
      //   overrides[baseIndex][shadeIndex] = { punchy?, balanced?, muted? }
      // Validate the nested structure: numeric base/shade keys mapping to
      // an object whose only allowed keys are 'punchy', 'balanced', 'muted',
      // each a 6-digit hex. Anything that fails validation is dropped
      // silently rather than failing the whole load. Old shared-style
      // saves (where the inner value was a plain hex string) won't validate;
      // we drop them rather than migrate, since this is a breaking change.
      if (parsed.overrides && typeof parsed.overrides === 'object' && !Array.isArray(parsed.overrides)) {
        const cleaned: Record<string, Record<string, Record<string, string>>> = {};
        for (const baseKey of Object.keys(parsed.overrides)) {
          const baseIdx = Number(baseKey);
          if (!Number.isInteger(baseIdx) || baseIdx < 0 || baseIdx >= parsed.baseColors.length) continue;
          const inner = parsed.overrides[baseKey];
          if (!inner || typeof inner !== 'object') continue;
          const cleanedInner: Record<string, Record<string, string>> = {};
          for (const shadeKey of Object.keys(inner)) {
            const shadeIdx = Number(shadeKey);
            if (!Number.isInteger(shadeIdx) || shadeIdx < 0) continue;
            const styleMap = inner[shadeKey];
            if (!styleMap || typeof styleMap !== 'object') continue;
            const cleanedStyles: Record<string, string> = {};
            for (const styleKey of ['punchy', 'balanced', 'muted']) {
              const hex = styleMap[styleKey];
              if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
                cleanedStyles[styleKey] = hex.toLowerCase();
              }
            }
            if (Object.keys(cleanedStyles).length > 0) cleanedInner[shadeIdx] = cleanedStyles;
          }
          if (Object.keys(cleanedInner).length > 0) cleaned[baseIdx] = cleanedInner;
        }
        setOverrides(cleaned);
      } else {
        setOverrides({});
      }
      setPinEditor(null);
      // Restore harmonyAnchor. Validate it's an integer in range of the
      // restored baseColors; otherwise fall back to 0. Pre-feature payloads
      // lack the field, also -> 0.
      if (typeof parsed.harmonyAnchor === 'number' && Number.isInteger(parsed.harmonyAnchor) && parsed.harmonyAnchor >= 0 && parsed.harmonyAnchor < parsed.baseColors.length) {
        setHarmonyAnchor(parsed.harmonyAnchor);
      } else {
        setHarmonyAnchor(0);
      }
      // Restore per-ramp size overrides. Validate each entry: key must be a
      // valid baseIndex, value must be 2..64. Drop anything that fails.
      if (parsed.rampSizeOverrides && typeof parsed.rampSizeOverrides === 'object' && !Array.isArray(parsed.rampSizeOverrides)) {
        const cleaned: Record<number, number> = {};
        for (const k of Object.keys(parsed.rampSizeOverrides)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const n = parsed.rampSizeOverrides[k];
          if (isValidRampSize(n)) cleaned[idx] = n;
        }
        setRampSizeOverrides(cleaned);
      } else {
        setRampSizeOverrides({});
      }
      // Restore per-ramp saturation multipliers. Validate: key in range,
      // value a finite number in [0.5, 2.0]. Out-of-range values are clamped.
      if (parsed.rampSatOverrides && typeof parsed.rampSatOverrides === 'object' && !Array.isArray(parsed.rampSatOverrides)) {
        const cleaned: Record<number, number> = {};
        for (const k of Object.keys(parsed.rampSatOverrides)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = Number(parsed.rampSatOverrides[k]);
          if (Number.isFinite(v)) cleaned[idx] = Math.max(0.5, Math.min(2.0, v));
        }
        setRampSatOverrides(cleaned);
      } else {
        setRampSatOverrides({});
      }
      // Restore per-ramp hue shift overrides. Schema: { [baseIndex]: number }.
      // Validate: key in range, value a finite number in [0, 2]. Out-of-range values are clamped.
      if (parsed.hueShiftStrengthPerRamp && typeof parsed.hueShiftStrengthPerRamp === 'object' && !Array.isArray(parsed.hueShiftStrengthPerRamp)) {
        const cleaned: Record<number, number> = {};
        for (const k of Object.keys(parsed.hueShiftStrengthPerRamp)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = Number(parsed.hueShiftStrengthPerRamp[k]);
          if (Number.isFinite(v)) cleaned[idx] = Math.max(0, Math.min(2, v));
        }
        setHueShiftStrengthPerRamp(cleaned);
      } else {
        setHueShiftStrengthPerRamp({});
      }
      // Restore hiddenShades. Schema: { [baseIndex]: number[] of shade indices }.
      // Validation: numeric baseIndex in range, value an array of non-negative
      // integers (out-of-range shade indices stay in state because they're
      // inert when the ramp size doesn't reach them, same policy as overrides).
      if (parsed.hiddenShades && typeof parsed.hiddenShades === 'object' && !Array.isArray(parsed.hiddenShades)) {
        const cleaned: Record<number, number[]> = {};
        for (const k of Object.keys(parsed.hiddenShades)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const arr = parsed.hiddenShades[k];
          if (!Array.isArray(arr)) continue;
          const validIndices: number[] = [];
          const seen = new Set<number>();
          for (const v of arr) {
            const n = Number(v);
            if (Number.isInteger(n) && n >= 0 && !seen.has(n)) {
              seen.add(n);
              validIndices.push(n);
            }
          }
          if (validIndices.length > 0) cleaned[idx] = validIndices.sort((a, b) => a - b);
        }
        setHiddenShades(cleaned);
      } else {
        setHiddenShades({});
      }
      // Restore rampShuffleOffsets. Schema: { [baseIndex]: number }.
      // Validation: numeric key in range, value a non-negative finite
      // integer. Out-of-range or non-integer values are dropped.
      if (parsed.rampShuffleOffsets && typeof parsed.rampShuffleOffsets === 'object' && !Array.isArray(parsed.rampShuffleOffsets)) {
        const cleaned: Record<number, number> = {};
        for (const k of Object.keys(parsed.rampShuffleOffsets)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = Number(parsed.rampShuffleOffsets[k]);
          if (Number.isInteger(v) && v >= 0) cleaned[idx] = v;
        }
        setRampShuffleOffsets(cleaned);
      } else {
        setRampShuffleOffsets({});
      }
      // Restore hardwareLock. Validate against the known hardware ids.
      // Anything else (including missing field on older payloads) -> null.
      if (typeof parsed.hardwareLock === 'string' && HARDWARE_PALETTES.some(hw => hw.id === parsed.hardwareLock)) {
        setHardwareLock(parsed.hardwareLock);
      } else {
        setHardwareLock(null);
      }
      // Restore lockedRamps. Stored as a sorted array of base indices.
      // Validate: must be an array; each entry must be a non-negative
      // integer in range of the loaded baseColors. Invalid entries are
      // silently dropped, and a missing field (older payloads) loads
      // as empty (nothing locked). The set is rebuilt from the
      // validated entries.
      if (Array.isArray(parsed.lockedRamps)) {
        const validIdx = new Set<number>();
        for (const v of parsed.lockedRamps) {
          if (Number.isInteger(v) && v >= 0 && v < parsed.baseColors.length) {
            validIdx.add(v);
          }
        }
        setLockedRamps(validIdx);
      } else {
        setLockedRamps(new Set());
      }
      // Per-ramp Advanced fields. Migrate legacy curvePerRamp (string presets) to lightnessCurvePerRamp (CurvePoints).
      const migratedLightness: Record<string, CurvePoints> = {};
      if (parsed.lightnessCurvePerRamp && typeof parsed.lightnessCurvePerRamp === 'object') {
        Object.assign(migratedLightness, parsed.lightnessCurvePerRamp);
      } else if (parsed.curvePerRamp && typeof parsed.curvePerRamp === 'object') {
        for (const [id, val] of Object.entries(parsed.curvePerRamp)) {
          migratedLightness[id] = typeof val === 'string' ? presetToPoints(val) : (val as CurvePoints);
        }
      }
      setLightnessCurvePerRamp(migratedLightness);
      setSatCurvePerRamp(parsed.satCurvePerRamp && typeof parsed.satCurvePerRamp === 'object' ? parsed.satCurvePerRamp : {});
      p.setGamutPerRamp(parsed.gamutPerRamp && typeof parsed.gamutPerRamp === 'object' ? parsed.gamutPerRamp : {});
      p.setAdvancedOpen(parsed.advancedOpen && typeof parsed.advancedOpen === 'object' ? parsed.advancedOpen : {});
      const sp = parsed.stylePresets;
      const validPreset = (x: any) => x && typeof x.reach === 'number' && typeof x.chromaFalloff === 'number';
      setStylePresets(
        sp && validPreset(sp.punchy) && validPreset(sp.balanced) && validPreset(sp.muted)
          ? { punchy: sp.punchy, balanced: sp.balanced, muted: sp.muted }
          : DEFAULT_STYLE_PRESETS
      );
      // Per-ramp style (#69). paletteDefaultStyle: validate against RAMP_STYLES.
      // Legacy migration: a pre-#69 payload has no paletteDefaultStyle, so
      // derive it from the old global vizStyle (else gplStyle, else 'punchy')
      // and load empty per-ramp maps.
      const isRampStyle = (x: unknown): x is RampStyle =>
        typeof x === 'string' && (RAMP_STYLES as string[]).includes(x);
      if (isRampStyle(parsed.paletteDefaultStyle)) {
        setPaletteDefaultStyle(parsed.paletteDefaultStyle);
      } else if (isRampStyle(parsed.vizStyle)) {
        setPaletteDefaultStyle(parsed.vizStyle);
      } else if (isRampStyle(parsed.gplStyle)) {
        setPaletteDefaultStyle(parsed.gplStyle);
      } else {
        setPaletteDefaultStyle('punchy');
      }
      // rampStyleOverrides: { [baseIndex]: RampStyle }. Drop keys out of range
      // and values not in RAMP_STYLES.
      if (parsed.rampStyleOverrides && typeof parsed.rampStyleOverrides === 'object' && !Array.isArray(parsed.rampStyleOverrides)) {
        const cleaned: Record<number, RampStyle> = {};
        for (const k of Object.keys(parsed.rampStyleOverrides)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = parsed.rampStyleOverrides[k];
          if (isRampStyle(v)) cleaned[idx] = v;
        }
        setRampStyleOverrides(cleaned);
      } else {
        setRampStyleOverrides({});
      }
      // rampStyleScalars: { [baseIndex]: { reach, chromaFalloff } }. Drop keys
      // out of range; require both scalars finite, clamped to [0, 1].
      if (parsed.rampStyleScalars && typeof parsed.rampStyleScalars === 'object' && !Array.isArray(parsed.rampStyleScalars)) {
        const cleaned: Record<number, StyleScalars> = {};
        for (const k of Object.keys(parsed.rampStyleScalars)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = parsed.rampStyleScalars[k];
          if (!v || typeof v !== 'object') continue;
          const reach = Number(v.reach);
          const chromaFalloff = Number(v.chromaFalloff);
          if (!Number.isFinite(reach) || !Number.isFinite(chromaFalloff)) continue;
          cleaned[idx] = {
            reach: Math.max(0, Math.min(1, reach)),
            chromaFalloff: Math.max(0, Math.min(1, chromaFalloff)),
          };
        }
        setRampStyleScalars(cleaned);
      } else {
        setRampStyleScalars({});
      }
      p.setExportFeedback(`Loaded "${parsed.name || slug}"`);
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch (err) {
      console.error('loadPalette failed', err);
      p.setSavedError('Load failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    } finally {
      p.setSavedBusy(false);
    }
  };

  // Load a built-in classic palette. Unlike loadPalette this doesn't touch
  // storage; the source is the CLASSIC_PALETTES constant.
  // shuffleSeed resets to 0 so the ramps are deterministic and don't
  // depend on whatever shuffle the user happened to be on.
  const loadClassicPalette = (classic: ClassicPaletteLike) => {
    if (!classic || !Array.isArray(classic.baseColors) || classic.baseColors.length === 0) return;
    p.tagNextLabel(`Load classic: ${classic.name}`);
    setBaseColors(classic.baseColors);
    setAiColorNames(classic.names || classic.baseColors.map((_, i) => `${classic.name} ${i + 1}`));
    p.resetPaletteState();
    // Classics weren't designed for any specific hardware constraint. Clear
    // any active lock so the loaded classic renders as-authored.
    setHardwareLock(null);
    setShuffleSeed(0);
    p.setExportFeedback(`Loaded "${classic.name}"`);
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  // GPL import: a .gpl file is parsed, and if successful the user is shown
  // a modal that lets them choose between "use all N colors as bases"
  // (capped at 16, truncated if longer) and "auto-pick representatives"
  // (subset down to ~5 mid-lightness, evenly spaced by hue).
  const handleGplFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseGpl(text);
      if (!parsed) {
        setGplImport({ name: file.name, colors: [], error: 'Not a valid .gpl file. Expected a "GIMP Palette" header and R G B values.' });
        return;
      }
      setGplImport({ name: parsed.name || file.name.replace(/\.[^/.]+$/, ''), colors: parsed.colors, error: null });
    };
    reader.onerror = () => {
      setGplImport({ name: file.name, colors: [], error: 'Could not read the file.' });
    };
    reader.readAsText(file);
  };

  // Apply the user's import choice. mode is either 'all' or 'subset'.
  // 'all' uses the first 16 unique colors verbatim (hard cap). 'subset'
  // runs the heuristic. The actual write into baseColors mirrors the
  // loadClassicPalette reset behavior: clears overrides, pins, anchor,
  // hardware lock, shuffleSeed, and the per-ramp size/sat overrides.
  const applyGplImport = (mode: 'all' | 'subset') => {
    if (!gplImport || gplImport.error || gplImport.colors.length === 0) return;
    let chosen: string[];
    if (mode === 'subset') {
      chosen = subsetGplColors(gplImport.colors);
    } else {
      // 'all' branch: dedupe and hard-cap at 16.
      const seen = new Set<string>();
      const uniq: string[] = [];
      for (const hex of gplImport.colors) {
        const n = hex.toLowerCase();
        if (!seen.has(n)) { seen.add(n); uniq.push(n); }
        if (uniq.length >= 16) break;
      }
      chosen = uniq;
    }
    if (chosen.length === 0) return;
    p.tagNextLabel(`Import GPL: ${gplImport.name}`);
    setBaseColors(chosen);
    setAiColorNames(chosen.map((_, i) => `${gplImport.name} ${i + 1}`));
    p.resetPaletteState();
    setHardwareLock(null);
    setShuffleSeed(0);
    setGplImport(null);
    const note = mode === 'subset' ? `Imported ${chosen.length} representatives from ${gplImport.colors.length}` : `Imported ${chosen.length}${gplImport.colors.length > chosen.length ? ` (truncated from ${gplImport.colors.length}, cap is 16)` : ''}`;
    p.setExportFeedback(note);
    setTimeout(() => p.setExportFeedback(''), 3500);
  };

  const requestDeletePalette = (slug: string) => {
    if (p.confirmDeleteSlug === slug) {
      // Second click: commit.
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
      deletePalette(slug);
      return;
    }
    p.setConfirmDeleteSlug(slug);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => {
      p.setConfirmDeleteSlug(null);
      confirmTimerRef.current = null;
    }, 3000);
  };

  const deletePalette = async (slug: string) => {
    p.setSavedError('');
    p.setConfirmDeleteSlug(null);
    if (typeof window === 'undefined' || !window.storage) {
      p.setSavedError('Storage is not available in this environment');
      return;
    }
    p.setSavedBusy(true);
    try {
      await window.storage.delete(`palettes:${slug}`);
      await refreshSavedPalettes();
    } catch (err) {
      console.error('deletePalette failed', err);
      p.setSavedError('Delete failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    } finally {
      p.setSavedBusy(false);
    }
  };

  // Rename a saved palette in place. Strategy A: only the user-visible
  // `name` field in the payload changes; the storage key (slug) stays the
  // same. This is simpler than re-slugging (no conflict handling, no
  // set+delete window) and the slug is never visible to the user. The
  // tradeoff is that the slug may no longer match the name if the user
  // inspects storage directly. Acceptable since storage inspection is not
  // a feature.
  const startRename = (slug: string, currentName: string) => {
    if (p.confirmDeleteSlug) {
      p.setConfirmDeleteSlug(null);
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    }
    p.setRenamingSlug(slug);
    p.setRenameDraft(currentName || '');
    p.setRenameError('');
  };
  const cancelRename = () => {
    p.setRenamingSlug(null);
    p.setRenameDraft('');
    p.setRenameError('');
  };
  const commitRename = async (slug: string) => {
    p.setRenameError('');
    const trimmed = p.renameDraft.trim();
    if (!trimmed) { p.setRenameError('Name cannot be empty'); return; }
    // No-op if name is unchanged. The current name lives in savedPalettes;
    // look it up rather than passing it in so a stale draft (e.g. caps
    // changes only) still cleanly no-ops.
    const existing = p.savedPalettes.find(pal => pal.slug === slug);
    if (existing && existing.name === trimmed) { cancelRename(); return; }
    // Reject if another saved palette already uses this exact display name.
    if (p.savedPalettes.some(pal => pal.slug !== slug && pal.name === trimmed)) {
      p.setRenameError('Another palette already uses this name');
      return;
    }
    if (typeof window === 'undefined' || !window.storage) {
      p.setRenameError('Storage is not available in this environment');
      return;
    }
    p.setSavedBusy(true);
    try {
      const got = await window.storage.get(`palettes:${slug}`);
      if (!got || !got.value) {
        p.setRenameError('Palette not found in storage');
        p.setSavedBusy(false);
        return;
      }
      const parsed = JSON.parse(got.value);
      if (!parsed || typeof parsed !== 'object') {
        p.setRenameError('Palette data is invalid');
        p.setSavedBusy(false);
        return;
      }
      parsed.name = trimmed;
      const result = await window.storage.set(`palettes:${slug}`, JSON.stringify(parsed));
      if (!result) {
        p.setRenameError('Rename failed (storage returned null)');
        p.setSavedBusy(false);
        return;
      }
      await refreshSavedPalettes();
      cancelRename();
    } catch (err) {
      console.error('commitRename failed', err);
      p.setRenameError('Rename failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    } finally {
      p.setSavedBusy(false);
    }
  };

  return {
    saveCurrentPalette, loadPalette, loadClassicPalette,
    gplImport, setGplImport, handleGplFile, applyGplImport,
    requestDeletePalette, startRename, cancelRename, commitRename,
  };
}
