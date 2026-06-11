// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Shuffle, Palette, Sparkles, Download, Sun, Wand2, Upload, Image as ImageIcon, Dice5, Pipette, Monitor, MonitorOff, ChevronDown, ChevronUp, BarChart3, Save, Trash2, FolderOpen, Sliders, Pin, Moon, Contrast, Cpu, Eye, Plus, Columns, Lock, Unlock, History, RotateCcw, Edit2, Check, X, CopyPlus, GripVertical, Gamepad2 } from 'lucide-react';
import {
  hexToHsl, hslToHex, hexToRgb, rgbToHex,
  rgbToHsl, hslToRgb, hexToHsv, hsvToHex, hsvToRgb,
} from './lib/color';
import { generateRamp as generateRampNew } from './lib/ramp-engine';
import { LIGHTNESS_PRESETS, SAT_PRESETS, presetToPoints } from './lib/curve';
import type { CurvePoints } from './lib/curve';
import { saveFile } from './lib/save-file';
import {
  WORD_POOL, spriteVase, spriteWalkman, spriteCassette,
  spriteDiamond, DEFAULT_SPRITE_LIBRARY, CLASSIC_PALETTES,
  HARDWARE_PALETTES,
} from './lib/constants';
import { TourPanel } from './components/TourPanel'
import { TourOverlay } from './components/TourOverlay'
import { RampAdvancedPanel } from './components/RampAdvancedPanel';
import { PixelPlayground } from './components/PixelPlayground';
import type { GamutStrategySerialized } from './lib/palette';
import { dedupeHexes } from './lib/hex-utils';
import { computeVizData, drawLightnessStripPng, drawMosaicPng, drawAdjacencyMatrixPng, drawDitherBlendPng, drawPaletteStripPng, lightnessMarkers, LIGHTNESS_GRIDLINES } from './lib/strip-export';
import { buildGpl, buildJascPal, buildAse } from './lib/palette-export';
import { AdjacencyMatrix } from './components/AdjacencyMatrix';
import { DitherBlend } from './components/DitherBlend';
import { CrossRampDither } from './components/CrossRampDither';
import { DITHER_PATTERNS } from './lib/viz-interaction';
import { IS_WEB } from './lib/env';
import { DesktopAppLink } from './components/DesktopAppLink';
import { V2EngineNotice, isPreV2Palette } from './components/V2EngineNotice';
import { SectionCard } from './components/SectionCard';
import { BaseColorDock } from './components/BaseColorDock';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { ExportPanel } from './components/panels/ExportPanel';
import { SavedPalettesPanel } from './components/panels/SavedPalettesPanel';
import { PlaygroundPanel } from './components/panels/PlaygroundPanel';
import { VizComparePanel } from './components/panels/VizComparePanel';
import { HarmonyPanel } from './components/panels/HarmonyPanel';
import { RampsPanel, PixelSprite } from './components/panels/RampsPanel';
import { wcagRelativeLuminance, wcagContrast, wcagAaTier } from './lib/wcag';
import { DEFAULT_STYLE_PRESETS, styleToScalars } from './lib/style-presets';
import { buildRandomHex } from './lib/randomizer';
import { generateHarmony } from './lib/harmony';
import { parsePiskelC, parseGpl, subsetGplColors } from './lib/palette-import';
import { quantizeToHardware } from './lib/hardware-quantize';
import { extractDominantColors } from './lib/image-extract';
import { remapImageToPalette, computeRemapScaleOptions, estimateRemapCost } from './lib/image-remap';
import { buildRampsForSnapshot, seededHueDelta } from './lib/snapshot-ramps';
import { buildRamp } from './lib/ramp-pipeline';
import { permuteStringKeyMap } from './lib/permute-indexed-state';
import { ThemeProvider, LayoutProvider, PaletteProvider, EditorProvider } from './contexts';
import { useDisplaySettings } from './hooks/useDisplaySettings';
import { useVizSettings } from './hooks/useVizSettings';
import { useExportSettings } from './hooks/useExportSettings';
import { useTour } from './hooks/useTour';
import { useSpriteImport } from './hooks/useSpriteImport';
import { useImageExtract } from './hooks/useImageExtract';
import { useImageRemap } from './hooks/useImageRemap';
import { useSideBySide } from './hooks/useSideBySide';
import { useSavedPalettes } from './hooks/useSavedPalettes';
import { usePanelLayout } from './hooks/usePanelLayout';
import { useUpdater } from './hooks/useUpdater';
import { usePaletteState } from './hooks/usePaletteState';
import { useHistory } from './hooks/useHistory';

// ---------- window.storage shim ----------
// The original artifact used a custom async window.storage key-value API.
// We adapt it to localStorage at module load so existing call sites keep
// working unchanged. Returns Promises so `await` still parses correctly.
if (typeof window !== 'undefined' && !(window as any).storage) {
  (window as any).storage = {
    get: async (key) => {
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
      return { ok: true };
    },
    delete: async (key) => {
      localStorage.removeItem(key);
      return { ok: true };
    },
    list: async (prefix) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      return { keys };
    },
  };
}

// rgbToHex, rgbToHsl, hslToRgb, hexToHsl, hslToHex: imported from ./lib/color
// wcagRelativeLuminance, wcagContrast, wcagAaTier: imported from ./lib/wcag

// HSV conversion helpers. We use HSV (also called HSB) for the base-color
// editor because it matches the mental model used by pixel art tools like
// Aseprite. Note: HSV's V (value) goes from black at V=0 to a pure saturated
// color at V=100, but reaches white only when S is also 0. This differs from
// HSL where L=100 is always white regardless of S.
// rgbToHsv, hsvToRgb, hexToHsv, hsvToHex, getShadowHueShift,
// getHighlightHueShift, seededRandom, generateRamp:
// imported from ./lib/color (original definitions removed).


// Sprites, DEFAULT_SPRITE_LIBRARY, CLASSIC_PALETTES, HARDWARE_PALETTES:
// imported from ./lib/constants (original definitions removed).








// ---------- Main ----------
export default function PixelPalGenerator() {
  // Document core (25 fields: 19 snapshot + 6 editor/compare) + the snapshot
  // helpers live in usePaletteState (Tier B Wave 2). It is a thin state-bag:
  // the generation pipeline + all bulk handlers STAY below in App.tsx and read
  // these via the destructured `palette`. See src/hooks/usePaletteState.ts.
  const palette = usePaletteState();
  const {
    baseColors, setBaseColors, aiColorNames, setAiColorNames,
    rampSize, setRampSize,
    shuffleSeed, setShuffleSeed, overrides, setOverrides,
    harmonyAnchor, setHarmonyAnchor, rampSizeOverrides, setRampSizeOverrides,
    rampSatOverrides, setRampSatOverrides, hueShiftStrengthPerRamp, setHueShiftStrengthPerRamp,
    hiddenShades, setHiddenShades, rampShuffleOffsets, setRampShuffleOffsets,
    hardwareLock, setHardwareLock, hueShiftStrength, setHueShiftStrength,
    lockedRamps, setLockedRamps, collapsedRamps, setCollapsedRamps,
    lightnessCurvePerRamp, setLightnessCurvePerRamp, satCurvePerRamp, setSatCurvePerRamp,
    stylePresets, setStylePresets,
    editingIndex, setEditingIndex, editorHsv, setEditorHsv,
    pinEditor, setPinEditor, compareMode, setCompareMode,
    compareAnchor, setCompareAnchor, compareResult, setCompareResult,
    buildSnapshot, applySnapshotFields, resetTransientEditors,
    reorderRamps,
  } = palette;
  const [mode, setMode] = useState('color');
  // v2NoticePending: set true when a pre-v2 saved palette is loaded this session,
  // so the one-time V2EngineNotice banner can surface (it self-suppresses once the
  // user dismisses it, localStorage). See src/components/V2EngineNotice.tsx (#70).
  const [v2NoticePending, setV2NoticePending] = useState(false);
  const [colorInput, setColorInput] = useState('#ff00ff');
  const imageRef = useRef(null);
  // Display settings (theme, cvdMode, crtEnabled) + their load/persist effects
  // live in useDisplaySettings. See src/hooks/useDisplaySettings.ts.
  const { theme, setTheme, cvdMode, setCvdMode, crtEnabled, setCrtEnabled } = useDisplaySettings();
  const { vizStyle, setVizStyle, matrixColorSet, setMatrixColorSet, matrixView, setMatrixView, ditherPattern, setDitherPattern, ditherZoom, setDitherZoom, ditherCrossRamp, setDitherCrossRamp } = useVizSettings();
  // Export settings (gpl/format/ramp styles + copy/export feedback state) +
  // their load/persist effects live in useExportSettings. See
  // src/hooks/useExportSettings.ts.
  const {
    gplStyle, setGplStyle, exportFormat, setExportFormat, rampExportStyle, setRampExportStyle,
    copiedHex, setCopiedHex, exportFeedback, setExportFeedback,
    lastSavedPath, setLastSavedPath, sessionRampGplFolder, setSessionRampGplFolder,
  } = useExportSettings();
  // Tour UI state (open/guide/step + help-launcher toggle) lives in useTour.
  // The snapshot/restore/start/exit orchestration stays below in App.tsx
  // because it spans other domains. See src/hooks/useTour.ts.
  const { tourOpen, setTourOpen, tourGuideId, setTourGuideId, tourStep, setTourStep, launcherOpen, setLauncherOpen } = useTour();
  const {
    spriteKey, setSpriteKey, customSprites, setCustomSprites,
    showSpriteImporter, setShowSpriteImporter, spriteImportText, setSpriteImportText,
    spriteImportName, setSpriteImportName, spriteImportError, setSpriteImportError,
    spriteDragging, setSpriteDragging, spriteLibrary,
  } = useSpriteImport();

  const {
    imageDataUrl, setImageDataUrl, imageColorCount, setImageColorCount,
    imageLoading, setImageLoading, imageError, setImageError,
    isDragging, setIsDragging, eyedropperActive, setEyedropperActive,
    imageZoom, setImageZoom, imageNaturalSize, setImageNaturalSize,
    hoveredColor, setHoveredColor,
  } = useImageExtract();
  const {
    remapImageDataUrl, setRemapImageDataUrl, remapImageNaturalSize, setRemapImageNaturalSize,
    remapOutput, setRemapOutput, remapOutputSignature, setRemapOutputSignature,
    remapDither, setRemapDither, remapLoading, setRemapLoading,
    remapError, setRemapError, remapImageName, setRemapImageName,
    remapDownloadScale, setRemapDownloadScale,
    remapDownloadConfirmPending, setRemapDownloadConfirmPending,
    remapDragOver, setRemapDragOver,
  } = useImageRemap();
  const {
    sbsRemapSource, setSbsRemapSource, sbsLeftRemap, setSbsLeftRemap,
    sbsRightRemap, setSbsRightRemap, sbsLeftRemapLoading, setSbsLeftRemapLoading,
    sbsRightRemapLoading, setSbsRightRemapLoading,
    sbsLeft, setSbsLeft, sbsRight, setSbsRight,
    sbsLeftPayload, setSbsLeftPayload, sbsRightPayload, setSbsRightPayload,
    sbsLeftError, setSbsLeftError, sbsRightError, setSbsRightError,
    sbsLeftLoading, setSbsLeftLoading, sbsRightLoading, setSbsRightLoading,
  } = useSideBySide();
  const {
    savedPalettes, setSavedPalettes, saveName, setSaveName,
    savedError, setSavedError, savedBusy, setSavedBusy,
    confirmDeleteSlug, setConfirmDeleteSlug, renamingSlug, setRenamingSlug,
    renameDraft, setRenameDraft, renameError, setRenameError,
    confirmReset, setConfirmReset, savedFilter, setSavedFilter,
    classicLoaderId, setClassicLoaderId,
  } = useSavedPalettes();
  const {
    rampsOpen, setRampsOpen, harmonyOpen, setHarmonyOpen, tipsOpen, setTipsOpen,
    hwPickerOpen, setHwPickerOpen, exportOpen, setExportOpen,
    historyOpen, setHistoryOpen, advancedOpen, setAdvancedOpen,
    savedOpen, setSavedOpen, sbsOpen, setSbsOpen, pgOpen, setPgOpen,
    vizSubOpen, toggleVizSub,
    sectionOrder, setSectionOrder, resetSectionOrder, DEFAULT_SECTION_ORDER,
    dragOver, setDragOver, draggingKey, setDraggingKey,
  } = usePanelLayout();
  // Ramp reorder drag state, deliberately SEPARATE from the section-level
  // dragOver/draggingKey so card-drag (#44) and ramp-drag never collide.
  const [rampDragOver, setRampDragOver] = useState<{ index: number; pos: 'before' | 'after' } | null>(null);
  const [rampDragging, setRampDragging] = useState<number | null>(null);
  const { updateInfo, setUpdateInfo, updateReady, setUpdateReady, updateDownloading, setUpdateDownloading } = useUpdater();
  const tourSnapshot = useRef(null);
  // Brief inline feedback shown next to the "Add to Palette" button on the
  // Single Color tab. Separate from exportFeedback because the export
  // badge lives near the bottom of the page and is invisible to a user
  // working at the top. Clears itself via setTimeout.
  const [addBaseFeedback, setAddBaseFeedback] = useState('');
  const [harmonizeMode, setHarmonizeMode] = useState('complement');
  const [harmonizeBaseline, setHarmonizeBaseline] = useState(null);
  // ----- Image Remap Preview state -----
  // Separate image slot from the From Image extraction feature. The user
  // uploads a reference image and remaps every pixel to the nearest color
  // in the currently active palette (vizStyle, hidden shades, hardware
  // lock applied). Manual refresh via a button. None of this state is
  // persisted (matches the From Image mode), saved with palettes, or in
  // the history snapshot. See IMAGE_REMAP_PLAN.md and ARCHITECTURE.md's
  // remap section for the full design. The remap STATE fields live in the
  // useImageRemap() hook (destructured above); the compute/draw effects,
  // canvas ref, and upload/refresh/download handlers stay here in the
  // wiring layer because they read the live working palette and refs.
  // remapDownloadConfirmTimerRef: 5-second auto-disarm timer handle for the
  // two-click download confirmation (remapDownloadConfirmPending). Kept here
  // (not in the hook) because it's only touched by the download handler.
  const remapDownloadConfirmTimerRef = useRef(null);



  // History (undo / redo / jump-to-state) lives in useHistory: Photoshop-style
  // whole-state snapshots (NOT diff patches), 50-entry cap, session-only. The
  // document core is owned by usePaletteState; useHistory is wired to it via
  // buildSnapshot / applySnapshotFields / resetTransientEditors. The watcher's
  // dep array (snapshotInputs) is the 17 snapshot INPUT values, it deliberately
  // OMITS lightnessCurvePerRamp / satCurvePerRamp (preserved verbatim from the
  // pre-extraction behavior; do not "complete" it to 19). `tagNextLabel`
  // replaces the old scattered `pendingLabelRef.current = ...` handler writes:
  // tagged actions (Generate, Harmonize, Load, …) call it before mutating state;
  // untagged changes fall back to inferLabel. See src/hooks/useHistory.ts.
  const {
    historyEntries, historyIndex, undo, redo, jumpToHistoryIndex,
    canUndo, canRedo, tagNextLabel,
  } = useHistory({
    buildSnapshot,
    applySnapshotFields,
    resetTransientEditors,
    setExportFeedback,
    snapshotInputs: [
      baseColors, aiColorNames, rampSize, shuffleSeed,
      overrides, harmonyAnchor, rampSizeOverrides, rampSatOverrides, hueShiftStrengthPerRamp,
      hiddenShades, rampShuffleOffsets, hardwareLock, hueShiftStrength,
      lockedRamps, collapsedRamps, stylePresets,
    ],
  });

  const [gamutPerRamp, setGamutPerRamp] = useState<Record<string, GamutStrategySerialized>>({});
  const resetStylePresets = () => setStylePresets(DEFAULT_STYLE_PRESETS);
  const confirmTimerRef = useRef(null);
  // Ref to the Save Palette name input. Used by the `S` keyboard
  // shortcut to scroll the saved-palettes section into view and focus
  // the field for immediate typing. Set via the ref attribute on the
  // input element down in the JSX tree.
  const saveNameInputRef = useRef(null);
  const SAVED_PALETTE_LIMIT = 100;
  const resetConfirmTimerRef = useRef(null);

  // applyOverrides: given the raw ramp for base `i` and the current overrides
  // map, substitute any pinned shade indices. Out-of-range pin indices (e.g.
  // an old pin on shade 7 when the ramp is now size 4) are silently ignored,
  // matching the "keep them around but inert" policy in the state comment.
  // Map from ramp size to its position labels. The 5/7 sizes are symmetric
  // (2/3 shades below base + 2/3 above) so they fit naturally between the
  // existing 4 and 8. Centralize the mapping so we only have to add new
  // sizes in one place.
  const shadeLabelsFor = (n) => {
    if (n === 4) return ['outline', 'shadow', 'base', 'highlight'];
    if (n === 5) return ['outline', 'shadow', 'base', 'highlight', 'bright'];
    if (n === 6) return ['outline', 'deep shadow', 'shadow', 'base', 'highlight', 'bright'];
    if (n === 7) return ['outline', 'deep shadow', 'shadow', 'base', 'mid highlight', 'highlight', 'bright'];
    return ['outline', 'deep shadow', 'shadow', 'mid shadow', 'base', 'mid highlight', 'highlight', 'bright'];
  };

  // labelsForRamp: returns labels positioned so 'base' lands on whatever
  // slot in the sorted ramp actually holds the input base hex. This
  // corrects a labeling drift in generateRamp: the sort-by-lightness step
  // at the end can place a style-computed shade (e.g. midHighlight clamped
  // to a ceiling that's darker than the actual base) ahead of the base,
  // pushing the base into a slot the label table expects to hold a
  // different shade. Without this fix, the "base" label points at
  // whatever sorted into slot N/2 regardless of which hex is actually
  // the input base.
  //
  // Strategy: find the input base hex in the sorted ramp (case-insensitive
  // since generateRamp lowercases its output). Take the dark-side and
  // light-side label sequences from shadeLabelsFor(n) and rebuild the
  // label array with 'base' centered on the found slot. If the slot
  // count on either side doesn't match shadeLabelsFor's expected count,
  // labels closest to base are duplicated (with an index suffix) to fill,
  // or labels furthest from base are dropped. This keeps the most
  // recognizable labels (outline, bright) at the extremes.
  //
  // Fallback: if the base hex isn't found in the ramp at all (e.g. when
  // a pin or hardware lock has replaced the base shade), use the original
  // shadeLabelsFor(n) array. The "base" label in that case marks whichever
  // slot the original table puts it at, matching the prior behavior so
  // pinned-base or hardware-locked palettes label the same as before.
  const labelsForRamp = (sortedRamp, baseHex) => {
    const n = sortedRamp.length;
    const defaultLabels = shadeLabelsFor(n);
    if (typeof baseHex !== 'string') return defaultLabels;
    const target = baseHex.toLowerCase();
    let basePos = -1;
    for (let i = 0; i < sortedRamp.length; i++) {
      if (sortedRamp[i].toLowerCase() === target) { basePos = i; break; }
    }
    if (basePos < 0) return defaultLabels;
    // Find where 'base' sits in the default label table.
    const defaultBasePos = defaultLabels.indexOf('base');
    if (defaultBasePos < 0 || defaultBasePos === basePos) {
      // Nothing to shift, or the base hex landed exactly where the
      // default table expects.
      return defaultLabels;
    }
    // Build new labels. Dark-side labels are defaultLabels[0..defaultBasePos-1].
    // Light-side labels are defaultLabels[defaultBasePos+1..end]. We need
    // basePos dark labels and (n - basePos - 1) light labels.
    const darkSrc = defaultLabels.slice(0, defaultBasePos);
    const lightSrc = defaultLabels.slice(defaultBasePos + 1);
    const labels = new Array(n);
    labels[basePos] = 'base';
    // Dark side: anchor 'outline' to slot 0, fill the slots adjacent to
    // base with the labels nearest to base in the default ordering.
    // If we have more dark slots than dark labels, duplicate the label
    // nearest to base with an index suffix. If we have fewer, drop
    // labels nearest to base (preserving outline at slot 0).
    const darkNeeded = basePos;
    if (darkNeeded <= darkSrc.length) {
      // Use darkSrc[0..darkNeeded-1], keeping outline (index 0) anchored
      // at slot 0 and the labels closest to base get the slots closest
      // to base.
      const keep = darkSrc.slice(0, darkNeeded);
      for (let i = 0; i < darkNeeded; i++) labels[i] = keep[i];
    } else {
      // More dark slots than labels: place all darkSrc labels and pad
      // the slots adjacent to base with a suffixed duplicate of the
      // last (nearest-to-base) label.
      for (let i = 0; i < darkSrc.length; i++) labels[i] = darkSrc[i];
      const nearBase = darkSrc[darkSrc.length - 1] || 'shadow';
      let dupIdx = 2;
      for (let i = darkSrc.length; i < darkNeeded; i++) {
        labels[i] = `${nearBase} ${dupIdx++}`;
      }
    }
    // Light side: mirror the dark-side logic. Slots after base.
    const lightNeeded = n - basePos - 1;
    if (lightNeeded <= lightSrc.length) {
      // Use lightSrc[end - lightNeeded..end], keeping 'bright' (last) at
      // slot n-1 and the labels closest to base near base.
      const keep = lightSrc.slice(lightSrc.length - lightNeeded);
      for (let i = 0; i < lightNeeded; i++) labels[basePos + 1 + i] = keep[i];
    } else {
      // More light slots than labels: pad slots adjacent to base with a
      // suffixed duplicate of the first (nearest-to-base) label.
      const nearBase = lightSrc[0] || 'highlight';
      let dupIdx = 2;
      let writePos = basePos + 1;
      const extra = lightNeeded - lightSrc.length;
      for (let i = 0; i < extra; i++) {
        labels[writePos++] = `${nearBase} ${dupIdx++}`;
      }
      for (let i = 0; i < lightSrc.length; i++) {
        labels[writePos++] = lightSrc[i];
      }
    }
    return labels;
  };

  // applyOverrides: given the raw ramp for base `i` and the current overrides
  // map, substitute any pinned shade indices. Out-of-range pin indices (e.g.
  // an old pin on shade 7 when the ramp is now size 4) are silently ignored,
  // matching the "keep them around but inert" policy in the state comment.
  //
  // Schema: overrides[baseIndex][shadeIndex] is a per-style object
  // { punchy?, balanced?, muted? }, each entry a 6-digit hex. Pins are
  // applied only to the matching style; ramps for the other two styles
  // are unaffected at that shade index. The `style` arg picks which key.
  const applyOverrides = (ramp, baseIndex, overrideMap, style) => {
    const pinsForBase = overrideMap[baseIndex];
    if (!pinsForBase) return ramp;
    let next = null;
    for (const k of Object.keys(pinsForBase)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= ramp.length) continue;
      const styleMap = pinsForBase[k];
      if (!styleMap || typeof styleMap !== 'object') continue;
      const hex = styleMap[style];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
      if (next === null) next = ramp.slice();
      next[idx] = hex.toLowerCase();
    }
    return next || ramp;
  };

  // filterHidden: returns { hexes, labels, originalIndices } with the
  // hidden shades for base `baseIndex` removed. Internally ramps are
  // still computed at their full size (so pins, harmony anchor, and the
  // generator's lightness curves keep their position semantics); this
  // helper filters at the boundary right before display/export.
  // originalIndices is parallel to hexes/labels and gives the pre-filter
  // shade-index for each surviving entry, used by the swatch grid so
  // the right-click handler can target the correct position.
  const filterHidden = (ramp, labels, baseIndex) => {
    const hidden = hiddenShades[baseIndex];
    if (!Array.isArray(hidden) || hidden.length === 0) {
      return { hexes: ramp, labels, originalIndices: ramp.map((_, j) => j) };
    }
    const hiddenSet = new Set(hidden);
    const hexes = [];
    const filteredLabels = [];
    const originalIndices = [];
    for (let j = 0; j < ramp.length; j++) {
      if (hiddenSet.has(j)) continue;
      hexes.push(ramp[j]);
      filteredLabels.push(labels[j]);
      originalIndices.push(j);
    }
    return { hexes, labels: filteredLabels, originalIndices };
  };

  // resolveBaseForRamp: returns the base hex to feed into generateRamp for
  // ramp `i`, applying any per-ramp saturation multiplier. The multiplier
  // adjusts the base's HSL saturation BEFORE generateRamp runs; the style
  // curves (Punchy/Balanced/Muted) then operate on the adjusted saturation
  // and produce a ramp with the new tonal feel. We deliberately do NOT
  // scale anywhere inside generateRamp itself since that would change its
  // byte-identity. Multiplier clamped to [0, 100] internally.
  const resolveBaseForRamp = (hex, baseIndex) => {
    const mult = rampSatOverrides[baseIndex];
    if (mult === undefined || mult === 1) return hex;
    const hsl = hexToHsl(hex);
    const newSat = Math.max(0, Math.min(100, hsl.s * mult));
    return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
  };

  // resolveSizeForRamp: returns the shade count for ramp `i`, applying any
  // per-ramp override. Falls back to the global rampSize.
  const resolveSizeForRamp = (baseIndex) => {
    const override = rampSizeOverrides[baseIndex];
    if (override && [4, 5, 6, 7, 8].includes(override)) return override;
    return rampSize;
  };

  const resolveHueShiftForRamp = (baseIndex) =>
    hueShiftStrengthPerRamp[baseIndex] ?? hueShiftStrength;

  // Active hardware palette object when locked, otherwise null. Resolved
  // here once so the ramp useMemos don't re-do the find on every iteration.
  const activeHardware = useMemo(() => {
    if (!hardwareLock) return null;
    return HARDWARE_PALETTES.find(hw => hw.id === hardwareLock) || null;
  }, [hardwareLock]);

  // Adapter over generateRampNew that returns hex[] (the rest of the pipeline
  // works in flat hex arrays). Resolves the style name + editable stylePresets
  // to the engine's { reach, chromaFalloff } scalars, threads per-ramp curve +
  // gamut, and passes a seeded hueJitter (global reshuffle + per-ramp offset)
  // so reshuffles vary while the base slot stays anchored. Seed 0 + no offset
  // = zero jitter (deterministic baseline).
  const generateRamp = (baseHex: string, numColors: number, style: 'punchy' | 'balanced' | 'muted', hueShiftStrength: number, rampIdx?: number): string[] => {
    const rampKey = rampIdx !== undefined ? String(rampIdx) : undefined;
    const gamut = rampKey !== undefined ? gamutPerRamp[rampKey] : undefined;
    const { reach, chromaFalloff } = styleToScalars(style, stylePresets);
    let hueJitter = 0;
    if (rampIdx !== undefined) {
      const effectiveSeed = shuffleSeed + (rampShuffleOffsets[rampIdx] || 0);
      if (effectiveSeed !== 0) hueJitter = seededHueDelta(effectiveSeed, rampIdx);
    }
    const shades = generateRampNew(baseHex, {
      reach,
      chromaFalloff,
      size: numColors,
      hueShiftStrength,
      hueJitter,
      lightnessCurve: rampKey !== undefined ? (lightnessCurvePerRamp[rampKey] ?? LIGHTNESS_PRESETS.eased) : LIGHTNESS_PRESETS.eased,
      satCurve: rampKey !== undefined ? (satCurvePerRamp[rampKey] ?? SAT_PRESETS.flat) : SAT_PRESETS.flat,
      gamut,
    });
    return shades.map(s => s.hex);
  };

  // Live ramps now flow through the SAME shared buildRamp pipeline that
  // buildRampsForSnapshot uses (src/lib/ramp-pipeline.ts), so the live↔snapshot
  // mirror is structural: the generate→pin→snap pipeline lives in exactly one
  // place (no more #30-style duplication). We synthesize a snapshot-shaped object
  // from live state and feed it to buildRamp per base/style.
  //
  // Field-mapping rule (feed buildRamp exactly what the old inline memo fed the
  // engine): pass hueShiftStrengthPerRamp (buildRamp resolves it per ramp, like
  // resolveHueShiftForRamp). DELIBERATELY OMIT hiddenShades: the live memo does
  // NOT hide here; hiding happens at the display boundary via the component-scope
  // filterHidden, so buildRamp's internal hidden-filter must stay inert and these
  // ramps must remain full-length. DELIBERATELY OMIT curvePerRamp: legacy string
  // presets are migrated into lightnessCurvePerRamp on load; the live memo never
  // re-migrated, so passing it would double-apply. hardwareLock is the id string
  // (buildRamp re-finds the palette, exactly as activeHardware does).
  const liveRampSnapshot = useMemo(() => ({
    baseColors,
    rampSize,
    overrides,
    rampSizeOverrides,
    rampSatOverrides,
    hardwareLock,
    hueShiftStrength,
    hueShiftStrengthPerRamp,
    lightnessCurvePerRamp,
    satCurvePerRamp,
    gamutPerRamp,
    shuffleSeed,
    rampShuffleOffsets,
    stylePresets,
  }), [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, hardwareLock, hueShiftStrength, hueShiftStrengthPerRamp, lightnessCurvePerRamp, satCurvePerRamp, gamutPerRamp, shuffleSeed, rampShuffleOffsets, stylePresets]);

  const rampsPunchy = useMemo(() => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, 'punchy', i)), [liveRampSnapshot]);
  const rampsBalanced = useMemo(() => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, 'balanced', i)), [liveRampSnapshot]);
  const rampsMuted = useMemo(() => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, 'muted', i)), [liveRampSnapshot]);
  const ramps = rampsPunchy; // legacy alias for places that just need a representative ramp

  // Resolve the safe anchor index: if harmonyAnchor is out of bounds (e.g.
  // briefly after a remove before the clamp effect runs, or after a load
  // restores fewer bases than were present before), fall back to 0.
  const safeAnchor = harmonyAnchor >= 0 && harmonyAnchor < baseColors.length ? harmonyAnchor : 0;
  const harmony = useMemo(() => {
    const raw = generateHarmony([baseColors[safeAnchor]]);
    if (!activeHardware) return raw;
    // Snap each harmony color to the nearest hardware-legal hex. This means
    // "Add complementary" etc. always produces a hardware-legal new base.
    // Without the snap, clicking Add would unlock the user from their own
    // constraint and silently add a non-legal color.
    const snapped = {};
    for (const key of Object.keys(raw)) {
      snapped[key] = quantizeToHardware(raw[key], activeHardware);
    }
    return snapped;
  }, [baseColors, safeAnchor, activeHardware]);

  const handleGenerate = () => {
    tagNextLabel(mode === 'color' ? 'New palette' : 'Shuffle');
    if (mode === 'color') {
      setBaseColors([colorInput]); setAiColorNames([]);
      resetPaletteState();
      // Hard reset path: lockedRamps just got cleared. Bump shuffleSeed
      // directly rather than via bumpShuffleSeed, because the latter
      // reads the OLD lockedRamps closure value and would take the
      // lock-aware branch on a render where lock has already been
      // cleared in the same batched update.
      setShuffleSeed(s => s + 1);
    } else {
      // Non-reset path: respect existing lockedRamps so the user can
      // hold one ramp in place and Generate to re-roll only the others.
      bumpShuffleSeed();
    }
  };



  const handleImageUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageError('Please upload an image file'); return; }
    setImageLoading(true); setImageError(''); setAiColorNames([]);
    // Reset zoom and naturalSize so the new image starts at 1x and the
    // onLoad handler captures fresh dimensions.
    setImageZoom(1);
    setImageNaturalSize({ width: 0, height: 0 });
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImageDataUrl(dataUrl);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 150;
          const scale = img.width > maxDim || img.height > maxDim ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const colors = extractDominantColors(imageData, imageColorCount);
          if (colors.length === 0) { setImageError('No colors found'); setImageLoading(false); return; }
          const finalColors = colors.slice(0, imageColorCount);
          tagNextLabel('Extract from image');
          setBaseColors(finalColors);
          setAiColorNames(finalColors.map((_, i) => `Color ${i + 1}`));
          resetPaletteState();
          setShuffleSeed(s => s + 1);
          setImageLoading(false);
        } catch (err) { setImageError('Failed: ' + err.message); setImageLoading(false); }
      };
      img.onerror = () => { setImageError('Failed to load'); setImageLoading(false); };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const reExtractFromImage = () => {
    if (!imageDataUrl) return;
    setImageLoading(true);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 150;
        const scale = img.width > maxDim || img.height > maxDim ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const colors = extractDominantColors(imageData, imageColorCount);
        const finalColors = colors.slice(0, imageColorCount);
        tagNextLabel('Re-extract from image');
        setBaseColors(finalColors);
        setAiColorNames(finalColors.map((_, i) => `Color ${i + 1}`));
        resetPaletteState();
        setShuffleSeed(s => s + 1);
        setImageLoading(false);
      } catch (err) { setImageError('Failed: ' + err.message); setImageLoading(false); }
    };
    img.src = imageDataUrl;
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (mode === 'image') setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (mode !== 'image') return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

  useEffect(() => {
    if (!localStorage.getItem('pixel-pal-tour-seen')) {
      setTimeout(() => { startTour('onboarding'); }, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  function handleTourMarkSeen() {
    localStorage.setItem('pixel-pal-tour-seen', '1');
  }

  const SETUP_SETTERS = {
    export: setExportOpen,
    harmony: setHarmonyOpen,
  };

  const runTourSetup = (setupId) => {
    const setter = SETUP_SETTERS[setupId];
    if (setter) setter(true);
  };

  const snapshotTourState = () => {
    tourSnapshot.current = {
      mode, exportOpen, hwPickerOpen, compareMode, harmonyOpen,
    };
  };

  const restoreTourState = () => {
    const s = tourSnapshot.current;
    if (!s) return;
    setMode(s.mode);
    setExportOpen(s.exportOpen);
    setHwPickerOpen(s.hwPickerOpen);
    setCompareMode(s.compareMode);
    if (!s.compareMode) { setCompareAnchor(null); setCompareResult(null); }
    setHarmonyOpen(s.harmonyOpen);
    tourSnapshot.current = null;
  };

  const startTour = (id) => {
    if (!tourSnapshot.current) snapshotTourState();
    setLauncherOpen(false);
    setTourGuideId(id);
    setTourStep(0);
    setTourOpen(true);
  };

  const exitTour = () => {
    if (tourGuideId === 'onboarding') handleTourMarkSeen();
    setTourOpen(false);
    setTourGuideId(null);
    setTourStep(0);
    restoreTourState();
  };

  useEffect(() => {
    const pasteHandler = (e) => {
      if (mode !== 'image') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleImageUpload(file); break; }
        }
      }
    };
    if (mode === 'image') {
      window.addEventListener('paste', pasteHandler);
      return () => window.removeEventListener('paste', pasteHandler);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [mode]);

  const getPixelColorFromImage = (event) => {
    if (!imageDataUrl) return null;
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const naturalX = Math.floor((x / rect.width) * img.naturalWidth);
    const naturalY = Math.floor((y / rect.height) * img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    try {
      const data = ctx.getImageData(naturalX, naturalY, 1, 1).data;
      return { hex: rgbToHex(data[0], data[1], data[2]), alpha: data[3] };
    } catch { return null; }
  };

  const handleImageHover = (event) => {
    if (!eyedropperActive) return;
    const result = getPixelColorFromImage(event);
    if (result && result.alpha > 0) setHoveredColor(result.hex);
  };

  const handleImageLeave = () => setHoveredColor(null);

  const handleImageClick = (event) => {
    if (!eyedropperActive) return;
    const result = getPixelColorFromImage(event);
    if (!result || result.alpha < 128) return;
    if (!baseColors.includes(result.hex)) {
      tagNextLabel('Eyedropper add');
      setBaseColors(prev => [...prev, result.hex]);
      setAiColorNames(prev => {
        const padded = [...prev];
        while (padded.length < baseColors.length) padded.push('');
        padded.push('Eyedropper');
        return padded;
      });
      // Non-reset path: respect lockedRamps. New ramp (just appended) is
      // unlocked by default, so it'll receive the offset bump like any
      // other unlocked ramp.
      bumpShuffleSeed();
    }
  };

  // ----- Image Remap Preview handlers -----
  // The visible-palette computation matches what the Visualization section
  // shows in mosaic/lightness/chromatic plot. We compute it lazily inside
  // refreshRemap so it always reflects the current state (vizStyle, hidden
  // shades, hardware lock all baked in through the ramp memos). Pulling
  // from the same activeRamps the viz uses guarantees parity.
  //
  // Performance note: the source image is downsampled to remapMaxDimension
  // (default 512) on the longer axis before the actual remap. This keeps
  // Floyd-Steinberg responsive on photographic inputs and matches the
  // worst-case bounds in IMAGE_REMAP_PLAN.md.
  const REMAP_MAX_DIMENSION = 512;

  // Compute the active palette for remap. Reads vizStyle and the active
  // ramp memo for that style, filters hidden shades, dedupes. The result
  // is the SAME flat hex set the chromatic plot dots come from.
  const getActiveRemapPalette = () => {
    const rampsForStyle = vizStyle === 'balanced' ? rampsBalanced
                       : vizStyle === 'muted'    ? rampsMuted
                       :                            rampsPunchy;
    const visible = rampsForStyle.map((ramp, i) => {
      const effectiveBase = resolveBaseForRamp(baseColors[i], i);
      const labels = labelsForRamp(ramp, effectiveBase);
      return filterHidden(ramp, labels, i).hexes;
    });
    const all = visible.flat();
    // Dedupe while preserving order; the remapper does not need uniqueness
    // for correctness but a smaller palette is faster.
    const seen = new Set();
    const out = [];
    for (const hex of all) {
      const k = hex.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(hex); }
    }
    return out;
  };

  // Build a signature string capturing the inputs that produced a remap
  // output. Two outputs are considered "the same" iff their signatures
  // match. Used by the stale-output badge: when the live signature
  // differs from remapOutputSignature, the user sees a warning.
  //
  // Includes: dither mode, the active palette (joined), the active style.
  // Excludes: the image itself (a new image always triggers a fresh remap
  // through its own code path, not the stale-badge logic).
  const buildRemapSignature = (paletteColors, dither) => {
    return dither + '|' + paletteColors.map(c => c.toLowerCase()).join(',');
  };

  // Handle a freshly-uploaded image for the remap panel. Stores the data
  // URL and the natural size, clears any prior output, and clears any
  // previous error. Also picks an appropriate default export scale based
  // on the upload's natural size: 1x if it fits under the 8192px ceiling,
  // otherwise the largest available scale <= 1.
  const handleRemapImageUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setRemapError('Please upload an image file');
      return;
    }
    setRemapError('');
    setRemapOutput(null);
    setRemapOutputSignature(null);
    setRemapImageName(file.name || 'image');
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const probe = new Image();
      probe.onload = () => {
        const nw = probe.naturalWidth;
        const nh = probe.naturalHeight;
        setRemapImageNaturalSize({ w: nw, h: nh });
        setRemapImageDataUrl(dataUrl);
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
        setRemapDownloadScale(pick);
        setRemapDownloadConfirmPending(false);
        if (remapDownloadConfirmTimerRef.current) {
          clearTimeout(remapDownloadConfirmTimerRef.current);
          remapDownloadConfirmTimerRef.current = null;
        }
      };
      probe.onerror = () => { setRemapError('Failed to load image'); };
      probe.src = dataUrl;
    };
    reader.onerror = () => { setRemapError('Failed to read file'); };
    reader.readAsDataURL(file);
  };

  // Clear the uploaded image and all derived state.
  const clearRemapImage = () => {
    setRemapImageDataUrl(null);
    setRemapImageNaturalSize(null);
    setRemapImageName('');
    setRemapOutput(null);
    setRemapOutputSignature(null);
    setRemapError('');
    setRemapDownloadConfirmPending(false);
    if (remapDownloadConfirmTimerRef.current) {
      clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = null;
    }
  };

  // The actual remap: loads the data URL into an Image, draws to a
  // canvas (downsampling if needed with imageSmoothingEnabled=false to
  // preserve pixel-art aesthetics), reads ImageData, and calls
  // remapImageToPalette. The result is stored in remapOutput and a fresh
  // signature is captured.
  //
  // Wrapped in setTimeout(..., 0) so React renders the "Computing..."
  // badge before the synchronous remap work begins. Otherwise the loading
  // flag would only render AFTER the work finished (the work blocks the
  // main thread).
  const refreshRemap = () => {
    if (!remapImageDataUrl) {
      setRemapError('No image loaded');
      return;
    }
    setRemapError('');
    setRemapLoading(true);
    setTimeout(() => {
      try {
        const img = new Image();
        img.onload = () => {
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
            // Nearest-neighbor on downsample: preserve source pixel hexes
            // and the pixel-art aesthetic. See IMAGE_REMAP_PLAN.md G4.
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, w, h);
            const source = ctx.getImageData(0, 0, w, h);
            const result = remapImageToPalette(source, palette, { dither: remapDither });
            setRemapOutput(result);
            setRemapOutputSignature(buildRemapSignature(palette, remapDither));
            setRemapLoading(false);
          } catch (err) {
            setRemapError('Failed: ' + (err && err.message ? err.message : 'unknown error'));
            setRemapLoading(false);
          }
        };
        img.onerror = () => {
          setRemapError('Failed to decode image');
          setRemapLoading(false);
        };
        img.src = remapImageDataUrl;
      } catch (err) {
        setRemapError('Failed: ' + (err && err.message ? err.message : 'unknown error'));
        setRemapLoading(false);
      }
    }, 0);
  };

  // Canvas ref for drawing the remap output.


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
  //   - For very large outputs (e.g. 4K Floyd-Steinberg), the work
  //     happens synchronously on the main thread and can freeze the tab.
  //     The warn-then-confirm guard exists precisely for this case.
  //   - Wrapped in setTimeout(..., 0) for the same reason refreshRemap
  //     is: gives React a chance to paint the "Computing..." badge
  //     before the freeze.
  const downloadRemap = () => {
    if (!remapImageDataUrl || !remapImageNaturalSize) {
      setRemapError('No image loaded');
      return;
    }
    const scale = (typeof remapDownloadScale === 'number' && remapDownloadScale > 0) ? remapDownloadScale : 1;
    const exportW = Math.max(1, Math.floor(remapImageNaturalSize.w * scale));
    const exportH = Math.max(1, Math.floor(remapImageNaturalSize.h * scale));
    // Cost projection: use the active palette size and the current dither
    // mode. Warn threshold is 50M distance ops (about 10 seconds of
    // main-thread freeze at 200ns / op). Only the heavy combinations
    // trigger the warning; small images and no-dither at moderate
    // resolutions pass through silently.
    const activePalette = getActiveRemapPalette();
    const projectedCost = estimateRemapCost(exportW, exportH, activePalette.length, remapDither);
    const WARN_THRESHOLD = 50000000;
    if (projectedCost > WARN_THRESHOLD && !remapDownloadConfirmPending) {
      setRemapDownloadConfirmPending(true);
      if (remapDownloadConfirmTimerRef.current) clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = setTimeout(() => {
        setRemapDownloadConfirmPending(false);
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
    setRemapDownloadConfirmPending(false);
    setRemapError('');
    setRemapLoading(true);
    setTimeout(() => {
      try {
        const img = new Image();
        img.onload = () => {
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
            sourceCtx.imageSmoothingEnabled = false;
            sourceCtx.drawImage(img, 0, 0, exportW, exportH);
            const sourceImageData = sourceCtx.getImageData(0, 0, exportW, exportH);

            // Run the SAME remap helper on the export-resolution source.
            const result = remapImageToPalette(sourceImageData, activePalette, { dither: remapDither });

            // Write the result to a fresh canvas and export.
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = result.width;
            exportCanvas.height = result.height;
            const exportCtx = exportCanvas.getContext('2d');
            try {
              const imgData = new ImageData(result.data, result.width, result.height);
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
            const sanitize = (s) => s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            const scaleTag = Number.isInteger(scale)
              ? scale + 'x'
              : scale.toString().replace('.', 'p') + 'x';
            const base = remapImageName ? sanitize(remapImageName) : '';
            const filename = (base || 'remapped') + '-remapped-' + scaleTag + '.png';

            exportCanvas.toBlob(async (blob) => {
              if (!blob) {
                setRemapError('Failed to encode PNG');
                setRemapLoading(false);
                return;
              }
              const result = await saveFile({
                defaultName: filename,
                filters: [{ name: 'PNG image', extensions: ['png'] }],
                data: { bytes: blob },
                folderKey: 'png',
              });
              if (!result.ok && !result.canceled) {
                setRemapError('Failed to save PNG');
              }
              setRemapLoading(false);
            }, 'image/png');
          } catch (err) {
            setRemapError('Download failed: ' + (err && err.message ? err.message : 'unknown error'));
            setRemapLoading(false);
          }
        };
        img.onerror = () => {
          setRemapError('Failed to decode source image for export');
          setRemapLoading(false);
        };
        img.src = remapImageDataUrl;
      } catch (err) {
        setRemapError('Download failed: ' + (err && err.message ? err.message : 'unknown error'));
        setRemapLoading(false);
      }
    }, 0);
  };

  // randomizeColor: roll a new random hex into the colorInput field. Does
  // NOT touch baseColors, the ramp customizations, or history. The user
  // decides what to do with the new hex by clicking Add base (append it
  // to the palette) or New palette (replace the palette with this hex).
  //
  // Previous behavior: destructive replace, same as handleGenerate. That
  // got reported as confusing during usability session 2 followup work:
  // a user wanting to "roll until I see something good, then add it" had
  // no way to do that because every roll wiped their pins/locks/anchor.
  // Non-destructive: replaces only the hex preview; pins/locks/anchor stay.
  const randomizeColor = () => {
    setColorInput(buildRandomHex());
  };

  // Add the current Single Color tab's colorInput to baseColors as a new
  // base, without leaving the Single Color tab. Lets users batch-build a
  // multi-base palette by picking colors one at a time. The colorInput
  // state stays as-is so the user can keep adjusting.
  // Duplicate detection: case-insensitive hex compare. On a duplicate we
  // do NOT add a second entry; the feedback message becomes "Already in
  // palette" rather than the success count. Hex is normalized to lowercase
  // before write to match the storage convention used elsewhere.
  const addColorAsBase = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
      setAddBaseFeedback('Invalid hex');
      setTimeout(() => setAddBaseFeedback(''), 2000);
      return;
    }
    const norm = colorInput.toLowerCase();
    const alreadyPresent = baseColors.some(h => h.toLowerCase() === norm);
    if (alreadyPresent) {
      setAddBaseFeedback('Already in palette');
      setTimeout(() => setAddBaseFeedback(''), 2000);
      return;
    }
    const newLen = baseColors.length + 1;
    tagNextLabel('Add base color');
    setRampSizeOverrides(prev => ({ ...prev, [baseColors.length]: rampSize }));
    setBaseColors(prev => [...prev, norm]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(`Color ${newLen}`);
      return padded;
    });
    setAddBaseFeedback(`Added: now ${newLen} ramp${newLen === 1 ? '' : 's'}`);
    setTimeout(() => setAddBaseFeedback(''), 2000);
  };

  const addHarmonyColor = (hex, name) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  };

  const addHarmonyPair = (hex1, hex2, name1, name2) => {
    const toAdd = [], namesToAdd = [];
    if (!baseColors.includes(hex1)) { toAdd.push(hex1); namesToAdd.push(name1); }
    if (!baseColors.includes(hex2) && hex1 !== hex2) { toAdd.push(hex2); namesToAdd.push(name2); }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  };

  // N-ary version for tetradic/square which add 3 derived colors (the base
  // itself is already a ramp). Skips any color that's already in baseColors
  // and any duplicate among the input pairs.
  const addHarmonyMany = (pairs) => {
    const toAdd = [], namesToAdd = [];
    for (const { hex, name } of pairs) {
      if (baseColors.includes(hex)) continue;
      if (toAdd.includes(hex)) continue;
      toAdd.push(hex);
      namesToAdd.push(name);
    }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  };

  const removeRamp = (index) => {
    setBaseColors(prev => prev.filter((_, i) => i !== index));
    setAiColorNames(prev => prev.filter((_, i) => i !== index));
    // Keep editingIndex consistent with the new array. If the removed ramp was
    // the one being edited, close the editor. If a ramp before the edited one
    // was removed, the edited ramp shifts down by 1.
    setEditingIndex(prev => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
    // Per-shade overrides: drop the removed base's overrides entirely, and
    // shift later bases' keys down by 1 to match the new baseColors array.
    setOverrides(prev => {
      const next = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (idx === index) continue; // dropped
        const newIdx = idx > index ? idx - 1 : idx;
        next[newIdx] = prev[k];
      }
      return next;
    });
    // If the pin editor was on the removed ramp, close it. Otherwise shift its
    // baseIndex down if a ramp before it was removed.
    setPinEditor(prev => {
      if (!prev) return null;
      if (prev.baseIndex === index) return null;
      if (prev.baseIndex > index) return { ...prev, baseIndex: prev.baseIndex - 1 };
      return prev;
    });
    // Compare anchor: same shift logic. If the anchor's ramp was removed,
    // clear the anchor (and any in-flight result) so the user has to pick
    // a new one. Otherwise shift the baseIndex down by 1 if a ramp before
    // it was removed.
    setCompareAnchor(prev => {
      if (!prev) return null;
      if (prev.baseIndex === index) {
        setCompareResult(null);
        return null;
      }
      if (prev.baseIndex > index) return { ...prev, baseIndex: prev.baseIndex - 1 };
      return prev;
    });
    // Harmony anchor: if the anchor ramp was removed, fall back to 0. If a
    // ramp before the anchor was removed, shift the anchor down by 1 so it
    // keeps pointing at the same color. The safeAnchor read above also
    // guards against any one-frame staleness here.
    setHarmonyAnchor(prev => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
    // Same shift logic for per-ramp size and saturation overrides.
    const shiftBaseKeyedMap = (prev) => {
      const next = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (idx === index) continue;
        const newIdx = idx > index ? idx - 1 : idx;
        next[newIdx] = prev[k];
      }
      return next;
    };
    setRampSizeOverrides(shiftBaseKeyedMap);
    setRampSatOverrides(shiftBaseKeyedMap);
    setHiddenShades(shiftBaseKeyedMap);
    setRampShuffleOffsets(shiftBaseKeyedMap);
    // collapsedRamps is a Set, not an object map. Same shift semantics:
    // drop the removed index, shift later indices down by 1.
    setCollapsedRamps(prev => {
      const next = new Set();
      for (const idx of prev) {
        if (idx === index) continue;
        next.add(idx > index ? idx - 1 : idx);
      }
      return next;
    });
    // lockedRamps follows the same Set-shift semantics as collapsedRamps.
    // If the removed ramp itself was locked, the lock is implicitly
    // dropped (the ramp no longer exists); other locked ramps shift
    // down by 1 if they sat after the removed index.
    setLockedRamps(prev => {
      const next = new Set();
      for (const idx of prev) {
        if (idx === index) continue;
        next.add(idx > index ? idx - 1 : idx);
      }
      return next;
    });
  };

  // Base-color dock (#80): smooth-scroll to a ramp and flash a highlight when
  // the user clicks a swatch body in the dock.
  const [highlightedRamp, setHighlightedRamp] = useState(null);
  const highlightTimerRef = useRef(null);
  const scrollToRamp = (index) => {
    const el = document.querySelector(`[data-ramp-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedRamp(index);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedRamp(prev => (prev === index ? null : prev));
      highlightTimerRef.current = null;
    }, 1200);
  };

  // duplicateRamp: append a copy of ramp `i` at the end of baseColors,
  // carrying over every per-base-keyed setting (overrides, size override,
  // sat override, hidden shades, ramp shuffle offset, ai color name). The
  // new index is N = baseColors.length BEFORE the append, since we
  // append rather than insert. No existing indices shift, so other
  // base-keyed state doesn't need shifting.
  //
  // lockedRamps is deliberately NOT carried over: the typical reason
  // to duplicate is to vary the duplicate, so starting it unlocked is
  // the useful default.
  //
  // collapsedRamps is left to the existing auto-collapse useEffect
  // (collapses newly-appended indices when total >= 3).
  //
  // v0.6 perceptual engine: the new generateRamp ignores seed. Output is
  // deterministic from (base, style, size, hueShift, curve, gamut, satMult).
  // Since duplicateRamp carries over every per-base setting that the engine
  // reads, the duplicate is byte-identical to the source. The seed formula
  // `shuffleSeed * 17 + i * 31 + offset * 13` is still computed and passed
  // through the adapter shim, but the new engine drops the value, so the
  // N != i discrepancy from the old HSV engine no longer matters.
  const duplicateRamp = (i) => {
    if (i < 0 || i >= baseColors.length) return;
    tagNextLabel('Duplicate ramp');
    // Deep-clone helper for per-base entries. Plain JSON is sufficient:
    // the contents are POJO maps / arrays / primitives.
    const deepClone = (entry) => (entry === undefined ? undefined : JSON.parse(JSON.stringify(entry)));
    // Generic appender for sparse base-keyed maps: writes the cloned
    // source entry at index N (the position after append).
    const appendDup = (map) => {
      if (!Object.prototype.hasOwnProperty.call(map, i)) return map;
      const N = baseColors.length;
      return { ...map, [N]: deepClone(map[i]) };
    };
    setBaseColors(prev => [...prev, prev[i]]);
    setAiColorNames(prev => [...prev, prev[i] !== undefined ? prev[i] : '']);
    setOverrides(appendDup);
    setRampSizeOverrides(appendDup);
    setRampSatOverrides(appendDup);
    setHiddenShades(appendDup);
    setRampShuffleOffsets(appendDup);
    setExportFeedback('Duplicated ramp');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Open/close the base-color editor for ramp `index`. Toggling the same index
  // closes it. Opening a different index switches and re-seeds editorHsv from
  // that ramp's current base color.
  const toggleBaseEditor = (index) => {
    if (editingIndex === index) {
      setEditingIndex(null);
      return;
    }
    const hex = baseColors[index];
    if (hex) {
      const hsv = hexToHsv(hex);
      // Round H/S/V for display so the sliders show clean integers initially.
      setEditorHsv({ h: Math.round(hsv.h), s: Math.round(hsv.s), v: Math.round(hsv.v) });
    }
    setEditingIndex(index);
    // If the ramp card is collapsed, auto-expand so the editor's effect
    // on the swatches is visible. Otherwise the user clicks edit and
    // nothing visible changes below the icon row.
    setCollapsedRamps(prev => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  // Commit an HSV update from the editor: writes the corresponding hex back to
  // baseColors[editingIndex] and updates the local HSV state. Called on every
  // slider drag, so it needs to be cheap. We deliberately do NOT bump
  // shuffleSeed; that would re-randomize jitter on every nudge, making the
  // edit feel disconnected from the user's input.
  const updateEditorHsv = (next) => {
    setEditorHsv(next);
    if (editingIndex === null) return;
    const hex = hsvToHex(next);
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // Commit a hex update from the color picker: writes hex through, then syncs
  // the editor's HSV display so the sliders reflect the new value. The picker
  // can produce arbitrary 24-bit values that don't correspond to round HSV
  // numbers, so we let the displayed HSV show the actual derived values.
  const updateEditorHex = (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const hsv = hexToHsv(hex);
    setEditorHsv({ h: Math.round(hsv.h), s: Math.round(hsv.s), v: Math.round(hsv.v) });
    if (editingIndex === null) return;
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // ---------- Per-shade override helpers ----------
  // Overrides are keyed by (baseIndex, shadeIndex, style). isShadePinned
  // tests for a pin in one specific style; setOverride writes one; clearOverride
  // removes one and prunes empty containers up the tree.
  const isShadePinned = (baseIndex, shadeIndex, style) => {
    const inner = overrides[baseIndex];
    if (!inner) return false;
    const styleMap = inner[shadeIndex];
    if (!styleMap || typeof styleMap !== 'object') return false;
    return typeof styleMap[style] === 'string';
  };

  // togglePinEditor: handle a click on the pin button for (base, shade, style).
  // Three cases, evaluated in this order:
  //   1. Already pinned -> unpin. ALSO close the editor if it was open on
  //      this exact triple, otherwise leave any other editor alone. This
  //      ordering matters: a previous version checked the "editor open on
  //      me" branch first and returned without unpinning, which made
  //      unpinning a swatch with its own editor open take two clicks
  //      (one to close, one to unpin). The pin button is a binary toggle
  //      first, an editor-summoner second.
  //   2. Editor already open on this exact triple (not pinned) -> close
  //      it. This is the dismiss path for the "I pinned then changed my
  //      mind without adjusting" case.
  //   3. Not pinned, editor closed (or open elsewhere) -> commit the
  //      current displayed hex as the pin and open the editor so the
  //      user can adjust if they want.
  // Re-editing a pin is not a direct flow: click unpins, click again
  // re-pins to the new current computed shade. This keeps the pin button
  // a clear binary toggle, matching the user's mental model.
  const togglePinEditor = (baseIndex, shadeIndex, style, currentHex) => {
    if (isShadePinned(baseIndex, shadeIndex, style)) {
      clearOverride(baseIndex, shadeIndex, style);
      // If the editor was open on this exact triple, close it. Editors on
      // other swatches stay where they are.
      if (pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex && pinEditor.style === style) {
        setPinEditor(null);
      }
      return;
    }
    if (pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex && pinEditor.style === style) {
      setPinEditor(null);
      return;
    }
    if (typeof currentHex === 'string') {
      setOverride(baseIndex, shadeIndex, style, currentHex);
    }
    setPinEditor({ baseIndex, shadeIndex, style });
  };

  // setOverride: write or update the pinned hex for (baseIndex, shadeIndex, style).
  const setOverride = (baseIndex, shadeIndex, style, hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    if (!['punchy', 'balanced', 'muted'].includes(style)) return;
    const norm = hex.toLowerCase();
    setOverrides(prev => {
      const baseEntry = prev[baseIndex] ? { ...prev[baseIndex] } : {};
      const styleMap = baseEntry[shadeIndex] ? { ...baseEntry[shadeIndex] } : {};
      styleMap[style] = norm;
      baseEntry[shadeIndex] = styleMap;
      return { ...prev, [baseIndex]: baseEntry };
    });
  };

  // clearOverride: remove the pin for (baseIndex, shadeIndex, style). If
  // that shade entry has no remaining styles, drop the shade key. If the
  // base entry has no remaining shade keys, drop the base entry too. This
  // keeps the map sparse so save payloads stay small for mostly-unpinned
  // palettes.
  const clearOverride = (baseIndex, shadeIndex, style) => {
    setOverrides(prev => {
      if (!prev[baseIndex]) return prev;
      const baseEntry = { ...prev[baseIndex] };
      const styleMap = baseEntry[shadeIndex] ? { ...baseEntry[shadeIndex] } : null;
      if (!styleMap || !(style in styleMap)) return prev;
      delete styleMap[style];
      if (Object.keys(styleMap).length === 0) {
        delete baseEntry[shadeIndex];
      } else {
        baseEntry[shadeIndex] = styleMap;
      }
      const next = { ...prev };
      if (Object.keys(baseEntry).length === 0) {
        delete next[baseIndex];
      } else {
        next[baseIndex] = baseEntry;
      }
      return next;
    });
  };

  // hideShade: mark a (baseIndex, shadeIndex) as hidden across all three
  // styles for that base. Refuses to hide the last visible shade so a
  // ramp never renders empty. rampLen is the full pre-filter ramp length
  // for that base; caller passes it (rampsPunchy[baseIndex].length is
  // canonical since all three styles have the same length).
  const hideShade = (baseIndex, shadeIndex, rampLen) => {
    const currentHidden = Array.isArray(hiddenShades[baseIndex]) ? hiddenShades[baseIndex] : [];
    if (currentHidden.includes(shadeIndex)) return; // already hidden
    const wouldBeHidden = currentHidden.length + 1;
    if (wouldBeHidden >= rampLen) {
      // Last visible shade; refuse.
      setExportFeedback('Cannot hide the last visible shade');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    setHiddenShades(prev => {
      const next = { ...prev };
      const existing = Array.isArray(next[baseIndex]) ? next[baseIndex] : [];
      next[baseIndex] = [...existing, shadeIndex].sort((a, b) => a - b);
      return next;
    });
    // If the pin editor was open on this shade for any style, close it
    // since the shade is no longer interactable.
    if (pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex) {
      setPinEditor(null);
    }
  };

  // resetHiddenShades: restore every hidden shade for one base.
  const resetHiddenShades = (baseIndex) => {
    setHiddenShades(prev => {
      if (!prev[baseIndex]) return prev;
      const next = { ...prev };
      delete next[baseIndex];
      return next;
    });
  };

  // shuffleRamp: bump the per-ramp shuffle offset for one base, causing
  // just that ramp to re-jitter while leaving every other ramp's
  // generator output identical. This is distinct from the global
  // shuffleSeed which re-jitters every ramp at once.
  //
  // Locked ramps are silently skipped: re-jittering a locked ramp would
  // contradict the lock contract. The per-ramp dice button on the ramp
  // card is itself hidden for locked ramps, but we double-gate here in
  // case any other caller invokes shuffleRamp programmatically.
  const shuffleRamp = (baseIndex) => {
    if (lockedRamps.has(baseIndex)) return;
    setRampShuffleOffsets(prev => ({
      ...prev,
      [baseIndex]: (prev[baseIndex] || 0) + 1,
    }));
  };

  // bumpShuffleSeed: lock-aware replacement for `setShuffleSeed(s => s + 1)`
  // used by global Generate / dice / image-eyedropper handlers. If nothing
  // is locked, behaves identically to the old call (so existing palettes
  // and tests are unaffected). If at least one ramp is locked, we instead
  // bump rampShuffleOffsets[i] by 1 for every UNLOCKED ramp, and leave
  // shuffleSeed untouched. This re-jitters unlocked ramps (changing the
  // per-ramp seed by +13 instead of +17, but the user only sees that
  // their unlocked ramps changed, which is what they asked for) and
  // leaves locked ramps byte-identical to before the click.
  //
  // The asymmetry between +17 (old, all ramps) and +13 (new, unlocked
  // only) is harmless: the seed formula already mixes both contributors
  // (shuffleSeed * 17 + offset * 13), so both are valid shuffle steps.
  // The only observable difference would be in tests pinning specific
  // hex outputs to specific (shuffleSeed, offset) pairs; the test suite
  // doesn't do that.
  //
  // Called by: handleGenerate (non-reset path), image extract handlers,
  // handleImageClick eyedropper
  // append, and any other "global shuffle" entry point. Hard-reset
  // entry points (loadClassicPalette, applyGplImport, randomizeColor,
  // load-from-storage) bypass this helper and call setShuffleSeed
  // directly because they're wiping ALL state including lockedRamps.
  const bumpShuffleSeed = () => {
    if (lockedRamps.size === 0) {
      setShuffleSeed(s => s + 1);
      return;
    }
    setRampShuffleOffsets(prev => {
      const next = { ...prev };
      for (let i = 0; i < baseColors.length; i++) {
        if (lockedRamps.has(i)) continue;
        next[i] = (next[i] || 0) + 1;
      }
      return next;
    });
  };

  // resetPaletteState: clears every customization layer that the eight
  // full-palette-replace paths share. Callers are still responsible for
  // setting baseColors (or aiColorNames when applicable),
  // tagging the next history label via tagNextLabel, and bumping the shuffle seed if their path
  // requires it. Preserves rampSize, hardwareLock, theme, CRT, CVD on
  // purpose: those are session-level settings, not per-palette state.
  //
  // See ARCHITECTURE.md "Cross-cutting state-maintenance rules" rule 1.
  // If you add new base-keyed or per-palette state, add its setter here
  // (and verify each of the 8 call sites still does the right thing).
  const resetPaletteState = () => {
    setOverrides({}); setPinEditor(null); setHarmonyAnchor(0);
    setRampSizeOverrides({}); setRampSatOverrides({}); setHueShiftStrengthPerRamp({});
    setHiddenShades({}); setRampShuffleOffsets({});
    setCompareAnchor(null); setCompareResult(null);
    setCollapsedRamps(new Set()); setLockedRamps(new Set());
    setSbsLeft('working'); setSbsRight(null);
    setSbsLeftPayload(null); setSbsRightPayload(null);
    setSbsLeftError(''); setSbsRightError('');
    setSbsLeftLoading(false); setSbsRightLoading(false);
    setHueShiftStrength(1.0);
    // Image remap: clear the cached output and error. The uploaded image
    // itself stays (the user uploaded it intentionally and likely wants to
    // remap against the new palette). See IMAGE_REMAP_PLAN.md reset paths.
    setRemapOutput(null);
    setRemapOutputSignature(null);
    setRemapError('');
    setLightnessCurvePerRamp({});
    setSatCurvePerRamp({});
  };

  // resetToDefaults: user-visible "wipe my session and start fresh"
  // action. Picks a new random base color, clears the AI prompt, runs
  // the shared reset, and bumps the shuffle seed. Tags history so it's
  // undoable. Two-click confirmation pattern: first click arms, second
  // commits. Auto-disarms after 3 seconds.
  const resetToDefaults = () => {
    if (confirmReset) {
      if (resetConfirmTimerRef.current) { clearTimeout(resetConfirmTimerRef.current); resetConfirmTimerRef.current = null; }
      setConfirmReset(false);
      tagNextLabel('Reset to defaults');
      const fresh = buildRandomHex();
      setColorInput(fresh);
      setBaseColors([fresh]);
      setAiColorNames([]);
      setEditingIndex(null);
      resetPaletteState();
      // Hard-reset path: lockedRamps just got cleared. Bump shuffleSeed
      // directly rather than via bumpShuffleSeed, since the latter reads
      // the OLD lockedRamps closure and would take the lock-aware branch
      // on a render where lock has already been cleared in the same
      // batched update. Same reasoning as handleGenerate.
      setShuffleSeed(s => s + 1);
      return;
    }
    setConfirmReset(true);
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    resetConfirmTimerRef.current = setTimeout(() => {
      setConfirmReset(false);
      resetConfirmTimerRef.current = null;
    }, 3000);
  };

  // toggleRampLock: flip lock state for one ramp index. Used by the
  // padlock icon on each ramp card.
  const toggleRampLock = (baseIndex) => {
    setLockedRamps(prev => {
      const next = new Set(prev);
      if (next.has(baseIndex)) next.delete(baseIndex);
      else next.add(baseIndex);
      return next;
    });
  };

  // harmonize: rotate the hue of every UNLOCKED non-anchor base to a
  // color-theory position relative to the harmony anchor. Saturation and
  // lightness preserved per base. Mode controls the slot pattern used.
  // On first press the current base colors are saved as a baseline so
  // the user can restore pre-harmonize hues without relying on undo.
  const HARMONIZE_MODE_SLOTS = {
    complement:         [180],
    analogous:          [30, 330, 15, 345, 45, 315, 20, 340, 60, 300, 10],
    triadic:            [120, 240, 60, 180, 300, 30, 90, 150, 210, 270, 330],
    'split-complement': [150, 210, 30, 330, 120, 240, 60, 180, 90, 270, 45],
    square:             [90, 180, 270, 45, 135, 225, 315, 30, 60, 120, 150],
    tetradic:           [60, 240, 180, 120, 300, 30, 90, 150, 210, 270, 330],
  };
  const harmonize = () => {
    if (baseColors.length < 2) {
      setExportFeedback('Need at least 2 ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    const anchorIdx = safeAnchor;
    const anchorHex = baseColors[anchorIdx];
    if (!anchorHex) return;
    const anchorHsl = hexToHsl(anchorHex);
    const targets = [];
    for (let i = 0; i < baseColors.length; i++) {
      if (i === anchorIdx) continue;
      if (lockedRamps.has(i)) continue;
      targets.push(i);
    }
    if (targets.length === 0) {
      setExportFeedback('No unlocked ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    if (!harmonizeBaseline) setHarmonizeBaseline(baseColors.slice());
    const slots = HARMONIZE_MODE_SLOTS[harmonizeMode] || HARMONIZE_MODE_SLOTS.complement;
    const newBaseColors = baseColors.slice();
    for (let k = 0; k < targets.length; k++) {
      const i = targets[k];
      const slot = slots[k % slots.length];
      const orig = hexToHsl(baseColors[i]);
      const newH = ((anchorHsl.h + slot) % 360 + 360) % 360;
      newBaseColors[i] = hslToHex({ h: newH, s: orig.s, l: orig.l });
    }
    const modeLabel = harmonizeMode.replace('-', ' ');
    tagNextLabel(`Harmonize (${targets.length}, ${modeLabel})`);
    setBaseColors(newBaseColors);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback(`Harmonized ${targets.length} ramp${targets.length === 1 ? '' : 's'}: ${modeLabel}`);
    setTimeout(() => setExportFeedback(''), 2000);
  };
  const restoreHarmonizeBaseline = () => {
    if (!harmonizeBaseline) return;
    tagNextLabel('Restore pre-harmonize hues');
    setBaseColors(harmonizeBaseline.slice());
    setHarmonizeBaseline(null);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback('Restored original hues');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Toggle compare mode on/off. Turning OFF clears any in-flight anchor
  // and result so the next time the user enters compare mode they get a
  // clean slate. Turning ON does NOT pre-populate anything; user picks.
  const toggleCompareMode = () => {
    setCompareMode(prev => {
      if (prev) {
        setCompareAnchor(null);
        setCompareResult(null);
      }
      return !prev;
    });
  };

  // Pick a swatch while compare mode is on. Behavior:
  // - No anchor yet: this becomes the anchor.
  // - Anchor exists and the clicked swatch IS the anchor: unlock (clear).
  // - Anchor exists and the clicked swatch is different: compute the ratio
  //   and stash both into compareResult. The anchor stays so the user can
  //   keep comparing OTHER swatches against the same anchor; clicking the
  //   anchor again clears everything.
  // The "same swatch" identity uses (baseIndex, shadeIndex, style) since
  // two different ramps can have the same hex value.
  const pickCompareSwatch = (baseIndex, shadeIndex, style, hex) => {
    if (!compareAnchor) {
      setCompareAnchor({ baseIndex, shadeIndex, style, hex });
      setCompareResult(null);
      return;
    }
    const isAnchor = compareAnchor.baseIndex === baseIndex
                  && compareAnchor.shadeIndex === shadeIndex
                  && compareAnchor.style === style;
    if (isAnchor) {
      // Click anchor again -> unlock entirely.
      setCompareAnchor(null);
      setCompareResult(null);
      return;
    }
    // Different swatch -> compute and show result, keep anchor.
    const ratio = wcagContrast(compareAnchor.hex, hex);
    const tier = wcagAaTier(ratio);
    setCompareResult({ aHex: compareAnchor.hex, bHex: hex, ratio, tier });
  };

  const handleSpriteFile = (file) => {
    if (!file) return;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    if (!spriteImportName.trim()) setSpriteImportName(baseName);
    const reader = new FileReader();
    reader.onload = (e) => { setSpriteImportText(e.target.result); setSpriteImportError(''); };
    reader.onerror = () => setSpriteImportError('Failed to read file');
    reader.readAsText(file);
  };

  const handleSpriteDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setSpriteDragging(true); };
  const handleSpriteDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setSpriteDragging(false); };
  const handleSpriteDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setSpriteDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSpriteFile(file);
  };

  const importSprite = () => {
    setSpriteImportError('');
    if (!spriteImportName.trim()) { setSpriteImportError('Please give your sprite a name'); return; }
    const parsed = parsePiskelC(spriteImportText);
    if (!parsed) { setSpriteImportError('Could not parse. Paste the full C array text'); return; }
    const key = spriteImportName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (DEFAULT_SPRITE_LIBRARY[key]) { setSpriteImportError('Name conflicts with built-in sprite'); return; }
    setCustomSprites(prev => ({
      ...prev,
      [key]: { name: spriteImportName.trim(), pattern: parsed.pattern, numShades: parsed.numShades }
    }));
    setSpriteKey(key);
    setSpriteImportText(''); setSpriteImportName('');
    setShowSpriteImporter(false);
    setExportFeedback(`Imported ${parsed.width}×${parsed.height}, ${parsed.numShades} shades`);
    setTimeout(() => setExportFeedback(''), 3000);
  };

  const removeCustomSprite = (key) => {
    setCustomSprites(prev => { const n = { ...prev }; delete n[key]; return n; });
    if (spriteKey === key) setSpriteKey('vase');
  };

  const copySpriteSource = (key) => {
    const sprite = spriteLibrary[key];
    if (!sprite || !sprite.pattern) return;
    const width = sprite.pattern[0].length;
    const height = sprite.pattern.length;
    const lines = [];
    lines.push('=== PIXEL.PAL SPRITE EXPORT ===');
    lines.push(`name: ${sprite.name}`);
    lines.push(`size: ${width}x${height}`);
    lines.push(`shades: ${sprite.numShades}`);
    lines.push('pattern:');
    sprite.pattern.forEach(row => lines.push(row));
    lines.push('=== END SPRITE ===');
    const text = lines.join('\n');
    const tryCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setExportFeedback('Sprite source copied!');
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setExportFeedback('Sprite source copied!');
        } catch {
          setExportFeedback('Copy failed: check console');
          console.log(text);
        }
      }
      setTimeout(() => setExportFeedback(''), 2500);
    };
    tryCopy();
  };

  useEffect(() => {
    const randomHex = buildRandomHex();
    setColorInput(randomHex);
    setBaseColors([randomHex]);
    setShuffleSeed(s => s + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, []);

  // Persisted UI preferences: rampSize, vizStyle, gplStyle, rampExportStyle.
  // These are session-level defaults the app initializes with on cold open.
  // Each value is also restorable per-palette via the saved palette payload
  // (rampSize, vizStyle, gplStyle are in the payload schema; rampExportStyle
  // is not, but it follows the same persistence shape for the UI default).
  // Loading a saved palette overrides whatever the persisted default was,
  // which is the desired behavior. Undo also writes to these states (for
  // rampSize) and that write will persist; the user's "current state" wins.
  // Each setting follows the same pattern as ui:theme and ui:cvdMode:
  // a one-shot load effect on mount and a mountRef-guarded persist effect.
  // Hardcoded defaults stay unchanged for first-time users (no storage hit
  // means we keep the useState initial value). Skipped intentionally:
  // hueShiftStrength is per-palette (saved in the payload, default 1.0 per
  // palette); persisting it as a session pref would conflict with that role.

  // rampSize: persisted at ui:rampSize. Valid values 4..8.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:rampSize');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'number' && [4, 5, 6, 7, 8].includes(parsed)) {
            setRampSize(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, []);
  const rampSizeMountRef = useRef(false);
  useEffect(() => {
    if (!rampSizeMountRef.current) { rampSizeMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:rampSize', JSON.stringify(rampSize)); } catch {}
    })();
  }, [rampSize]);

  // Auto-open the visualization section when the user transitions from 1 to 2+
  // base colors, but never force it closed (user can collapse manually any time).
  // Auto-collapse rule for ramp cards: when baseColors grows (a base was
  // appended), collapse ONLY the newly-added indices IF the resulting total
  // is >=3. The original bases retain their current collapse state. On
  // length decrease, the existing shift logic inside removeRamp handles
  // re-keying; the threshold doesn't auto-expand anything. On wholesale
  // palette replace (Generate, AI, Classics, GPL import, image extract),
  // those code paths reset collapsedRamps directly so this effect doesn't
  // need a "replace" branch.
  const prevBaseLenRef = useRef(baseColors.length);
  useEffect(() => {
    const prev = prevBaseLenRef.current;
    const curr = baseColors.length;
    if (prev <= 1 && curr > 1) {
      setSbsOpen(true);
    }
    if (curr > prev && curr >= 3) {
      // Indices [prev, prev+1, ..., curr-1] are the newly-appended bases.
      setCollapsedRamps(existing => {
        const next = new Set(existing);
        for (let k = prev; k < curr; k++) next.add(k);
        return next;
      });
    }
    prevBaseLenRef.current = curr;
    if (harmonizeBaseline && harmonizeBaseline.length !== curr) setHarmonizeBaseline(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [baseColors.length]);

  // Close the pin editor if its target shade is no longer addressable. This
  // happens when the user shrinks rampSize while a pin editor is open on a
  // shade index >= the new size. The override itself stays (inert) in case
  // the user goes back to the larger size, but the editor pointing at an
  // invisible shade would be confusing.
  useEffect(() => {
    if (pinEditor && pinEditor.shadeIndex >= rampSize) {
      setPinEditor(null);
    }
    if (pinEditor && pinEditor.baseIndex >= baseColors.length) {
      setPinEditor(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [rampSize, baseColors.length, pinEditor]);

  // ---------- Saved palette storage helpers ----------
  // Storage layout:
  //   key `palettes:{slug}` -> JSON.stringify({ name, savedAt, baseColors,
  //     aiColorNames, rampSize, gplStyle, vizStyle, spriteKey,
  //     shuffleSeed, customSprites }) where customSprites is the FULL custom
  //     sprite library at save time. We snapshot the whole custom library so
  //     that loading a palette later restores any imported sprite it depended
  //     on, even if the user has since removed it. shuffleSeed is required to
  //     reproduce ramp jitter exactly on load (without it, loading the same
  //     palette twice produces visibly different ramps).
  // The slug is derived from the user-provided name; collisions overwrite by
  // design (load-then-save-with-same-name is "update this palette").
  const slugify = (name) => {
    return name.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  };

  // Refresh the in-memory savedPalettes index by listing storage keys and
  // pulling enough data out of each entry to render the list. We pull
  // baseColors so the list can show a small mosaic thumbnail; the rest of
  // the payload is fetched lazily when a palette is loaded.
  const refreshSavedPalettes = async () => {
    if (typeof window === 'undefined' || !window.storage) return;
    try {
      const listResult = await window.storage.list('palettes:');
      if (!listResult || !listResult.keys) { setSavedPalettes([]); return; }
      const entries = [];
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
      setSavedPalettes(entries);
    } catch (err) {
      console.error('refreshSavedPalettes failed', err);
      setSavedPalettes([]);
    }
  };

  // Load saved palettes once at mount. If storage is unavailable (e.g. running
  // outside the artifact sandbox), the list just stays empty and the panel
  // shows a clear notice.
  useEffect(() => {
    refreshSavedPalettes();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, []);

  // Cleanup the confirm-delete timer if the component unmounts mid-confirm.
  useEffect(() => {
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, []);

  // History watcher, ref-sync, and undo/redo keybinds now live in useHistory.
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
        setSbsLeftError(`Load failed: ${err && err.message ? err.message : 'unknown error'}`);
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
        setSbsRightError(`Load failed: ${err && err.message ? err.message : 'unknown error'}`);
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
      baseColors,
      rampSize,
      shuffleSeed,
      overrides,
      rampSizeOverrides,
      rampSatOverrides,
      rampShuffleOffsets,
      hiddenShades,
      hardwareLock,
      hueShiftStrength,
      hueShiftStrengthPerRamp, // per-ramp hue-shift overrides, mirror the main
                               // grid; without this viz/export/compare fall back
                               // to the global hueShiftStrength only (#37)
      lightnessCurvePerRamp,
      satCurvePerRamp,
      gamutPerRamp,
      stylePresets,
    };
  };
  // Build a classic-palette snapshot bundle. See the "classic:<id>" rule
  // in getSnapshotForSlot above for the policy.
  const buildClassicSnapshot = (classicId) => {
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
    };
  };
  const getSnapshotForSlot = (slot, cachedPayload) => {
    if (slot === null) return null;
    if (slot === 'working') return buildWorkingSnapshot();
    if (typeof slot === 'string' && slot.startsWith('classic:')) {
      return buildClassicSnapshot(slot.slice('classic:'.length));
    }
    return cachedPayload; // null while loading or on error
  };
  // Friendly display name for a slot, used in the column header.
  // Prefer the in-memory savedPalettes index over the cached payload's
  // `name` field: the index is updated immediately after rename, while
  // a cached payload that was loaded before rename still holds the old
  // name. The cached-payload `.name` is only the fallback for the brief
  // window where a slot was just picked but the index has not yet
  // refreshed (e.g. immediately after a save).
  const getSlotLabel = (slot, cachedPayload) => {
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
  // the live working palette. See the "sbsRemapSource" state block above
  // for the policy summary.
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
  const paletteFromSnapshotForRemap = (snapshot) => {
    const ramps = buildRampsForSnapshot(snapshot, vizStyle);
    if (!ramps || ramps.length === 0) return [];
    const seen = new Set();
    const out = [];
    for (const ramp of ramps) {
      for (const hex of ramp) {
        const k = hex.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(hex); }
      }
    }
    return out;
  };
  // Stable signature for a slot palette + dither, used as the useEffect
  // dependency for the per-slot remap. Same shape as buildRemapSignature.
  // Empty palette signals "do not run a remap" via the empty-palette
  // guard inside the effect.
  const buildSbsRemapKey = (palette, dither) => palette.length === 0
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
  // missing source -> clear the slot's output and bail. Heavy work
  // wrapped in setTimeout(..., 0) so the "Computing..." badge paints
  // before the synchronous remap begins, matching the main panel
  // pattern.
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
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const result = remapImageToPalette(sbsRemapSource, leftRemapPalette, { dither: remapDither });
        if (!cancelled) {
          setSbsLeftRemap(result);
          setSbsLeftRemapLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSbsLeftRemap(null);
          setSbsLeftRemapLoading(false);
        }
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
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
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const result = remapImageToPalette(sbsRemapSource, rightRemapPalette, { dither: remapDither });
        if (!cancelled) {
          setSbsRightRemap(result);
          setSbsRightRemapLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSbsRightRemap(null);
          setSbsRightRemapLoading(false);
        }
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbsRemapSource, rightRemapKey]);

  // History snapshot machinery (applyUndoSnapshot, undo/redo/jumpToHistoryIndex,
  // canUndo/canRedo) lives in useHistory. inferLabel lives in
  // ./lib/history-snapshot. undo/redo/jump/canUndo/canRedo are destructured from
  // the useHistory() call above.

  // Format a unix-ms timestamp as a short relative-time string for the
  // History panel. Resolution drops as ages grow: "just now" (<10s),
  // "Ns ago" (<60s), "Nm ago" (<60m), "Nh ago" (<24h), "Nd ago" beyond.
  // Recomputed each render based on Date.now() so entries age in place
  // when the panel is open (no setInterval needed; opening/closing the
  // panel and any other re-render refreshes the values).
  const formatHistoryAge = (timestamp) => {
    const ageSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (ageSec < 10) return 'just now';
    if (ageSec < 60) return `${ageSec}s ago`;
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 60) return `${ageMin}m ago`;
    const ageHr = Math.floor(ageMin / 60);
    if (ageHr < 24) return `${ageHr}h ago`;
    const ageDay = Math.floor(ageHr / 24);
    return `${ageDay}d ago`;
  };

  const saveCurrentPalette = async () => {
    setSavedError('');
    const trimmed = saveName.trim();
    if (!trimmed) { setSavedError('Please enter a name'); return; }
    if (typeof window === 'undefined' || !window.storage) {
      setSavedError('Storage is not available in this environment');
      return;
    }
    if (savedPalettes.length >= SAVED_PALETTE_LIMIT && !savedPalettes.some(p => p.name === trimmed)) {
      setSavedError(`Limit of ${SAVED_PALETTE_LIMIT} saved palettes reached. Delete one first.`);
      return;
    }
    const slug = slugify(trimmed);
    if (!slug) { setSavedError('Name must contain at least one letter or digit'); return; }
    const payload = {
      name: trimmed,
      savedAt: Date.now(),
      baseColors,
      aiColorNames,
      rampSize,
      gplStyle,
      vizStyle,
      spriteKey,
      shuffleSeed, // critical: ramps are deterministic only if we restore this exactly
      customSprites, // snapshot the full custom sprite library
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
      gamutPerRamp,
      advancedOpen,
      stylePresets,
      engineVersion: 2, // frozen constant: marks this as a v2 save so load() won't fire the migration notice (#70)
    };
    setSavedBusy(true);
    try {
      const result = await window.storage.set(`palettes:${slug}`, JSON.stringify(payload));
      if (!result) {
        setSavedError('Save failed (storage returned null)');
        setSavedBusy(false);
        return;
      }
      setSaveName('');
      setExportFeedback(`Saved as "${trimmed}"`);
      setTimeout(() => setExportFeedback(''), 2000);
      await refreshSavedPalettes();
    } catch (err) {
      console.error('saveCurrentPalette failed', err);
      setSavedError('Save failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  const loadPalette = async (slug) => {
    setSavedError('');
    if (typeof window === 'undefined' || !window.storage) {
      setSavedError('Storage is not available in this environment');
      return;
    }
    setSavedBusy(true);
    try {
      const got = await window.storage.get(`palettes:${slug}`);
      if (!got || !got.value) {
        setSavedError('Palette not found');
        return;
      }
      const parsed = JSON.parse(got.value);
      if (!parsed || !Array.isArray(parsed.baseColors) || parsed.baseColors.length === 0) {
        setSavedError('Palette data is invalid');
        return;
      }
      // Merge any saved custom sprites back in. We don't replace the current
      // custom library wholesale, since the user may have other sprites they
      // want to keep. New sprites from the snapshot only fill in gaps.
      if (parsed.customSprites && typeof parsed.customSprites === 'object') {
        setCustomSprites(prev => {
          const merged = { ...parsed.customSprites, ...prev };
          return merged;
        });
      }
      tagNextLabel(`Load: ${parsed.name || slug}`);
      setBaseColors(parsed.baseColors);
      setAiColorNames(Array.isArray(parsed.aiColorNames) ? parsed.aiColorNames : []);
      if ([4, 5, 6, 7, 8].includes(parsed.rampSize)) setRampSize(parsed.rampSize);
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
      if (isPreV2Palette(parsed)) setV2NoticePending(true);
      if (['punchy', 'balanced', 'muted'].includes(parsed.gplStyle)) setGplStyle(parsed.gplStyle);
      if (['punchy', 'balanced', 'muted'].includes(parsed.vizStyle)) setVizStyle(parsed.vizStyle);
      // Only restore the sprite key if it exists in the library after the merge above.
      if (parsed.spriteKey && (DEFAULT_SPRITE_LIBRARY[parsed.spriteKey] || (parsed.customSprites && parsed.customSprites[parsed.spriteKey]) || customSprites[parsed.spriteKey])) {
        setSpriteKey(parsed.spriteKey);
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
        const cleaned = {};
        for (const baseKey of Object.keys(parsed.overrides)) {
          const baseIdx = Number(baseKey);
          if (!Number.isInteger(baseIdx) || baseIdx < 0 || baseIdx >= parsed.baseColors.length) continue;
          const inner = parsed.overrides[baseKey];
          if (!inner || typeof inner !== 'object') continue;
          const cleanedInner = {};
          for (const shadeKey of Object.keys(inner)) {
            const shadeIdx = Number(shadeKey);
            if (!Number.isInteger(shadeIdx) || shadeIdx < 0) continue;
            const styleMap = inner[shadeKey];
            if (!styleMap || typeof styleMap !== 'object') continue;
            const cleanedStyles = {};
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
      // valid baseIndex, value must be 4..8. Drop anything that fails.
      if (parsed.rampSizeOverrides && typeof parsed.rampSizeOverrides === 'object' && !Array.isArray(parsed.rampSizeOverrides)) {
        const cleaned = {};
        for (const k of Object.keys(parsed.rampSizeOverrides)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const n = parsed.rampSizeOverrides[k];
          if ([4, 5, 6, 7, 8].includes(n)) cleaned[idx] = n;
        }
        setRampSizeOverrides(cleaned);
      } else {
        setRampSizeOverrides({});
      }
      // Restore per-ramp saturation multipliers. Validate: key in range,
      // value a finite number in [0.5, 2.0]. Out-of-range values are clamped.
      if (parsed.rampSatOverrides && typeof parsed.rampSatOverrides === 'object' && !Array.isArray(parsed.rampSatOverrides)) {
        const cleaned = {};
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
        const cleaned = {};
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
        const cleaned = {};
        for (const k of Object.keys(parsed.hiddenShades)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const arr = parsed.hiddenShades[k];
          if (!Array.isArray(arr)) continue;
          const validIndices = [];
          const seen = new Set();
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
        const cleaned = {};
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
        const validIdx = new Set();
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
      const migratedLightness = {};
      if (parsed.lightnessCurvePerRamp && typeof parsed.lightnessCurvePerRamp === 'object') {
        Object.assign(migratedLightness, parsed.lightnessCurvePerRamp);
      } else if (parsed.curvePerRamp && typeof parsed.curvePerRamp === 'object') {
        for (const [id, val] of Object.entries(parsed.curvePerRamp)) {
          migratedLightness[id] = typeof val === 'string' ? presetToPoints(val) : val;
        }
      }
      setLightnessCurvePerRamp(migratedLightness);
      setSatCurvePerRamp(parsed.satCurvePerRamp && typeof parsed.satCurvePerRamp === 'object' ? parsed.satCurvePerRamp : {});
      setGamutPerRamp(parsed.gamutPerRamp && typeof parsed.gamutPerRamp === 'object' ? parsed.gamutPerRamp : {});
      setAdvancedOpen(parsed.advancedOpen && typeof parsed.advancedOpen === 'object' ? parsed.advancedOpen : {});
      const sp = parsed.stylePresets;
      const validPreset = (x) => x && typeof x.reach === 'number' && typeof x.chromaFalloff === 'number';
      setStylePresets(
        sp && validPreset(sp.punchy) && validPreset(sp.balanced) && validPreset(sp.muted)
          ? { punchy: sp.punchy, balanced: sp.balanced, muted: sp.muted }
          : DEFAULT_STYLE_PRESETS
      );
      setExportFeedback(`Loaded "${parsed.name || slug}"`);
      setTimeout(() => setExportFeedback(''), 2000);
    } catch (err) {
      console.error('loadPalette failed', err);
      setSavedError('Load failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  // Load a built-in classic palette. Unlike loadPalette this doesn't touch
  // storage; the source is the CLASSIC_PALETTES constant.
  // shuffleSeed resets to 0 so the ramps are deterministic and don't
  // depend on whatever shuffle the user happened to be on.
  const loadClassicPalette = (classic) => {
    if (!classic || !Array.isArray(classic.baseColors) || classic.baseColors.length === 0) return;
    tagNextLabel(`Load classic: ${classic.name}`);
    setBaseColors(classic.baseColors);
    setAiColorNames(classic.names || classic.baseColors.map((_, i) => `${classic.name} ${i + 1}`));
    resetPaletteState();
    // Classics weren't designed for any specific hardware constraint. Clear
    // any active lock so the loaded classic renders as-authored.
    setHardwareLock(null);
    setShuffleSeed(0);
    setExportFeedback(`Loaded "${classic.name}"`);
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // GPL import: a .gpl file is parsed, and if successful the user is shown
  // a modal that lets them choose between "use all N colors as bases"
  // (capped at 16, truncated if longer) and "auto-pick representatives"
  // (subset down to ~5 mid-lightness, evenly spaced by hue).
  // gplImport state shape: { name, colors, error } | null
  //   - name: palette name pulled from the file (cosmetic)
  //   - colors: full array of parsed hex strings (used for the "all" branch)
  //   - error: present if parsing failed and the modal should show an error
  const [gplImport, setGplImport] = useState(null);

  const handleGplFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
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
  const applyGplImport = (mode) => {
    if (!gplImport || gplImport.error || gplImport.colors.length === 0) return;
    let chosen;
    if (mode === 'subset') {
      chosen = subsetGplColors(gplImport.colors);
    } else {
      // 'all' branch: dedupe and hard-cap at 16.
      const seen = new Set();
      const uniq = [];
      for (const hex of gplImport.colors) {
        const n = hex.toLowerCase();
        if (!seen.has(n)) { seen.add(n); uniq.push(n); }
        if (uniq.length >= 16) break;
      }
      chosen = uniq;
    }
    if (chosen.length === 0) return;
    tagNextLabel(`Import GPL: ${gplImport.name}`);
    setBaseColors(chosen);
    setAiColorNames(chosen.map((_, i) => `${gplImport.name} ${i + 1}`));
    resetPaletteState();
    setHardwareLock(null);
    setShuffleSeed(0);
    setGplImport(null);
    const note = mode === 'subset' ? `Imported ${chosen.length} representatives from ${gplImport.colors.length}` : `Imported ${chosen.length}${gplImport.colors.length > chosen.length ? ` (truncated from ${gplImport.colors.length}, cap is 16)` : ''}`;
    setExportFeedback(note);
    setTimeout(() => setExportFeedback(''), 3500);
  };

  // Toggle a single ramp card's collapse state. When collapsing a card
  // whose base editor or pin editor is currently open, close those too
  // since they reference shades that are about to be hidden.
  const toggleRampCollapse = (index) => {
    setCollapsedRamps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        if (editingIndex === index) setEditingIndex(null);
        if (pinEditor && pinEditor.baseIndex === index) setPinEditor(null);
      }
      return next;
    });
  };

  // Bulk collapse/expand: if ANY card is currently expanded, collapse all.
  // Otherwise expand all. This makes the button label predictable: it always
  // does the action that affects the visible majority. Collapsing also
  // closes any open base or pin editors.
  const anyRampExpanded = baseColors.some((_, i) => !collapsedRamps.has(i));
  const toggleAllRampsCollapse = () => {
    if (anyRampExpanded) {
      setCollapsedRamps(new Set(baseColors.map((_, i) => i)));
      setEditingIndex(null);
      setPinEditor(null);
    } else {
      setCollapsedRamps(new Set());
    }
  };

  // toggleHardwareLock: switches the hardware lock on/off. If already locked
  // to the given hardware, clicking again unlocks. If locked to a different
  // hardware, switches the lock target. Setting the lock is NON-destructive:
  // baseColors and overrides are preserved as-is. The lock is applied at
  // render time via the hardware-snap step in buildRamp (ramp-pipeline.ts).
  // This means unlocking restores the full free-generation ramps without
  // data loss.
  //
  // Pin overrides ARE retained while locked but get snapped on output via
  // the order of operations in buildRamp (overrides run first, then the
  // hardware snap covers everything including the pinned hex).
  // This was a deliberate choice: clearing pins on lock would force the
  // user to re-pin every time they toggled. Instead, pinned hexes get
  // visually snapped while locked and reappear as the user's chosen hex
  // when unlocked.
  const toggleHardwareLock = (hardwareId) => {
    if (hardwareLock === hardwareId) {
      tagNextLabel('Unlock hardware');
      setHardwareLock(null);
      setExportFeedback(`Unlocked from hardware`);
    } else {
      const hw = HARDWARE_PALETTES.find(h => h.id === hardwareId);
      tagNextLabel(hw ? `Lock to ${hw.name}` : 'Lock hardware');
      setHardwareLock(hardwareId);
      setExportFeedback(hw ? `Locked to ${hw.name}` : 'Locked');
    }
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // bakeHardwareLock: convert the currently-snapped output into permanent
  // pins so the user can keep editing without reverting to non-legal hexes.
  //
  // Strategy (the "diff-only" option from the analysis): for each
  // (base, shade, style), compute the post-pin pre-snap value `withPins`
  // and the post-snap value `snapped`. Pin the (base, shade, style) only
  // when snapped !== withPins. This minimizes pin bloat: shades the lock
  // wouldn't have changed are left procedural so future tweaks
  // (rampSize, hue shift, base color edits, sat multiplier) still affect
  // them naturally. Shades the lock DID change become permanent pins.
  //
  // Existing pins on shades the lock would NOT have changed are preserved
  // verbatim. Existing pins on shades the lock WOULD have changed get
  // REPLACED with the snapped value (because the user was looking at the
  // snapped output anyway; preserving the unsnapped pin would silently
  // un-bake that one shade).
  //
  // Per-style independence: a pin in (i, j, 'punchy') doesn't affect
  // (i, j, 'balanced'). Each style is baked independently.
  //
  // Dedup note: buildRamp's hardware snap dedupes consecutive duplicates for
  // DISPLAY, but bake pins by the pre-dedup shade index (every slot of
  // the full ramp). After unlocking, an 8-shade ramp on Game Boy will
  // show 8 slots with consecutive duplicates rather than the 4-color
  // deduped view. To get the deduped view back, use hidden shades.
  // Trade-off: the pin grid stays slot-aligned with the rest of the app.
  //
  // Clears hardwareLock to null after writing pins, since the same hexes
  // are now baked in. History entry tagged 'Bake hardware lock'.
  const bakeHardwareLock = () => {
    if (!activeHardware) return;
    tagNextLabel('Bake hardware lock');
    const STYLES = ['punchy', 'balanced', 'muted'];
    setOverrides(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      for (let i = 0; i < baseColors.length; i++) {
        const effBase = resolveBaseForRamp(baseColors[i], i);
        const effSize = resolveSizeForRamp(i);
        for (const style of STYLES) {
          const raw = generateRamp(effBase, effSize, style, hueShiftStrength, i);
          const withPins = applyOverrides(raw, i, prev, style);
          const snapped = withPins.map(hex => quantizeToHardware(hex, activeHardware));
          for (let j = 0; j < withPins.length; j++) {
            if (snapped[j] !== withPins[j]) {
              if (!next[i]) next[i] = {};
              if (!next[i][j]) next[i][j] = {};
              next[i][j][style] = snapped[j];
            }
          }
        }
      }
      return next;
    });
    setHardwareLock(null);
    setExportFeedback('Baked hardware lock into pins');
    setTimeout(() => setExportFeedback(''), 2500);
  };

  // Escape closes the topmost dismissable thing. Priority order is
  // outer-to-inner: a modal sitting over everything closes first, then
  // editor panels, then the floating WCAG Check picker. Skipping
  // editable-focus is intentional (same reasoning as the undo handler):
  // hitting Esc mid-typing should not surprise the user by closing a
  // surrounding panel. Users dismiss editors from inside their inputs
  // via the existing Close/Done buttons.
  //
  // Placement note: this useEffect must come AFTER all four pieces of
  // state it reads (`gplImport`, `pinEditor`, `editingIndex`,
  // `compareMode`) are declared. `gplImport` is the latest at ~3440.
  // An earlier placement throws "Cannot access 'gplImport' before
  // initialization" when React evaluates the dependency array during
  // render (temporal dead zone on the `const` from `useState`).
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      if (gplImport) {
        e.preventDefault();
        setGplImport(null);
        return;
      }
      if (pinEditor) {
        e.preventDefault();
        setPinEditor(null);
        return;
      }
      if (editingIndex !== null) {
        e.preventDefault();
        setEditingIndex(null);
        return;
      }
      if (compareMode) {
        e.preventDefault();
        setCompareMode(false);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [gplImport, pinEditor, editingIndex, compareMode]);

  // KEYBOARD SHORTCUTS: S, H
  //
  //   S - Focus the Save palette name input and scroll it into view.
  //   H - Harmonize. The harmonize() helper has its own internal guards
  //       (returns early with a feedback toast if base count < 2 or no
  //       unlocked targets), so we forward unconditionally.
  //
  // G previously triggered Generate. Removed because after the
  // session 2 followup, Generate was renamed to "New palette" and
  // downgraded to a secondary action since it's destructive (wipes
  // pins, hidden shades, locks, anchor, side-by-side slots). A
  // single-key shortcut for an unconfirmed destructive operation is
  // a footgun, especially when the renamed button no longer maps to
  // the letter "G." If a shortcut for the primary Add base action
  // is wanted later, "A" is the obvious candidate.
  //
  // Bare letter keys (no Cmd/Ctrl). Same editable-focus guard as the
  // undo/Escape handlers so the shortcuts don't fire while the user is
  // typing in any input or textarea. No Shift, Alt, or modifier required;
  // gated to plain key strokes so keyboard navigation with modifiers
  // (e.g. browser Find: Cmd+H, Cmd+S) is not affected.
  //
  // Placement: must be AFTER `gplImport`'s state declaration (same TDZ
  // constraint as the Escape handler at line ~3570). `harmonize` declares
  // earlier in the component body.
  useEffect(() => {
    const handler = (e) => {
      // Modifier-gated keys are claimed by the browser or by the existing
      // undo handler. Only fire on plain letter presses.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Skip when typing in any input or textarea so the letter lands in
      // the field, not the shortcut.
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      // Don't intercept while a modal or editor is open. Esc dismisses
      // those; layering shortcuts on top would be surprising.
      if (gplImport || pinEditor || editingIndex !== null) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        const node = saveNameInputRef.current;
        if (node) {
          // scrollIntoView with smooth + center keeps the save panel visible
          // even when the user pressed S from way up the page.
          try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
          node.focus();
        }
      } else if (key === 'h') {
        e.preventDefault();
        harmonize();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [baseColors, lockedRamps, safeAnchor, gplImport, pinEditor, editingIndex]);
  // Dep array notes: `baseColors`, `lockedRamps`, and `safeAnchor` are
  // what harmonize reads directly (the H shortcut). `gplImport` /
  // `pinEditor` / `editingIndex` gate both shortcuts (modal-open
  // suppression). The S shortcut only reads from a ref, so it adds no
  // deps. Everything else the handlers touch is via setters (which
  // always see fresh state) or refs (which sidestep closures). If you
  // add a new shortcut whose action function reads more state, add
  // those reads here too.

  // Two-click delete: first click arms the slug, second click within 3s commits.
  const requestDeletePalette = (slug) => {
    if (confirmDeleteSlug === slug) {
      // Second click: commit.
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
      deletePalette(slug);
      return;
    }
    setConfirmDeleteSlug(slug);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmDeleteSlug(null);
      confirmTimerRef.current = null;
    }, 3000);
  };

  const deletePalette = async (slug) => {
    setSavedError('');
    setConfirmDeleteSlug(null);
    if (typeof window === 'undefined' || !window.storage) {
      setSavedError('Storage is not available in this environment');
      return;
    }
    setSavedBusy(true);
    try {
      await window.storage.delete(`palettes:${slug}`);
      await refreshSavedPalettes();
    } catch (err) {
      console.error('deletePalette failed', err);
      setSavedError('Delete failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  // Rename a saved palette in place. Strategy A: only the user-visible
  // `name` field in the payload changes; the storage key (slug) stays the
  // same. This is simpler than re-slugging (no conflict handling, no
  // set+delete window) and the slug is never visible to the user. The
  // tradeoff is that the slug may no longer match the name if the user
  // inspects storage directly. Acceptable since storage inspection is not
  // a feature.
  const startRename = (slug, currentName) => {
    if (confirmDeleteSlug) {
      setConfirmDeleteSlug(null);
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    }
    setRenamingSlug(slug);
    setRenameDraft(currentName || '');
    setRenameError('');
  };
  const cancelRename = () => {
    setRenamingSlug(null);
    setRenameDraft('');
    setRenameError('');
  };
  const commitRename = async (slug) => {
    setRenameError('');
    const trimmed = renameDraft.trim();
    if (!trimmed) { setRenameError('Name cannot be empty'); return; }
    // No-op if name is unchanged. The current name lives in savedPalettes;
    // look it up rather than passing it in so a stale draft (e.g. caps
    // changes only) still cleanly no-ops.
    const existing = savedPalettes.find(p => p.slug === slug);
    if (existing && existing.name === trimmed) { cancelRename(); return; }
    // Reject if another saved palette already uses this exact display name.
    if (savedPalettes.some(p => p.slug !== slug && p.name === trimmed)) {
      setRenameError('Another palette already uses this name');
      return;
    }
    if (typeof window === 'undefined' || !window.storage) {
      setRenameError('Storage is not available in this environment');
      return;
    }
    setSavedBusy(true);
    try {
      const got = await window.storage.get(`palettes:${slug}`);
      if (!got || !got.value) {
        setRenameError('Palette not found in storage');
        setSavedBusy(false);
        return;
      }
      const parsed = JSON.parse(got.value);
      if (!parsed || typeof parsed !== 'object') {
        setRenameError('Palette data is invalid');
        setSavedBusy(false);
        return;
      }
      parsed.name = trimmed;
      const result = await window.storage.set(`palettes:${slug}`, JSON.stringify(parsed));
      if (!result) {
        setRenameError('Rename failed (storage returned null)');
        setSavedBusy(false);
        return;
      }
      await refreshSavedPalettes();
      cancelRename();
    } catch (err) {
      console.error('commitRename failed', err);
      setRenameError('Rename failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  const copyHex = async (hex) => {
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(hex); success = true; } catch {}
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = hex;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setCopiedHex(success ? hex : 'FAIL:' + hex);
    setTimeout(() => setCopiedHex(null), success ? 1000 : 1500);
  };

  const buildPaletteText = () => {
    const lines = ['# PIXEL.PAL Palette Export', `# Generated ${new Date().toLocaleString()}`, ''];

    baseColors.forEach((_, i) => {
      const name = aiColorNames[i] || `Color ${i + 1}`;
      const punchy = rampsPunchy[i];
      const balanced = rampsBalanced[i];
      const muted = rampsMuted[i];
      // Compute per-style labels: each style ramp may have its own base
      // position after sort (because the style curves can clamp shades
      // around the base differently). The effective base hex is the
      // input baseColors[i] post sat-override (resolveBaseForRamp).
      const effectiveBase = resolveBaseForRamp(baseColors[i], i);
      const labelsP = labelsForRamp(punchy, effectiveBase);
      const labelsB = labelsForRamp(balanced, effectiveBase);
      const labelsM = labelsForRamp(muted, effectiveBase);
      const fP = filterHidden(punchy, labelsP, i);
      const fB = filterHidden(balanced, labelsB, i);
      const fM = filterHidden(muted, labelsM, i);
      lines.push(`## ${name}`);
      lines.push('### Punchy');
      fP.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fP.labels[k]}`));
      lines.push('### Balanced');
      fB.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fB.labels[k]}`));
      lines.push('### Muted');
      fM.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fM.labels[k]}`));
      lines.push('');
    });
    lines.push('## Harmony Colors');
    lines.push(`${harmony.complementary.toUpperCase()}  complementary`);
    lines.push(`${harmony.analogous1.toUpperCase()}  analogous 1`);
    lines.push(`${harmony.analogous2.toUpperCase()}  analogous 2`);
    lines.push(`${harmony.triadic1.toUpperCase()}  triadic 1`);
    lines.push(`${harmony.triadic2.toUpperCase()}  triadic 2`);
    lines.push(`${harmony.splitComp1.toUpperCase()}  split-complementary 1`);
    lines.push(`${harmony.splitComp2.toUpperCase()}  split-complementary 2`);
    lines.push(`${harmony.tetradic1.toUpperCase()}  tetradic 1`);
    lines.push(`${harmony.tetradic2.toUpperCase()}  tetradic 2`);
    lines.push(`${harmony.tetradic3.toUpperCase()}  tetradic 3`);
    lines.push(`${harmony.square1.toUpperCase()}  square 1`);
    lines.push(`${harmony.square2.toUpperCase()}  square 2`);
    lines.push(`${harmony.square3.toUpperCase()}  square 3`);
    // Unique-colors appendix: a flat deduped list across every ramp and
    // every style, plus harmony. Useful for tools that want a single
    // copy-paste list and for verifying total unique count at a glance.
    lines.push('');
    lines.push('## Unique Colors');
    const allStyleHexes = [
      ...rampsPunchy.flat(),
      ...rampsBalanced.flat(),
      ...rampsMuted.flat(),
      harmony.complementary,
      harmony.analogous1, harmony.analogous2,
      harmony.triadic1, harmony.triadic2,
      harmony.splitComp1, harmony.splitComp2,
      harmony.tetradic1, harmony.tetradic2, harmony.tetradic3,
      harmony.square1, harmony.square2, harmony.square3,
    ];
    const uniqueColors = dedupeHexes(allStyleHexes);
    uniqueColors.forEach(hex => lines.push(hex.toUpperCase()));
    lines.push(`# ${uniqueColors.length} unique colors`);
    return lines.join('\n');
  };

  const exportPalette = async () => {
    const text = buildPaletteText();
    return await saveFile({
      defaultName: 'pixel-pal-palette.txt',
      filters: [{ name: 'Pixel Pal palette', extensions: ['txt'] }],
      data: { text },
      folderKey: 'txt',
    });
  };

  // Export the working palette's Lightness Distribution strip as a flat-color
  // PNG. Mirrors the on-screen view: same slot snapshot (sbsLeft) and current
  // vizStyle, same computeVizData derivation.
  const exportLightnessPng = async (snap) => {
    try {
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { sortedByL } = computeVizData(ramps);
      if (sortedByL.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawLightnessStripPng(sortedByL);
      const result = await saveFile({
        defaultName: 'pixel-pal-lightness.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) setExportFeedback('Save canceled');
      else if (!result.ok) setExportFeedback('Failed to save PNG');
      else setExportFeedback('Downloaded!');
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed to export PNG');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  // Export the working palette's Mosaic as a flat-color PNG. Faithful to the
  // on-screen layout: one row per (deduped, non-empty) ramp, each row full width.
  const exportMosaicPng = async (snap) => {
    try {
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r) => r.hexes);
      if (rows.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawMosaicPng(rows);
      const result = await saveFile({
        defaultName: 'pixel-pal-mosaic.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) setExportFeedback('Save canceled');
      else if (!result.ok) setExportFeedback('Failed to save PNG');
      else setExportFeedback('Downloaded!');
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed to export PNG');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  // Export the Slot-A adjacency matrix as a PNG, mirroring the on-screen
  // matrix (current vizStyle, color-set, and view-mode toggles).
  const exportMatrixPng = async (snap) => {
    try {
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { allColors } = computeVizData(ramps);
      // Raw bases = one swatch per ramp, matching the on-screen matrix and the
      // spec ("one swatch per ramp"). Do NOT dedupe: two ramps sharing a base
      // should render as a 0-ΔE off-diagonal cell, that's the bases view's point.
      const colors = matrixColorSet === 'bases'
        ? (Array.isArray(snap?.baseColors) ? snap.baseColors : [])
        : allColors;
      if (colors.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawAdjacencyMatrixPng(colors, { view: matrixView });
      const result = await saveFile({
        defaultName: 'pixel-pal-adjacency.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) setExportFeedback('Save canceled');
      else if (!result.ok) setExportFeedback('Failed to save PNG');
      else setExportFeedback('Downloaded!');
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed to export PNG');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  // Export the Slot-A dither-blend preview as a PNG (current vizStyle + pattern).
  const exportDitherPng = async (snap) => {
    try {
      const ramps = buildRampsForSnapshot(snap, vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r) => r.hexes);
      if (rows.length === 0) {
        setExportFeedback('Nothing to export');
        setTimeout(() => setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawDitherBlendPng(rows, { pattern: ditherPattern });
      const result = await saveFile({
        defaultName: 'pixel-pal-dither.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) setExportFeedback('Save canceled');
      else if (!result.ok) setExportFeedback('Failed to save PNG');
      else setExportFeedback('Downloaded!');
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed to export PNG');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  const copyPaletteToClipboard = async () => {
    const text = buildPaletteText();
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); success = true; } catch {}
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setExportFeedback(success ? 'Copied!' : 'Copy failed');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Gather the full palette entry list for a style: every ramp's visible shades
  // (named "<color> <slot>"), then the harmony colors, then dedup by hex.
  // SINGLE SOURCE consumed by every palette-file format so they cannot drift.
  const collectPaletteEntries = (style) => {
    const entries = [];
    const ramps = style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;
    baseColors.forEach((_, i) => {
      const name = aiColorNames[i] || `Color ${i + 1}`;
      const ramp = ramps[i];
      const effectiveBase = resolveBaseForRamp(baseColors[i], i);
      const labels = labelsForRamp(ramp, effectiveBase);
      const filtered = filterHidden(ramp, labels, i);
      filtered.hexes.forEach((hex, k) => entries.push({ hex, name: `${name} ${filtered.labels[k]}` }));
    });
    entries.push({ hex: harmony.complementary, name: 'harmony complementary' });
    entries.push({ hex: harmony.analogous1, name: 'harmony analogous 1' });
    entries.push({ hex: harmony.analogous2, name: 'harmony analogous 2' });
    entries.push({ hex: harmony.triadic1, name: 'harmony triadic 1' });
    entries.push({ hex: harmony.triadic2, name: 'harmony triadic 2' });
    entries.push({ hex: harmony.splitComp1, name: 'harmony split-comp 1' });
    entries.push({ hex: harmony.splitComp2, name: 'harmony split-comp 2' });
    entries.push({ hex: harmony.tetradic1, name: 'harmony tetradic 1' });
    entries.push({ hex: harmony.tetradic2, name: 'harmony tetradic 2' });
    entries.push({ hex: harmony.tetradic3, name: 'harmony tetradic 3' });
    entries.push({ hex: harmony.square1, name: 'harmony square 1' });
    entries.push({ hex: harmony.square2, name: 'harmony square 2' });
    entries.push({ hex: harmony.square3, name: 'harmony square 3' });

    const seenHex = new Set();
    const unique = [];
    for (const e of entries) {
      const key = (e.hex || '').toLowerCase();
      if (!key || seenHex.has(key)) continue;
      seenHex.add(key);
      unique.push(e);
    }
    return unique;
  };

  const buildPaletteGpl = (style) => {
    const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
    return buildGpl(collectPaletteEntries(style), { paletteName: `PIXEL.PAL ${styleLabel}`, columns: rampSize });
  };

  const exportPaletteGpl = async () => {
    const text = buildPaletteGpl(gplStyle);
    return await saveFile({
      defaultName: `pixel-pal-${gplStyle}.gpl`,
      filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
      data: { text },
      folderKey: 'gpl',
    });
  };

  const exportPalettePal = async () => {
    const text = buildJascPal(collectPaletteEntries(gplStyle));
    return await saveFile({
      defaultName: `pixel-pal-${gplStyle}.pal`,
      filters: [{ name: 'JASC palette', extensions: ['pal'] }],
      data: { text },
      folderKey: 'pal',
    });
  };

  const exportPaletteAse = async () => {
    const bytes = buildAse(collectPaletteEntries(gplStyle));
    return await saveFile({
      defaultName: `pixel-pal-${gplStyle}.ase`,
      filters: [{ name: 'Adobe Swatch Exchange', extensions: ['ase'] }],
      data: { bytes },
      folderKey: 'ase',
    });
  };

  const exportPaletteStripPng = async () => {
    const rows = baseColors.map((_, i) => _filteredRamp(i, gplStyle).hexes);
    const blob = await drawPaletteStripPng(rows, 32);
    return await saveFile({
      defaultName: `pixel-pal-${gplStyle}-strip.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      data: { bytes: blob },
      folderKey: 'png',
    });
  };

  // Runs whichever export the format dropdown selects, then centralizes the
  // success/cancel/fail feedback and records the saved path for "Reveal".
  const exportActiveFormat = async () => {
    const runner =
      exportFormat === 'txt' ? exportPalette :
      exportFormat === 'pal' ? exportPalettePal :
      exportFormat === 'ase' ? exportPaletteAse :
      exportFormat === 'png-strip' ? exportPaletteStripPng :
      exportPaletteGpl;
    try {
      const result = await runner();
      if (result?.canceled) { setExportFeedback('Save canceled'); }
      else if (!result?.ok) { setExportFeedback('Export failed'); }
      else {
        setExportFeedback('Downloaded!');
        if (result.path) setLastSavedPath(result.path);
      }
    } catch {
      setExportFeedback('Export failed');
    }
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Desktop only: open the OS file manager with the last exported file selected.
  // Requires the opener:allow-reveal-item-in-dir capability (see capabilities/default.json).
  const revealLastSaved = async () => {
    if (!lastSavedPath) return;
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(lastSavedPath);
    } catch {
      setExportFeedback("Couldn't open folder");
      setTimeout(() => setExportFeedback(''), 2000);
    }
  };

  // PER-RAMP EXPORT HELPERS
  //
  // Both return strings derived from a single ramp at index `i` rendered
  // in `style` (one of punchy/balanced/muted). They mirror the same
  // pipeline as the full-palette exporters: resolve effective base,
  // compute per-ramp labels (so 'base' lands on the right slot when
  // style curves shift it off slot N/2), and filter out hidden shades.
  //
  // buildSingleRampText: plain hex list, one per line, lowercase #rrggbb.
  // buildSingleRampGpl: canonical GIMP format scoped to one ramp.
  //
  // Style is passed explicitly rather than read from state so callers
  // can decide which style to export (the UI passes vizStyle, which is
  // what the user is actively viewing).
  const _selectRampsForStyle = (style) =>
    style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;

  const _filteredRamp = (i, style) => {
    const ramps = _selectRampsForStyle(style);
    const ramp = ramps[i];
    const effectiveBase = resolveBaseForRamp(baseColors[i], i);
    const labels = labelsForRamp(ramp, effectiveBase);
    return filterHidden(ramp, labels, i);
  };

  const buildSingleRampText = (i, style) => {
    const filtered = _filteredRamp(i, style);
    return dedupeHexes(filtered.hexes).join('\n') + '\n';
  };

  const buildSingleRampGpl = (i, style) => {
    const filtered = _filteredRamp(i, style);
    const name = aiColorNames[i] || `Color ${i + 1}`;
    // Dedupe by hex, keep the first label encountered. Hardware-locked ramps
    // collapse to fewer unique colors than positions; GPL consumers expect
    // unique entries.
    const seenHex = new Set();
    const entries = [];
    for (let k = 0; k < filtered.hexes.length; k++) {
      const key = (filtered.hexes[k] || '').toLowerCase();
      if (!key || seenHex.has(key)) continue;
      seenHex.add(key);
      entries.push({ hex: filtered.hexes[k], label: filtered.labels[k] });
    }
    const pad3 = (n) => String(n).padStart(3, ' ');
    const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
    const lines = [
      'GIMP Palette',
      `Name: PIXEL.PAL ${name} ${styleLabel}`,
      `Columns: ${entries.length}`,
      '#',
    ];
    entries.forEach(({ hex, label }) => {
      const { r, g, b } = hexToRgb(hex);
      lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name} ${label}`);
    });
    return lines.join('\n') + '\n';
  };

  // Per-ramp clipboard copy. Reuses the two-tier pattern from
  // copyPaletteToClipboard (Clipboard API first, textarea + execCommand
  // fallback for older surfaces / non-secure contexts). Reads
  // rampExportStyle, which is independent of the Visualization vizStyle
  // setting (see state declaration around line 1190 for rationale).
  const copyRampToClipboard = async (i) => {
    const text = buildSingleRampText(i, rampExportStyle);
    const count = text.trim().split('\n').length;
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); success = true; } catch {}
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setExportFeedback(success ? `Copied ${count} shade${count === 1 ? '' : 's'}` : 'Copy failed');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Per-ramp .gpl download. File naming: pixel-pal-ramp-{i+1}-{style}.gpl
  // (the per-ramp index plus the active rampExportStyle, so multiple
  // downloads in a session don't collide). One-based to match how the
  // user sees ramps (Color 1, Color 2, ...). Reads rampExportStyle, NOT
  // vizStyle (the Visualization panel's style); see state declaration
  // for rationale.
  const downloadSingleRampGpl = async (i) => {
    try {
      const text = buildSingleRampGpl(i, rampExportStyle);
      const defaultName = `pixel-pal-ramp-${i + 1}-${rampExportStyle}.gpl`;
      const result = await saveFile({
        defaultName,
        filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
        data: { text },
        folderKey: 'gpl',
        silentToFolder: sessionRampGplFolder,
      });
      if (result.canceled) {
        setExportFeedback('Save canceled');
      } else if (!result.ok) {
        if (sessionRampGplFolder) {
          setSessionRampGplFolder(null);
          setExportFeedback('Folder unavailable, pick a new one');
        } else {
          setExportFeedback('Ramp GPL export failed');
        }
      } else {
        if (result.folder && result.folder !== sessionRampGplFolder) {
          setSessionRampGplFolder(result.folder);
        }
        if (sessionRampGplFolder && result.folder) {
          setExportFeedback(`Saved ramp ${i + 1}.gpl to ${result.folder}`);
        } else {
          setExportFeedback(`Downloaded ramp ${i + 1}.gpl`);
        }
      }
      setTimeout(() => setExportFeedback(''), 2500);
    } catch {
      setExportFeedback('Ramp GPL export failed');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };


  // Theme token map. Centralizes every theme-aware className and color
  // value used by the chrome. The principle: section accent hues
  // (cyan/pink/yellow/green/purple) stay recognizable across all three
  // themes, but their lightness/saturation are adjusted so they remain
  // legible against the corresponding background and don't vibrate.
  //
  // Color data (swatches, sprites, harmony swatches, mosaic, chromatic plot
  // dots) is NEVER themed because those are the data being judged. Only
  // chrome adapts.
  //
  // Each token returns a Tailwind className string or a raw CSS value. We
  // use raw values for inline styles where we need rgba alpha or computed
  // shadows that Tailwind can't easily express.
  const themeTokens = {
    dark: {
      pageBg: 'linear-gradient(180deg, #1a0033 0%, #2d0052 30%, #ff006e 100%)',
      showVaporwave: true,
      crtIntensity: 'rgba(0,0,0,0.15)',
      cardBgCyan: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(45, 0, 82, 0.85) 100%)',
      cardBgPink: 'linear-gradient(135deg, rgba(255, 0, 110, 0.3) 0%, rgba(45, 0, 82, 0.85) 100%)',
      cardBgPinkBright: 'linear-gradient(135deg, rgba(45, 0, 82, 0.85) 0%, rgba(255, 0, 110, 0.4) 100%)',
      cardBgYellow: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(80, 0, 120, 0.5) 100%)',
      cardBgGreen: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(0, 80, 80, 0.5) 100%)',
      cardBgViz: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(80, 0, 120, 0.5) 100%)',
      titleGlow: '3px 3px 0 #ff006e, 6px 6px 0 #00ffff, 9px 9px 20px rgba(255, 0, 255, 0.5)',
      titleColor: '#ffffff',
      subtitleColor: '#67e8f9',
      subtitleGlow: '0 0 8px #00ffff',
      glowStrong: 1.0,
      bodyText: 'text-cyan-200',
      mutedText: 'text-cyan-100/80',
      inputBg: 'bg-black/60',
      inputTextCyan: 'text-cyan-200',
      inputTextPink: 'text-pink-200',
      inputTextYellow: 'text-yellow-100',
      // Control button tokens (controlBtnDefault / controlBtnHover):
      // Tailwind className strings for the UNSELECTED state of segmented-
      // control buttons (Shades, Preview Sprite, Ramp Export style, etc).
      // Applied as `${t.controlBtnDefault} ${t.controlBtnHover}` together.
      // The SELECTED state is hardcoded `bg-cyan-300 text-purple-900
      // border-cyan-100` at every callsite and works across themes
      // unchanged. Earlier versions hardcoded `bg-purple-900/60 text-cyan-
      // 200 border-purple-700/50 hover:bg-purple-800/60`; this is fine on
      // dark but reads as dark-purple islands floating on gray / cream
      // backgrounds in Neutral and Light. Centralized here.
      controlBtnDefault: 'bg-purple-900/60 text-cyan-200 border-purple-700/50',
      controlBtnHover: 'hover:bg-purple-800/60',
      // controlPanelBg: backing for the container that wraps a group of
      // segmented control buttons (e.g. the small rounded box around the
      // Ramp Export Punchy/Balanced/Muted toggle). Same theme-adaptation
      // rationale as controlBtnDefault.
      controlPanelBg: 'bg-purple-900/40',
      controlPanelBorder: 'border-cyan-700/50',
      // Alert / info box tokens. The pre-token codebase used patterns
      // like `bg-cyan-900/20 text-cyan-200` for info boxes (computing,
      // confirm-required, etc), `bg-yellow-900/20 text-yellow-200` for
      // warnings, and `bg-pink-900/30 text-pink-100` / `bg-red-900/30
      // text-red-100` for vision text and errors. These dark-color-over-
      // dark-bg patterns produce <2:1 contrast on Light theme because the
      // alpha lets the cream pageBg show through; the dark text on the
      // resulting muddy-tan composite is unreadable. Tokens below give
      // each theme a readable equivalent: Dark keeps the original
      // dark-color-tint look, Neutral and Light flip to light tint with
      // dark text.
      alertInfoBg: 'bg-cyan-900/20',
      alertInfoText: 'text-cyan-200',
      alertInfoBorder: 'border-cyan-400/60',
      alertWarnBg: 'bg-yellow-900/20',
      alertWarnText: 'text-yellow-200',
      alertWarnBorder: 'border-yellow-400/60',
      alertErrorBg: 'bg-red-900/40',
      alertErrorText: 'text-pink-200',
      alertErrorBorder: 'border-red-500/50',
      alertVisionBg: 'bg-pink-900/30',
      alertVisionText: 'text-pink-100',
      alertVisionBorder: 'border-pink-500/50',
      tipPanelBg: 'rgba(0,0,0,0.5)',
      tipPanelBorder: 'rgba(0, 255, 255, 0.3)',
      tipPanelText: 'text-cyan-100',
      tipPanelStrong: 'text-pink-300',
      // panelBg / panelBorder: backing color for control-panel containers
      // (theme switcher, CVD selector, hardware lock bar, GPL style bar).
      // These were previously hardcoded as either inline rgba expressions
      // gated on `glowStrong > 0.5` or as Tailwind `bg-black/30` classes.
      // Centralized here so Light mode can have a SOLID backing (the Jazz
      // pattern would otherwise show through and clutter UI controls), and
      // Dark/Neutral retain their previous semi-transparent look.
      panelBg: 'rgba(0, 0, 0, 0.4)',
      panelBorder: 'rgba(0, 255, 255, 0.4)',
      // panelBgStrong: a slightly darker backing used by the hardware-lock
      // bar and the .gpl style bar (which used to be `bg-black/30`). Kept
      // distinct from `panelBg` so Dark and Neutral preserve their prior
      // visual contrast between the top-of-page selectors (theme + CVD)
      // and the bottom-of-page export bars (hardware lock + GPL style).
      // In Light, both `panelBg` and `panelBgStrong` are solid white since
      // any translucency lets the Jazz pattern bleed through UI controls.
      // These bars carry accent borders (`border-yellow-500/40` and
      // `border-cyan-500/40`) which are intentional vaporwave coloring;
      // they are NOT replaced by a panel token, just the backing color is.
      panelBgStrong: 'rgba(0, 0, 0, 0.3)',
      // Inactive panel-button text + hover. Used by the top-header theme
      // switcher and CVD selector. Per-theme so the inactive label stays
      // legible against panelBg (WCAG AA 3:1 for UI components).
      panelTextInactive: 'text-cyan-200',
      panelHoverBg: 'hover:bg-purple-800/60',
      // Swatch caption colors (hex code under each swatch, and the small
      // shade label like "outline" / "shadow"). These appear directly on
      // the page background between swatches, so they need explicit theme
      // colors rather than relying on the CSS injection hack.
      swatchHex: '#a5f3fc', // text-cyan-200
      swatchLabel: 'rgba(249, 168, 212, 0.9)', // text-pink-300/90
      // Color name under sprite previews (e.g. "COLOR 1") sits on the
      // sprite preview background, which is the brightest ramp shade at
      // 70% alpha. In dark mode that's a dark mix so light text reads; in
      // light/neutral it's a lighter mix so dark text reads better.
      colorNameText: '#a5f3fc', // text-cyan-200
      // Visualization chrome tokens. The chromatic plot, mosaic, lightness
      // distribution bar, and the small thumbnail strips on classic and
      // saved palettes all used hardcoded `rgba(255,255,255,0.x)` colors
      // for their background rings, hue spokes, axis labels, and data-cell
      // seam borders. On Light and Neutral themes those colors are
      // white-on-white-ish and effectively invisible. Centralized here so
      // each theme picks values that read against its own background.
      // section header buttons. The Tailwind `hover:bg-white/N` class is
      // theme-naive (white-on-light is invisible), so the callsites pick
      // `hover:bg-white/5` for dark and `hover:bg-black/5` for light/neutral
      // via the `glowStrong > 0.5` test, parallel to how other chrome
      // adapts.
      vizRingStroke: 'rgba(255,255,255,0.12)',
      vizSpokeStroke: 'rgba(255,255,255,0.08)',
      vizAxisLabel: 'rgba(255,255,255,0.55)',
      vizDataBorder: 'rgba(255,255,255,0.1)',
      // vignette: a CSS box-shadow value applied as `boxShadow` to the
      // root container. Dark mode already has the vaporwave grid and
      // CRT scanlines for depth, so no vignette is added on top of that.
      vignette: 'none',
    },
    neutral: {
      // Neutral theme design intent (2026-05-24 redesign):
      // The entire UI surface (page bg AND card backings) reads as ~18%
      // gray (Munsell N5, the photographer's middle-gray reference).
      // Cards distinguish from page only by their accent-colored borders,
      // not by value. This preserves the "neutral gray reference for
      // judging colors" property across the whole UI surface, not just
      // any one piece of it.
      //
      // Text on cards is LIGHT (off-white to white), giving the same
      // visual weight as text-cyan-200 on dark theme, just without
      // color. Section header ACCENT text uses LIGHT-tint variants of
      // each section color (pink-100, cyan-100, etc.) so headers pop on
      // the gray card while keeping section identity color. BORDERS on
      // section cards use DARK-tint variants of the same accents so the
      // card edge crisply outlines against the gray page. See
      // themedAccent vs themedAccentBorder.
      //
      // Previously this theme used dark text on gray, which read as
      // heavy and dark across the page. Inverting it gives the cards
      // the same visual rhythm as dark theme (light text on
      // medium-value surface) while preserving the neutral-gray
      // reference property.
      pageBg: '#777777',
      showVaporwave: false,
      crtIntensity: 'rgba(0,0,0,0.06)',
      // Cards are 18% gray. The gradient is a very subtle ~5% lightness
      // variance to give cards a slight 3D feel without disrupting the
      // gray-reference property. Midpoint is 18% gray (#777777).
      cardBgCyan: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgPink: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgPinkBright: 'linear-gradient(135deg, #7e7e7e 0%, #707070 100%)',
      cardBgYellow: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgGreen: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgViz: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      titleGlow: '2px 2px 0 rgba(0,0,0,0.4), 4px 4px 12px rgba(0,0,0,0.3)',
      // Title and subtitle sit on the page bg (#5a5a5a). White/off-white
      // for legibility.
      titleColor: '#fafafa',
      subtitleColor: '#e4e4e7',
      subtitleGlow: 'none',
      glowStrong: 0.3,
      // Body text is white-ish on 18% gray cards. Same visual feel as
      // dark theme's text-cyan-200 on purple, just no color.
      bodyText: 'text-zinc-50',
      mutedText: 'text-zinc-200',
      inputBg: 'bg-black/40',
      inputTextCyan: 'text-zinc-50',
      inputTextPink: 'text-zinc-50',
      inputTextYellow: 'text-zinc-50',
      // Control button tokens. Updated for light-text-on-darker-control
      // pattern: the unselected button is darker than the card so it
      // reads as inset.
      controlBtnDefault: 'bg-zinc-800/50 text-zinc-50 border-zinc-700/60',
      controlBtnHover: 'hover:bg-zinc-800/70',
      controlPanelBg: 'bg-zinc-800/30',
      controlPanelBorder: 'border-zinc-700/60',
      // Alert tokens stay light-tint-with-dark-text since the alert backings
      // are intentionally tinted (info-cyan, warn-yellow, error-red, etc.)
      // and the tinted background reads more strongly than a gray one.
      alertInfoBg: 'bg-cyan-100/70',
      alertInfoText: 'text-cyan-900',
      alertInfoBorder: 'border-cyan-700/60',
      alertWarnBg: 'bg-yellow-100/70',
      alertWarnText: 'text-yellow-900',
      alertWarnBorder: 'border-yellow-700/60',
      alertErrorBg: 'bg-red-100/70',
      alertErrorText: 'text-red-900',
      alertErrorBorder: 'border-red-700/60',
      alertVisionBg: 'bg-pink-100/70',
      alertVisionText: 'text-pink-900',
      alertVisionBorder: 'border-pink-700/60',
      tipPanelBg: 'rgba(0, 0, 0, 0.5)',
      tipPanelBorder: 'rgba(0, 0, 0, 0.3)',
      tipPanelText: 'text-zinc-50',
      tipPanelStrong: 'text-zinc-100',
      // Panel tokens for control-panel containers (theme switcher, CVD,
      // hardware lock bar, GPL style bar). Darker than cards so they
      // read as inset bars.
      panelBg: 'rgba(0, 0, 0, 0.4)',
      panelBorder: 'rgba(0, 0, 0, 0.3)',
      panelBgStrong: 'rgba(0, 0, 0, 0.5)',
      // Inactive panel-button text + hover. panelBg here composites to a
      // dark grey (rgba(0,0,0,0.4) over the #707070 grey gradient) so a
      // dark text like zinc-700 was effectively invisible (ratio ~1.05).
      // Use light text to clear WCAG AA 3:1.
      panelTextInactive: 'text-zinc-100',
      panelHoverBg: 'hover:bg-zinc-700/60',
      // Swatch caption tokens: hex code and shade label under each
      // swatch sit on the card backing (~#777777 18% gray). Light
      // off-white for legibility, slightly less bright for the secondary
      // shade label.
      swatchHex: '#fafafa',
      swatchLabel: '#d4d4d8',
      // Color name (e.g. "COLOR 1") under sprite previews sits on
      // the brightest ramp shade at 70% alpha. Light text reads on
      // most palettes since the brightest shade is usually highlight-
      // bright. (Same constraint as dark theme; this token isn't
      // theme-conditional in practice but the value matches the
      // theme's "light text" intent.)
      colorNameText: '#fafafa',
      // Viz chrome tokens. Same approximate values as before but
      // re-tuned slightly for the darker (still gray) page bg and
      // light-on-gray card text. Light gray strokes against the
      // medium-gray cards.
      vizRingStroke: 'rgba(255,255,255,0.18)',
      vizSpokeStroke: 'rgba(255,255,255,0.12)',
      vizAxisLabel: 'rgba(255,255,255,0.65)',
      vizDataBorder: 'rgba(255,255,255,0.22)',
      // vignette: subtle inset shadow that darkens the edges of the root
      // container by ~10%. This is the Neutral mode "personality" touch:
      // adds depth and frame without introducing any color (Neutral is
      // the unbiased color-judgment mode, so anything that shifts
      // perceived hue or chroma is forbidden). The shadow is pure black
      // alpha and lives at the page edges only, well away from the
      // central palette region where color decisions get made.
      vignette: 'inset 0 0 120px 20px rgba(0, 0, 0, 0.2)',
    },
    light: {
      // Light mode page background: cream cup ground (#f4f1ea) with a
      // tiling SVG pattern in the 1992 Solo "Jazz" cup idiom: scattered
      // teal brush-stroke swooshes (the iconic mark) at varied rotations,
      // smaller magenta zigzag squiggles in the gaps, and confetti dots
      // in both colors. Marks near tile edges are duplicated on the
      // opposite edge so the pattern reads continuously across CSS
      // tile boundaries (no visible grid). Medium density: roughly 8
      // teal swooshes + 7 magenta squiggles + 14 confetti dots per
      // 240x240 tile, with the cream ground still reading as the
      // dominant value.
      //
      // Every card uses solid white-ish cardBg* gradients to wall the
      // pattern out, so color swatches always render on a flat backing
      // (see "Critical constraint" in the handoff item-G sketch).
      //
      // SVG is inline as a data URI (~5.3KB url-encoded). The earlier
      // version was ~2.1KB but read as random lines rather than the
      // intended Jazz cup; the larger size buys the recognizable
      // gesture vocabulary (curved brush swooshes vs straight zigzags)
      // and the edge-wrapping needed to hide the tile grid. No
      // architectural limit here, browsers handle data URIs of any
      // reasonable size; just heavier than the prior version.
      //
      // To edit: regenerate from gen_jazz.py (in /home/claude/work
      // during sessions, kept around as a tooling artifact). Single
      // quotes are SVG attribute quotes; the outer double quotes wrap
      // the url() arg; `#` must be encoded as `%23` since # ends a URL
      // fragment in CSS.
      pageBg: `#f4f1ea url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><path d='M131.9,133.2 Q142.5,115 153.1,125.4 Q163.7,135.8 174.2,117.6' stroke='%231fb5ab' stroke-width='4.7' stroke-linecap='round' fill='none' transform='rotate(69.5 153.1 125.4)'/><path d='M184,90.2 Q194.3,72.5 204.6,82.6 Q214.9,92.7 225.2,75' stroke='%231fb5ab' stroke-width='4.5' stroke-linecap='round' fill='none' transform='rotate(-39.2 204.6 82.6)'/><path d='M167.6,202.5 C179.9,219.9 192.3,199 204.6,216.4' stroke='%231fb5ab' stroke-width='4.4' stroke-linecap='round' fill='none' transform='rotate(-15 186.1 209.5)'/><path d='M49.3,6.2 C60.2,21.5 71.1,3.1 82.1,18.5' stroke='%231fb5ab' stroke-width='3.9' stroke-linecap='round' fill='none' transform='rotate(43.8 65.7 12.3)'/><path d='M49.3,246.2 C60.2,261.5 71.1,243.1 82.1,258.5' stroke='%231fb5ab' stroke-width='3.9' stroke-linecap='round' fill='none' transform='rotate(43.8 65.7 252.3)'/><path d='M94.5,65.9 C104.4,79.8 114.3,63.1 124.1,77' stroke='%231fb5ab' stroke-width='3.5' stroke-linecap='round' fill='none' transform='rotate(-11.2 109.3 71.4)'/><path d='M5,195.3 C14.2,208.3 23.4,192.8 32.6,205.7' stroke='%231fb5ab' stroke-width='3.3' stroke-linecap='round' fill='none' transform='rotate(27.1 18.8 200.5)'/><path d='M245,195.3 C254.2,208.3 263.4,192.8 272.6,205.7' stroke='%231fb5ab' stroke-width='3.3' stroke-linecap='round' fill='none' transform='rotate(27.1 258.8 200.5)'/><path d='M-38.5,6.2 C-27.7,21.3 -17,3.1 -6.2,18.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 -22.3 12.2)'/><path d='M201.5,6.2 C212.3,21.3 223,3.1 233.8,18.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 217.7 12.2)'/><path d='M-38.5,246.2 C-27.7,261.3 -17,243.1 -6.2,258.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 -22.3 252.2)'/><path d='M201.5,246.2 C212.3,261.3 223,243.1 233.8,258.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 217.7 252.2)'/><path d='M6,141.9 C16.8,157 27.5,138.8 38.2,153.9' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(16.9 22.1 147.9)'/><path d='M246,141.9 C256.8,157 267.5,138.8 278.2,153.9' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(16.9 262.1 147.9)'/><path d='M193.4,242.9 Q197.9,233.9 202.4,242.9 Q206.9,251.9 211.4,242.9' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(-42.1 202.4 242.9)'/><path d='M193.4,2.9 Q197.9,-6.1 202.4,2.9 Q206.9,11.9 211.4,2.9' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(-42.1 202.4 2.9)'/><path d='M158.6,50.7 Q162.4,43 166.3,50.7 Q170.1,58.4 173.9,50.7' stroke='%23d24d8e' stroke-width='1.7' stroke-linecap='round' fill='none' transform='rotate(-21.6 166.3 50.7)'/><path d='M136.7,175.3 Q140.7,167.3 144.7,175.3 Q148.8,183.4 152.8,175.3' stroke='%23d24d8e' stroke-width='1.8' stroke-linecap='round' fill='none' transform='rotate(40.9 144.7 175.3)'/><path d='M198,30.8 Q202.9,21.1 207.7,30.8 Q212.6,40.6 217.5,30.8' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(31.1 207.7 30.8)'/><path d='M12,107.5 Q16.4,98.7 20.8,107.5 Q25.2,116.3 29.6,107.5' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(57.4 20.8 107.5)'/><path d='M83.8,134.9 Q88.6,125.3 93.4,134.9 Q98.2,144.5 103,134.9' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(41.5 93.4 134.9)'/><path d='M48.1,206.4 Q53.1,196.5 58.1,206.4 Q63,216.3 68,206.4' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(66.8 58.1 206.4)'/><circle cx='80' cy='205.2' r='1.3' fill='%23d24d8e'/><circle cx='81.6' cy='210.7' r='1.3' fill='%23d24d8e'/><circle cx='49.1' cy='88.4' r='1.5' fill='%23d24d8e'/><circle cx='49.5' cy='85.8' r='1.3' fill='%23d24d8e'/><circle cx='204.1' cy='136.6' r='1.3' fill='%23d24d8e'/><circle cx='204.7' cy='137.5' r='1.1' fill='%23d24d8e'/><circle cx='121.6' cy='207' r='1.5' fill='%23d24d8e'/><circle cx='126.3' cy='205.6' r='1.5' fill='%23d24d8e'/><circle cx='126.8' cy='208.2' r='1.3' fill='%23d24d8e'/><circle cx='56.3' cy='124' r='1.6' fill='%23d24d8e'/><circle cx='55.5' cy='127' r='1.5' fill='%23d24d8e'/><circle cx='160.6' cy='29.9' r='1.6' fill='%23d24d8e'/><circle cx='159.4' cy='26' r='1.1' fill='%23d24d8e'/><circle cx='160.7' cy='28.8' r='1.5' fill='%23d24d8e'/><circle cx='50.4' cy='147.7' r='1' fill='%23d24d8e'/><circle cx='50.9' cy='143.3' r='1.4' fill='%23d24d8e'/><circle cx='51.9' cy='144.3' r='1.4' fill='%23d24d8e'/><circle cx='62.3' cy='55.8' r='1.5' fill='%23d24d8e'/><circle cx='67' cy='55' r='1.5' fill='%23d24d8e'/><circle cx='66.4' cy='52.5' r='1.1' fill='%23d24d8e'/><circle cx='147.6' cy='87.1' r='1.5' fill='%231fb5ab'/><circle cx='142.3' cy='204.4' r='1.6' fill='%231fb5ab'/><circle cx='40.6' cy='31' r='1.7' fill='%231fb5ab'/><circle cx='105.9' cy='215.3' r='1.8' fill='%231fb5ab'/><circle cx='89.2' cy='189.3' r='1.7' fill='%231fb5ab'/><circle cx='86.2' cy='227.7' r='2.1' fill='%231fb5ab'/></svg>") repeat`,
      showVaporwave: false,
      crtIntensity: 'rgba(0,0,0,0.04)',
      cardBgCyan: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgPink: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgPinkBright: 'linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)',
      cardBgYellow: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgGreen: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgViz: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      titleGlow: '2px 2px 0 rgba(0,0,0,0.15), 4px 4px 8px rgba(0,0,0,0.1)',
      titleColor: '#1a1a1a',
      subtitleColor: '#3a3a3a',
      subtitleGlow: 'none',
      glowStrong: 0.2,
      bodyText: 'text-zinc-800',
      mutedText: 'text-zinc-600',
      inputBg: 'bg-white',
      inputTextCyan: 'text-zinc-900',
      inputTextPink: 'text-zinc-900',
      inputTextYellow: 'text-zinc-900',
      // See dark theme for full reasoning. Light uses near-white default
      // with a darker hover so the button reads as an inset control on
      // the solid white card. Border is a 25% black to match panelBorder
      // for visual cohesion.
      controlBtnDefault: 'bg-zinc-100 text-zinc-900 border-zinc-300',
      controlBtnHover: 'hover:bg-zinc-200',
      controlPanelBg: 'bg-zinc-50',
      controlPanelBorder: 'border-zinc-300',
      // Alert tokens, light theme. Solid backings (no alpha) so the Jazz
      // pattern doesn't show through and muddy the alert text. See dark
      // theme for the rationale.
      alertInfoBg: 'bg-cyan-50',
      alertInfoText: 'text-cyan-900',
      alertInfoBorder: 'border-cyan-600',
      alertWarnBg: 'bg-yellow-50',
      alertWarnText: 'text-yellow-900',
      alertWarnBorder: 'border-yellow-600',
      alertErrorBg: 'bg-red-50',
      alertErrorText: 'text-red-900',
      alertErrorBorder: 'border-red-600',
      alertVisionBg: 'bg-pink-50',
      alertVisionText: 'text-pink-900',
      alertVisionBorder: 'border-pink-600',
      tipPanelBg: '#ffffff',
      tipPanelBorder: 'rgba(0, 0, 0, 0.2)',
      tipPanelText: 'text-zinc-800',
      tipPanelStrong: 'text-zinc-900',
      // See dark theme for what these are. Light mode REQUIRES solid
      // backings on control panels: the Jazz pattern in pageBg is dense
      // enough that any translucency on a control container lets the
      // pattern show through and visually clutters the UI controls. The
      // border is slightly darker than in Neutral because it sits on
      // solid white and needs more contrast to read as a panel edge.
      panelBg: '#ffffff',
      panelBorder: 'rgba(0, 0, 0, 0.25)',
      // In Light, both panel tokens are solid white (no translucency at
      // all). See dark theme for the broader rationale.
      panelBgStrong: '#ffffff',
      // panelBg is solid white here, so a dark zinc text is fine.
      panelTextInactive: 'text-zinc-700',
      panelHoverBg: 'hover:bg-zinc-200/60',
      swatchHex: '#262626',
      swatchLabel: '#525252',
      colorNameText: '#262626',
      // See dark theme for what these viz tokens are. Light mode pushes
      // the opacity slightly higher than Neutral because the cream-with-
      // Jazz-pattern background has busy chroma in it and the rings need
      // a touch more weight to read cleanly through the pattern noise.
      vizRingStroke: 'rgba(0,0,0,0.22)',
      vizSpokeStroke: 'rgba(0,0,0,0.15)',
      vizAxisLabel: 'rgba(0,0,0,0.6)',
      vizDataBorder: 'rgba(0,0,0,0.22)',
      // Light mode already gets the Jazz pattern in pageBg as its
      // personality, so no vignette is layered on top.
      vignette: 'none',
    },
  };
  const t = themeTokens[theme] || themeTokens.dark;

  // Helper for accent shadows. In dark mode we use the full neon glow; in
  // neutral/light we dial the intensity way down so accent borders read but
  // don't vibrate against the calmer background.
  const accentGlow = (hexAccent, baseAlpha = 0.4) => {
    const { r, g, b } = hexToRgb(hexAccent);
    const alpha = baseAlpha * t.glowStrong;
    if (alpha < 0.05) return 'none';
    return `0 0 25px rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // For section heading neon text-shadow. Takes a hex and optional pixel
  // size (default 8 to match the original section heading glow). Returns
  // 'none' on non-dark themes since glow-on-light is illegible.
  const accentTextGlow = (hexAccent, px = 8) => {
    if (t.glowStrong < 0.5) return 'none';
    return `0 0 ${px}px ${hexAccent}`;
  };

  // Section heading text color. In dark mode we use the neon accent directly
  // (e.g. cyan for ramps, pink for harmony). In neutral/light, neon text
  // against a light background is unreadable, so we shift to a much darker
  // variant of the same hue family. The mappings are tuned so each accent
  // stays distinguishable from its neighbors (cyan vs purple stay clearly
  // different) while remaining legible.
  //
  // IMPORTANT: When you change a mapping here, change it everywhere the
  // accent is used as chrome - section heading text, section heading
  // textShadow glow, style labels (Punchy/Balanced/Muted), accent borders
  // and glows. Use themedAccent() below as the single source of truth for
  // any chrome that needs the section accent.
  const ACCENT_MAP = {
    // Hex keys must be lowercase. Each value is { neutralText, neutralBorder, light }.
    // Neutral needs OPPOSITE values for text vs border:
    //   - Text on 18% gray card reads better as a light tint (cyan-100 etc.)
    //   - Borders against the 18% gray page read better as a dark tint
    //     (cyan-800 etc.) because the dark line crisply outlines the card
    //     edge against the medium-value page bg.
    // Light theme uses the same value for both text and border (dark tint
    // works against near-white cards).
    '#00ffff': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }, // cyan/teal
    '#67e8f9': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }, // cyan variant
    '#ff00ff': { neutralText: '#fce7f3', neutralBorder: '#4a044e', light: '#86198f' }, // pink/fuchsia
    '#ff006e': { neutralText: '#fce7f3', neutralBorder: '#4a044e', light: '#86198f' },
    '#ffff00': { neutralText: '#fef9c3', neutralBorder: '#422006', light: '#854d0e' }, // yellow
    '#00ff99': { neutralText: '#dcfce7', neutralBorder: '#052e16', light: '#166534' }, // green
    '#a855f7': { neutralText: '#f3e8ff', neutralBorder: '#3b0764', light: '#6b21a8' }, // purple
  };

  // themedAccent: single source of truth for any chrome that uses a section
  // accent color. Returns the canonical accent in dark mode, the LIGHT
  // tint variant in neutral mode (for text colors on gray cards), or the
  // dark tint in light mode. For BORDERS in neutral mode, use
  // themedAccentBorder() instead.
  const themedAccent = (hexAccent) => {
    if (t.glowStrong > 0.5) return hexAccent;
    const mapped = ACCENT_MAP[hexAccent.toLowerCase()];
    if (!mapped) return '#1a1a1a';
    if (theme === 'neutral') return mapped.neutralText;
    return mapped.light;
  };

  // themedAccentBorder: like themedAccent but returns dark tints for
  // Neutral mode where borders need to crisply outline cards against
  // the gray page bg. In Dark and Light, identical to themedAccent.
  const themedAccentBorder = (hexAccent) => {
    if (t.glowStrong > 0.5) return hexAccent;
    const mapped = ACCENT_MAP[hexAccent.toLowerCase()];
    if (!mapped) return '#1a1a1a';
    if (theme === 'neutral') return mapped.neutralBorder;
    return mapped.light;
  };

  // Backward compatibility: keep sectionHeadColor pointing at themedAccent
  // so callers don't have to change names. They do exactly the same thing.
  const sectionHeadColor = themedAccent;

  const dropPos = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
  };
  const makeSectionDragHandlers = (sectionKey) => ({
    onDragOver: (e) => {
      e.preventDefault();
      const pos = dropPos(e);
      setDragOver(prev => (prev && prev.key === sectionKey && prev.pos === pos) ? prev : { key: sectionKey, pos });
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(prev => (prev && prev.key === sectionKey) ? null : prev); },
    onDrop: (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      const pos = dropPos(e);
      setDragOver(null);
      if (!from || from === sectionKey || !DEFAULT_SECTION_ORDER.includes(from)) return;
      setSectionOrder(prev => {
        const next = prev.filter(k => k !== from);
        let idx = next.indexOf(sectionKey);
        if (pos === 'after') idx += 1;
        next.splice(idx, 0, from);
        return next;
      });
    },
  });
  // Accent color per section (viz mirrors the live vizStyle accent).
  const sectionAccent = (key) =>
    key === 'ramps' ? '#00ffff'
    : key === 'harmony' ? '#ff00ff'
    : key === 'playground' ? '#00ff88'
    : key === 'viz' ? (vizStyle === 'balanced' ? '#00ffff' : vizStyle === 'muted' ? '#a855f7' : '#ff00ff')
    : key === 'saved' ? '#ffff00'
    : key === 'history' ? '#a855f7'
    : '#00ffff';
  // Glowing insertion line on the hovered edge, colored to the dragged card.
  const dropLine = (sectionKey) => {
    if (!dragOver || dragOver.key !== sectionKey || !draggingKey) return null;
    const c = sectionAccent(draggingKey);
    return dragOver.pos === 'before'
      ? `inset 0 6px 0 -2px ${c}, 0 0 14px ${c}`
      : `inset 0 -6px 0 -2px ${c}, 0 0 14px ${c}`;
  };

  const sectionGrip = (sectionKey) => (
    <span
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', sectionKey); setDraggingKey(sectionKey); }}
      onDragEnd={() => { setDraggingKey(null); setDragOver(null); }}
      onClick={e => e.stopPropagation()}
      style={{ cursor: 'grab', color: '#fff', filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      className="hover:scale-125 transition-transform"
      title="Drag to reorder this section"
    >
      <GripVertical size={16} />
    </span>
  );

  // Ramp-card reorder. Mirrors makeSectionDragHandlers but on numeric indices,
  // and stops propagation so the enclosing ramps-section drag handlers never
  // also fire (a ramp drop must not be read as a section reorder).
  const makeRampDragHandlers = (index) => ({
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = dropPos(e);
      setRampDragOver(prev => (prev && prev.index === index && prev.pos === pos) ? prev : { index, pos });
    },
    onDragLeave: (e) => {
      e.stopPropagation();
      if (!e.currentTarget.contains(e.relatedTarget)) setRampDragOver(prev => (prev && prev.index === index) ? null : prev);
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData('application/x-ramp-index');
      const pos = dropPos(e);
      setRampDragOver(null);
      if (raw === '') return;
      const from = Number(raw);
      if (Number.isNaN(from) || from === index) return;
      const next = reorderRamps(from, index, pos);
      setGamutPerRamp(prev => permuteStringKeyMap(prev, next));
      tagNextLabel('Reorder ramps');
    },
  });
  const rampDropLine = (index) => {
    if (!rampDragOver || rampDragOver.index !== index || rampDragging === null) return null;
    const c = '#00ffff';
    return rampDragOver.pos === 'before'
      ? `inset 0 6px 0 -2px ${c}, 0 0 14px ${c}`
      : `inset 0 -6px 0 -2px ${c}, 0 0 14px ${c}`;
  };
  const rampGrip = (index) => (
    <span
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/x-ramp-index', String(index)); setRampDragging(index); }}
      onDragEnd={() => { setRampDragging(null); setRampDragOver(null); }}
      onClick={e => e.stopPropagation()}
      style={{ cursor: 'grab', color: '#fff', filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      className="hover:scale-125 transition-transform"
      title="Drag to reorder this ramp"
    >
      <GripVertical size={16} />
    </span>
  );

  const themeValue = useMemo(() => ({
    t, themedAccent, themedAccentBorder, accentGlow, accentTextGlow, sectionHeadColor,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }), [t]);
  const layoutValue = useMemo(() => ({
    sectionOrder, makeSectionDragHandlers, dropLine, sectionGrip, historyOpen, setHistoryOpen,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }), [sectionOrder, dragOver, draggingKey, historyOpen]);
  const paletteValue = useMemo(() => ({
    historyEntries, historyIndex, jumpToHistoryIndex, canUndo, canRedo, formatHistoryAge,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }), [historyEntries, historyIndex, canUndo, canRedo]);
  const editorValue = useMemo(() => ({ editingIndex, editorHsv, pinEditor }), [editingIndex, editorHsv, pinEditor]);

  return (
    <ThemeProvider value={themeValue}>
    <LayoutProvider value={layoutValue}>
    <PaletteProvider value={paletteValue}>
    <EditorProvider value={editorValue}>
    <div className="min-h-screen p-6 relative overflow-hidden" style={{
      background: t.pageBg,
      boxShadow: t.vignette,
      fontFamily: '"Courier New", "Lucida Console", monospace'
    }}>
      {/* Theme-aware text colors are primarily driven by theme tokens
          (t.bodyText, t.mutedText, t.swatchHex, t.swatchLabel,
          t.colorNameText, t.titleColor, t.subtitleColor). Tokens are the
          source of truth: source class == rendered color.

          The exception is the Light theme, where many Tailwind text-color
          utilities (text-cyan-200, text-pink-100/80) hardcoded throughout
          the JSX would render as near-invisible light tints against the
          light cream cards. A narrow CSS override below handles Light
          only. The override uses a descendant rule pair (default + inside
          bg-black ancestor) like the previous version did; see
          ARCHITECTURE.md "Theme-aware text colors" for the design and
          why this is scoped to Light only.

          Neutral theme does NOT use this override. Neutral has been
          migrated to drive text colors entirely from theme tokens. If
          you find Neutral text that's not adapting correctly, the fix
          is to point that text at a token, not to extend this CSS
          block. */}
      {theme === 'light' && (
        <style>{`
          [class*="text-cyan-100/"]:not([class*="bg-black/"]),
          [class*="text-pink-100/"]:not([class*="bg-black/"]),
          [class*="text-green-100/"]:not([class*="bg-black/"]),
          [class*="text-yellow-100/"]:not([class*="bg-black/"]) {
            color: #2a2a2a !important;
            opacity: 0.85;
          }
          .text-cyan-200:not([class*="bg-black/"]),
          .text-cyan-100:not([class*="bg-black/"]),
          .text-pink-200:not([class*="bg-black/"]),
          [class*="text-pink-300/"]:not([class*="bg-black/"]),
          .text-yellow-200:not([class*="bg-black/"]),
          .text-yellow-100:not([class*="bg-black/"]),
          .text-green-100:not([class*="bg-black/"]) {
            color: #1a1a1a !important;
          }
          [class*="bg-black/"] [class*="text-cyan-100/"],
          [class*="bg-black/"] [class*="text-pink-100/"],
          [class*="bg-black/"] [class*="text-green-100/"],
          [class*="bg-black/"] [class*="text-yellow-100/"] {
            opacity: 1 !important;
          }
          [class*="bg-black/"] [class*="text-cyan-100/"] { color: #cffafe !important; }
          [class*="bg-black/"] [class*="text-pink-100/"] { color: #fce7f3 !important; }
          [class*="bg-black/"] [class*="text-green-100/"] { color: #dcfce7 !important; }
          [class*="bg-black/"] [class*="text-yellow-100/"] { color: #fef9c3 !important; }
          [class*="bg-black/"] .text-cyan-200 { color: #a5f3fc !important; }
          [class*="bg-black/"] .text-cyan-100 { color: #cffafe !important; }
          [class*="bg-black/"] .text-pink-200 { color: #fbcfe8 !important; }
          [class*="bg-black/"] [class*="text-pink-300/"] { color: #f9a8d4 !important; }
          [class*="bg-black/"] .text-yellow-200 { color: #fef08a !important; }
          [class*="bg-black/"] .text-yellow-100 { color: #fef9c3 !important; }
          [class*="bg-black/"] .text-green-100 { color: #dcfce7 !important; }
          input[class*="bg-black/"], textarea[class*="bg-black/"] {
            color: #e4e4e7 !important;
          }
        `}</style>
      )}
      {crtEnabled && (
        <div className="pointer-events-none fixed inset-0 z-50" style={{
          background: `repeating-linear-gradient(0deg, ${t.crtIntensity} 0px, ${t.crtIntensity} 1px, transparent 1px, transparent 3px)`,
          mixBlendMode: 'multiply'
        }} />
      )}
      {/* Vaporwave grid floor only renders in dark theme. On neutral/light
          backgrounds it adds visual noise that competes with the swatches. */}
      {t.showVaporwave && (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 h-1/2 z-0" style={{
          backgroundImage: `linear-gradient(0deg, transparent 0%, rgba(255, 0, 255, 0.1) 50%, rgba(0, 255, 255, 0.2) 100%), linear-gradient(90deg, rgba(0, 255, 255, 0.4) 1px, transparent 1px), linear-gradient(0deg, rgba(255, 0, 255, 0.3) 1px, transparent 1px)`,
          backgroundSize: '100% 100%, 60px 60px, 60px 60px',
          transform: 'perspective(500px) rotateX(60deg)',
          transformOrigin: 'center top'
        }} />
      )}

      <div className="max-w-5xl mx-auto relative z-10">
        {!compareMode && (
          <BaseColorDock baseColors={baseColors} onDelete={removeRamp} onJump={scrollToRamp} />
        )}
        <V2EngineNotice show={v2NoticePending} />
        <div className="text-center mb-6 relative">
          <div className="absolute top-0 left-0 z-20">
            <button
              onClick={() => setLauncherOpen(o => !o)}
              title="Open guides"
              className={`px-3 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}
            >?</button>
          </div>
          <h1 className="text-5xl font-bold mb-2" style={{ color: t.titleColor, textShadow: t.titleGlow, letterSpacing: '0.15em' }}>PIXEL.PAL</h1>
          <p className="text-sm tracking-widest" style={{ color: t.subtitleColor, textShadow: t.subtitleGlow }}>▓▒░ PIXEL ART PALETTE GENERATOR ░▒▓</p>
          <p className="text-[10px] mt-1 opacity-40 tracking-widest font-mono" style={{ color: t.subtitleColor }}>
            v{__APP_VERSION__} &middot; {__BUILD_DATE__}
          </p>
          {IS_WEB && (
            <p className="mt-1">
              <DesktopAppLink
                textClassName={t.bodyText}
                hoverClassName={theme === 'light' ? 'hover:text-pink-600' : 'hover:text-cyan-300'}
              />
            </p>
          )}
          {/* Top-right control cluster: CRT toggle on top, three theme
              icon buttons in a horizontal row directly below, sized to
              match the CRT button's overall width.

              The CRT button has fixed-width content so toggling ON/OFF
              doesn't change its width (and therefore doesn't reflow the
              theme switcher below it, which stretches to match). Both
              icons (Monitor/MonitorOff) and the longer label ("CRT OFF",
              7 chars) are ALWAYS rendered; the inactive icon and the
              "missing" trailing character are made `invisible` so they
              still take up layout space. The visible state reads cleanly
              while width stays byte-stable across toggles. */}
          <div className="absolute top-0 right-0 z-20 flex flex-col gap-2 items-stretch">
            <button onClick={() => setCrtEnabled(!crtEnabled)} title={crtEnabled ? "Turn off CRT scanline overlay" : "Turn on CRT scanline overlay"} className={`px-3 py-2 rounded font-bold border-2 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-xs ${crtEnabled ? (t.glowStrong > 0.5 ? 'bg-green-400/30 text-green-300 border-green-400 hover:bg-green-400/50' : 'bg-green-200 text-green-900 border-green-600 hover:bg-green-300') : (t.glowStrong > 0.5 ? `${t.controlBtnDefault} ${t.controlBtnHover}` : 'bg-white/60 text-zinc-700 border-zinc-400 hover:bg-white/80')}`} style={crtEnabled && t.glowStrong > 0.5 ? { boxShadow: '0 0 10px rgba(0, 255, 100, 0.5)' } : {}}>
              {/* Both icons rendered, with the inactive one invisible.
                  Stack them in the same grid cell so they share the
                  layout slot. */}
              <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
                <Monitor size={16} className={`absolute ${crtEnabled ? '' : 'invisible'}`} />
                <MonitorOff size={16} className={`absolute ${crtEnabled ? 'invisible' : ''}`} />
              </span>
              {/* Label: stack "ON" and "OFF" in the same grid cell so the
                  containing button's width is always the wider of the two
                  ("CRT OFF"). The inactive label is `invisible` so it
                  still claims layout space but renders blank. The
                  visible label is centered in the cell, matching the
                  visible icon's centering. Hidden below sm breakpoint
                  to match prior responsive behavior. */}
              <span className="hidden sm:grid tabular-nums" style={{ gridTemplateAreas: '"stack"' }}>
                <span className={`${crtEnabled ? '' : 'invisible'} text-center`} style={{ gridArea: 'stack' }}>CRT ON</span>
                <span className={`${crtEnabled ? 'invisible' : ''} text-center`} style={{ gridArea: 'stack' }}>CRT OFF</span>
              </span>
            </button>
            {/* Theme selector: three icon buttons in a row. Icons follow the
                screen-brightness convention: moon=dark, half-filled
                circle=neutral (18% gray is also the photography reference
                for contrast/exposure), sun=light. flex with equal-width
                children stretches to match the CRT button's width above. */}
            <div className="flex gap-1 rounded border-2 p-1" style={{ borderColor: t.panelBorder, background: t.panelBg }}>
              {[
                { id: 'dark',    Icon: Moon,     hint: 'Dark: original vaporwave look' },
                { id: 'neutral', Icon: Contrast, hint: '18% gray: neutral background for unbiased color judgment' },
                { id: 'light',   Icon: Sun,      hint: 'Light: off-white background' },
              ].map(opt => {
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    title={opt.hint}
                    aria-label={opt.hint}
                    className={`flex-1 flex items-center justify-center py-1 rounded transition-all ${theme === opt.id ? (t.glowStrong > 0.5 ? 'bg-cyan-300 text-purple-900' : 'bg-zinc-800 text-white') : `${t.panelTextInactive} ${t.panelHoverBg}`}`}
                    style={theme === opt.id && t.glowStrong > 0.5 ? { boxShadow: '0 0 8px rgba(0, 255, 255, 0.6)' } : {}}
                  >
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>
          </div>
          {/* Top-left control cluster: an invisible spacer matching the
              CRT button on the right, then the CVD selector below it.
              This positions the CVD row at the same vertical height as
              the theme switcher on the right side, giving the header a
              symmetric layout. Spacer uses the SAME button markup as
              the real CRT button to guarantee height parity regardless
              of font / padding changes. The spacer text is "CRT OFF"
              (the longer state) so it matches the real button's now-
              stabilized width exactly. */}
          <div className="absolute top-0 left-0 z-20 flex flex-col gap-2 items-stretch pointer-events-none">
            <button aria-hidden="true" tabIndex={-1} className="invisible pointer-events-none px-3 py-2 rounded font-bold border-2 flex items-center justify-center gap-2 uppercase tracking-wider text-xs">
              <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
                <MonitorOff size={16} />
              </span>
              <span className="hidden sm:grid tabular-nums" style={{ gridTemplateAreas: '"stack"' }}>
                <span className="text-center" style={{ gridArea: 'stack' }}>CRT ON</span>
                <span className="text-center" style={{ gridArea: 'stack' }}>CRT OFF</span>
              </span>
            </button>
            {/* Color vision deficiency simulator: 4 labeled buttons (None /
                Pro / Deu / Tri) that switch which SVG color matrix filter
                is applied to the main content area. The buttons themselves
                live OUTSIDE the filtered region so the active state stays
                readable in all modes. Aligned horizontally with the theme
                switcher on the right via an invisible spacer above. */}
            <div className="flex gap-1 rounded border-2 p-1 pointer-events-auto" style={{ borderColor: t.panelBorder, background: t.panelBg }}>
              {[
                { id: 'none',   label: 'None', hint: 'Normal vision (no simulation)' },
                { id: 'protan', label: 'Pro',  hint: 'Protanopia: simulates red-blindness (~1% of men)' },
                { id: 'deutan', label: 'Deu',  hint: 'Deuteranopia: simulates green-blindness (~6% of men, most common CVD)' },
                { id: 'tritan', label: 'Tri',  hint: 'Tritanopia: simulates blue-blindness (very rare)' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setCvdMode(opt.id)}
                  title={opt.hint}
                  aria-label={opt.hint}
                  className={`flex-1 flex items-center justify-center py-1 px-1 rounded transition-all text-[10px] font-bold uppercase tracking-wider ${cvdMode === opt.id ? (t.glowStrong > 0.5 ? 'bg-cyan-300 text-purple-900' : 'bg-zinc-800 text-white') : `${t.panelTextInactive} ${t.panelHoverBg}`}`}
                  style={cvdMode === opt.id && t.glowStrong > 0.5 ? { boxShadow: '0 0 8px rgba(0, 255, 255, 0.6)' } : {}}
                >
                  {opt.id === 'none' ? <Eye size={12} /> : opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SVG filter definitions for colorblind simulation. Hidden from
            layout. Matrices are Brettel/Vienot/Mollon coefficients (the
            standard public-domain CVD simulation values used by browser
            accessibility tools). Order in each 20-value matrix:
            R1 R2 R3 R4 R5 / G1 G2 G3 G4 G5 / B1 B2 B3 B4 B5 / A1 A2 A3 A4 A5.
            Columns 4 (alpha multiplier) and 5 (additive offset) are 0
            except the alpha row identity. */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter id="cvd-protan">
              <feColorMatrix type="matrix" values="
                0.567 0.433 0     0 0
                0.558 0.442 0     0 0
                0     0.242 0.758 0 0
                0     0     0     1 0" />
            </filter>
            <filter id="cvd-deutan">
              <feColorMatrix type="matrix" values="
                0.625 0.375 0   0 0
                0.700 0.300 0   0 0
                0     0.300 0.7 0 0
                0     0     0   1 0" />
            </filter>
            <filter id="cvd-tritan">
              <feColorMatrix type="matrix" values="
                0.950 0.050 0     0 0
                0     0.433 0.567 0 0
                0     0.475 0.525 0 0
                0     0     0     1 0" />
            </filter>
          </defs>
        </svg>

        {/* CVD filter wrapper. Everything from this point through the
            bottom tip panel gets the active SVG color matrix applied.
            The header / theme / CVD selector deliberately sit ABOVE this
            wrapper so the selector buttons themselves stay readable in
            all modes. When cvdMode is 'none' the filter is the string
            'none' (no transform, identical to no filter at all). */}
        <div style={{ filter: cvdMode === 'none' ? 'none' : `url(#cvd-${cvdMode})` }}>

        <div className="rounded-lg p-6 mb-6 border-2 backdrop-blur-sm" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ff00ff'), boxShadow: t.glowStrong > 0.5 ? '0 0 30px rgba(255, 0, 255, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.2)' : accentGlow('#ff00ff', 0.5) }}>
          <div className="flex flex-wrap gap-2 mb-4 justify-center" data-tour-id="mode-tabs">
            <button onClick={() => setMode('color')} data-tour-id="mode-single" title="Build a palette from a single hex color" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm ${mode === 'color' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={mode === 'color' ? { boxShadow: '0 0 15px #00ffff' } : {}}>Single Color</button>
            <button onClick={() => setMode('image')} data-tour-id="mode-image" title="Extract a palette from an uploaded image" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm flex items-center gap-1 ${mode === 'image' ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-yellow-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-800/60'}`} style={mode === 'image' ? { boxShadow: '0 0 15px #ffff00' } : {}}><ImageIcon size={16} />From Image</button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4 flex-wrap">
            {mode === 'color' && (
              <div className="flex gap-2 items-center flex-wrap relative">
                <input type="color" value={colorInput} onChange={(e) => setColorInput(e.target.value)} title="Pick a base color from the OS color picker" className="w-14 h-14 rounded border-2 border-cyan-400 cursor-pointer" style={{ boxShadow: '0 0 10px #00ffff' }} />
                <input type="text" value={colorInput} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColorInput(v); }} data-tour-id="hex-input" title="Type a hex color (e.g. #ff6b35)" className="px-3 py-2 rounded bg-black/60 text-cyan-200 font-mono border-2 border-cyan-400 w-32 focus:outline-none" />
                <button onClick={randomizeColor} title="Roll a random hex into the input. Does not change the palette. Click Add base to append it, or New palette to replace the palette with it." className="px-3 py-2 rounded font-bold bg-pink-500 text-white border-2 border-pink-300 hover:bg-pink-400 hover:scale-105 transition-all" style={{ boxShadow: '0 0 12px #ff00ff' }}><Dice5 size={18} /></button>
                <button onClick={addColorAsBase} data-tour-id="add-base-btn" title="Append this color to the palette as a new base. Stays on this tab so you can keep building. Non-destructive: existing ramps, pins, and customizations are preserved." className="px-4 py-2 rounded font-bold bg-cyan-300 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-200 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 15px #00ffff' }}>
                  <Plus size={18} />Add base
                </button>
                {addBaseFeedback && (
                  <span className="absolute -left-1 top-full mt-2 z-20 whitespace-nowrap text-xs font-bold px-2 py-1 rounded bg-cyan-500 text-purple-900 border-2 border-cyan-200 uppercase tracking-wider">{addBaseFeedback}</span>
                )}
              </div>
            )}
            {mode === 'image' && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div onDragOver={handleDragOver} onDragEnter={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} data-tour-id="image-dropzone" className={`w-full rounded-lg border-4 border-dashed transition-all p-6 ${isDragging ? 'border-yellow-300 bg-yellow-500/20 scale-[1.02]' : 'border-yellow-500/60 bg-yellow-900/20 hover:bg-yellow-900/30'}`} style={isDragging ? { boxShadow: '0 0 30px #ffff00' } : {}}>
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={32} className={`transition-all ${isDragging ? 'text-yellow-200 scale-125' : 'text-yellow-300'}`} style={{ filter: 'drop-shadow(0 0 8px #ffff00)' }} />
                    <div className="text-center text-yellow-100">
                      <p className="font-bold text-base mb-1 uppercase tracking-widest">{isDragging ? '>>> DROP IT <<<' : 'Drag & Drop Image'}</p>
                      <p className="text-xs opacity-80">or paste from clipboard (Ctrl/Cmd+V)</p>
                    </div>
                    <label className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer text-sm uppercase tracking-wider" style={{ boxShadow: '0 0 12px #ffff00' }}>
                      <Upload size={16} />{imageDataUrl ? 'Choose Different' : 'Browse Files'}
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => handleImageUpload(e.target.files[0])} className="hidden" />
                    </label>
                  </div>
                </div>
                {imageDataUrl && (
                  <>
                    <div className="flex flex-col sm:flex-row gap-3 items-center flex-wrap justify-center">
                      <div className="flex gap-2 items-center text-yellow-100">
                        <span className="text-sm font-bold uppercase tracking-wider">Colors:</span>
                        {[3, 4, 5, 6].map(n => (
                          <button key={n} onClick={() => setImageColorCount(n)} title={`Extract ${n} base colors from this image`} className={`w-8 h-8 rounded font-bold border-2 text-sm transition-all ${imageColorCount === n ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-purple-800/60'}`}>{n}</button>
                        ))}
                      </div>
                      <button onClick={reExtractFromImage} disabled={imageLoading} title="Re-run color extraction on the current image" className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all disabled:opacity-60 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>{imageLoading ? 'ANALYZING...' : 'Re-extract'}</button>
                      <button onClick={() => setEyedropperActive(!eyedropperActive)} title={eyedropperActive ? "Cancel eyedropper" : "Pick a color directly from the image by clicking it"} className={`px-4 py-2 rounded font-bold border-2 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm ${eyedropperActive ? 'bg-cyan-300 text-purple-900 border-cyan-100' : 'bg-cyan-700 text-cyan-100 border-cyan-900 hover:bg-cyan-600'}`} style={{ boxShadow: eyedropperActive ? '0 0 15px #00ffff' : '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                        <Pipette size={16} />{eyedropperActive ? 'Click image...' : 'Eyedropper'}
                      </button>
                    </div>
                    {eyedropperActive && (
                      <div className="text-cyan-100 text-xs bg-cyan-900/40 border-2 border-cyan-500/50 rounded p-2 text-center uppercase tracking-wider">▸ Hover to preview, click to add ◂</div>
                    )}
                    {/* Zoom row for eyedropper precision. Integer multipliers
                        only, applied via inline width style with
                        image-rendering: pixelated so no resampling happens.
                        The wrapper scrolls when the zoomed image exceeds the
                        available width. */}
                    <div className="flex gap-2 items-center justify-center text-cyan-100">
                      <span className="text-xs font-bold uppercase tracking-wider">Zoom:</span>
                      {[1, 2, 4, 8].map(n => (
                        <button key={n} onClick={() => setImageZoom(n)} title={`Display the image at ${n}x for finer eyedropper precision`} className={`w-9 h-8 rounded font-bold border-2 text-xs transition-all ${imageZoom === n ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={imageZoom === n ? { boxShadow: '0 0 8px #00ffff' } : {}}>{n}x</button>
                      ))}
                    </div>
                    <div className={`relative flex items-center justify-center bg-black/40 rounded border-2 p-2 overflow-auto max-h-[600px] ${eyedropperActive ? 'border-cyan-300' : 'border-pink-500/50'}`}>
                      {/* Zoom is applied by setting img width to naturalWidth
                          times the integer multiplier. Combined with
                          image-rendering: pixelated, the browser
                          nearest-neighbor scales it on display only. The
                          underlying naturalWidth/naturalHeight are unchanged,
                          so getPixelColorFromImage's coord math
                          (x/rect.width * naturalWidth) still resolves to the
                          exact source pixel. width is set via inline style
                          using a ref to read naturalWidth once the image
                          loads. */}
                      <img
                        ref={imageRef}
                        src={imageDataUrl}
                        alt="Uploaded"
                        className={imageZoom === 1 ? 'max-h-48 rounded' : 'rounded'}
                        style={{
                          imageRendering: 'pixelated',
                          cursor: eyedropperActive ? 'crosshair' : 'default',
                          ...(imageZoom > 1 && imageNaturalSize.width > 0 ? {
                            width: imageNaturalSize.width * imageZoom + 'px',
                            height: imageNaturalSize.height * imageZoom + 'px',
                            maxHeight: 'none',
                            maxWidth: 'none',
                          } : {}),
                        }}
                        onLoad={(e) => setImageNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                        onMouseMove={handleImageHover}
                        onMouseLeave={handleImageLeave}
                        onClick={handleImageClick}
                      />
                      {eyedropperActive && hoveredColor && (
                        <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/80 border-2 border-cyan-400 rounded px-2 py-1" style={{ boxShadow: '0 0 12px #00ffff', zIndex: 10 }}>
                          <div className="w-6 h-6 rounded border border-cyan-200" style={{ backgroundColor: hoveredColor }} />
                          <span className="text-cyan-200 text-xs font-mono font-bold">{hoveredColor.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {imageError && <div className={`text-sm rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{imageError}</div>}
              </div>
            )}

            {mode === 'image' ? null : (
              <button onClick={handleGenerate} data-tour-id="new-palette-btn" title="Replace the palette with a new single-ramp palette built from the hex above. Destructive: wipes pins, hidden shades, ramp locks, side-by-side slots, harmony anchor, and per-ramp customizations. To keep your existing palette, click Add base instead." className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>
                <Sparkles size={18} />New palette
              </button>
            )}
          </div>



          <div className="mt-4 pt-4 border-t border-cyan-700/30">
            <div className="flex flex-wrap gap-2 items-center justify-center text-cyan-100 mb-3">
              <span className="text-sm font-bold uppercase tracking-wider w-full sm:w-auto text-center">Preview Sprite:</span>
              {Object.entries(spriteLibrary).map(([key, sprite]) => {
                const previewRamp = ramps[0] || ['#000', '#444', '#888', '#fff'];
                const isCustom = !DEFAULT_SPRITE_LIBRARY[key];
                return (
                  <div key={key} className="relative">
                    <button onClick={() => setSpriteKey(key)} className={`flex flex-col items-center gap-1 p-2 rounded border-2 transition-all ${spriteKey === key ? 'bg-cyan-300/30 border-cyan-300' : `${t.controlBtnDefault} ${t.controlBtnHover} hover:border-cyan-500/50`}`} style={spriteKey === key ? { boxShadow: '0 0 10px #00ffff' } : {}} title={sprite.name}>
                      <div className="w-12 h-12 flex items-center justify-center bg-black/40 rounded overflow-hidden">
                        <PixelSprite palette={previewRamp} scale={1.2} spriteKey={key} spriteLibrary={spriteLibrary} />
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider ${spriteKey === key ? 'text-cyan-200' : t.bodyText}`}>{sprite.name}</span>
                    </button>
                    {isCustom && (
                      <>
                        <button onClick={() => removeCustomSprite(key)} className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white rounded-full border border-pink-200 hover:bg-pink-400 flex items-center justify-center text-xs font-bold" title="Remove">×</button>
                        <button onClick={(e) => { e.stopPropagation(); copySpriteSource(key); }} className="absolute -top-1 -left-1 w-5 h-5 bg-cyan-400 text-purple-900 rounded-full border border-cyan-200 hover:bg-cyan-300 flex items-center justify-center" title="Copy sprite source"><Copy size={10} /></button>
                      </>
                    )}
                  </div>
                );
              })}
              <button onClick={() => setShowSpriteImporter(!showSpriteImporter)} title="Open the sprite importer to add a custom preview sprite from a Piskel .c export" className="flex flex-col items-center gap-1 p-2 rounded border-2 border-dashed border-pink-400 bg-pink-900/30 hover:bg-pink-900/50 transition-all">
                <div className="w-12 h-12 flex items-center justify-center text-pink-300 text-2xl font-bold">+</div>
                <span className="text-[10px] uppercase tracking-wider text-pink-200">Import</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-4 items-center justify-center text-cyan-100 mt-3 pt-3 border-t border-cyan-700/20">
              <div className="flex gap-2 items-center">
                <span className="text-sm font-bold uppercase tracking-wider">Shades:</span>
                {[4, 5, 6, 7, 8].map(n => (
                  <button key={n} onClick={() => setRampSize(n)} title={`Use ${n} shades per ramp (default for new and unset ramps)`} className={`w-9 h-9 rounded font-bold border-2 transition-all ${rampSize === n ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={rampSize === n ? { boxShadow: '0 0 10px #00ffff' } : {}}>{n}</button>
                ))}
              </div>
              <div className="flex gap-2 items-center" title="Scales the warm/cool hue shifts applied to shadows and highlights. 0% is flat, 100% is the default, 200% is painterly. Affects all styles.">
                <span className="text-sm font-bold uppercase tracking-wider">Hue Shift:</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={Math.round(hueShiftStrength * 100)}
                  onChange={(e) => setHueShiftStrength(Number(e.target.value) / 100)}
                  className="w-32 accent-cyan-300"
                  aria-label="Hue shift strength"
                  title={`Hue shift strength: ${Math.round(hueShiftStrength * 100)}%`}
                />
                <span className="text-sm font-mono text-cyan-200 w-12 text-right tabular-nums">{Math.round(hueShiftStrength * 100)}%</span>
                {hueShiftStrength !== 1.0 && (
                  <button
                    onClick={() => setHueShiftStrength(1.0)}
                    title="Reset Hue Shift to 100% (default)"
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}
                  >Reset</button>
                )}
              </div>
            </div>

            {showSpriteImporter && (
              <div className="mt-3 p-4 rounded border-2 border-pink-500/50 bg-black/40">
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-pink-200 uppercase tracking-wider">▸ Import sprite from Piskel C file</p>
                  <div onDragOver={handleSpriteDragOver} onDragEnter={handleSpriteDragOver} onDragLeave={handleSpriteDragLeave} onDrop={handleSpriteDrop} className={`rounded border-2 border-dashed transition-all p-3 ${spriteDragging ? 'border-cyan-300 bg-cyan-500/20 scale-[1.02]' : 'border-cyan-500/40 bg-cyan-900/20 hover:bg-cyan-900/30'}`}>
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={24} className={`transition-all ${spriteDragging ? 'text-cyan-200 scale-125' : 'text-cyan-300'}`} />
                      <p className="text-xs text-cyan-100 text-center">{spriteDragging ? '>>> DROP IT <<<' : 'Drop .c file or paste below'}</p>
                      <label className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-200 hover:bg-cyan-300 transition-all flex items-center gap-2 cursor-pointer text-xs uppercase tracking-wider">
                        <Upload size={14} />Browse for .c file
                        <input type="file" accept=".c,.txt,text/plain" onChange={(e) => handleSpriteFile(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <input type="text" value={spriteImportName} onChange={(e) => setSpriteImportName(e.target.value)} placeholder="Sprite name (e.g. Walkman)" title="Name shown under the sprite tile in the preview row" className="px-3 py-2 rounded bg-black/60 text-cyan-200 border-2 border-cyan-400 w-full text-sm focus:outline-none" />
                  <textarea value={spriteImportText} onChange={(e) => setSpriteImportText(e.target.value)} placeholder="...or paste the C array text" title="Paste the contents of a Piskel C export here" className="px-3 py-2 rounded bg-black/60 text-cyan-200 font-mono text-xs border-2 border-cyan-400 w-full focus:outline-none" rows={4} />
                  {spriteImportError && <div className={`text-xs rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{spriteImportError}</div>}
                  <div className="flex gap-2">
                    <button onClick={importSprite} title="Add this sprite to the preview library" className="px-4 py-2 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-200 hover:bg-pink-300 hover:scale-105 transition-all uppercase tracking-wider text-sm flex-1" style={{ boxShadow: '0 0 10px #ff00ff' }}>Import Sprite</button>
                    <button onClick={() => { setShowSpriteImporter(false); setSpriteImportError(''); }} title="Close the importer without saving" className="px-4 py-2 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {sectionOrder.join() !== DEFAULT_SECTION_ORDER.join() && (
          <div className="flex justify-end mb-2">
            <button
              onClick={resetSectionOrder}
              title="Restore the sections below to their default order"
              className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${t.controlBtnDefault} ${t.controlBtnHover}`}
            >
              <RotateCcw size={14} />
              Reset Layout
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>

        <SectionCard
          sectionKey="ramps" accent="#00ffff" bg={t.cardBgCyan} glow={0.4}
          dataTourId="ramp-area"
          open={rampsOpen} onToggle={() => setRampsOpen(o => !o)}
          headerTitle={rampsOpen ? 'Collapse Color Ramps' : 'Expand Color Ramps'}
          icon={<Sun size={22} />} title="Color Ramps"
        >
          <RampsPanel
            theme={theme}
            rampExportStyle={rampExportStyle}
            setRampExportStyle={setRampExportStyle}
            baseColors={baseColors}
            aiColorNames={aiColorNames}
            rampsPunchy={rampsPunchy}
            rampsBalanced={rampsBalanced}
            rampsMuted={rampsMuted}
            stylePresets={stylePresets}
            setStylePresets={setStylePresets}
            activeHardware={activeHardware}
            collapsedRamps={collapsedRamps}
            anyRampExpanded={anyRampExpanded}
            lockedRamps={lockedRamps}
            hiddenShades={hiddenShades}
            rampSizeOverrides={rampSizeOverrides}
            setRampSizeOverrides={setRampSizeOverrides}
            rampSize={rampSize}
            rampSatOverrides={rampSatOverrides}
            setRampSatOverrides={setRampSatOverrides}
            editingIndex={editingIndex}
            editorHsv={editorHsv}
            pinEditor={pinEditor}
            setPinEditor={setPinEditor}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            lightnessCurvePerRamp={lightnessCurvePerRamp}
            setLightnessCurvePerRamp={setLightnessCurvePerRamp}
            satCurvePerRamp={satCurvePerRamp}
            setSatCurvePerRamp={setSatCurvePerRamp}
            gamutPerRamp={gamutPerRamp}
            setGamutPerRamp={setGamutPerRamp}
            hueShiftStrengthPerRamp={hueShiftStrengthPerRamp}
            setHueShiftStrengthPerRamp={setHueShiftStrengthPerRamp}
            spriteLibrary={spriteLibrary}
            spriteKey={spriteKey}
            copiedHex={copiedHex}
            compareAnchor={compareAnchor}
            compareMode={compareMode}
            highlightedRamp={highlightedRamp}
            confirmReset={confirmReset}
            makeRampDragHandlers={makeRampDragHandlers}
            rampDropLine={rampDropLine}
            rampGrip={rampGrip}
            labelsForRamp={labelsForRamp}
            filterHidden={filterHidden}
            resolveBaseForRamp={resolveBaseForRamp}
            resolveSizeForRamp={resolveSizeForRamp}
            resolveHueShiftForRamp={resolveHueShiftForRamp}
            isShadePinned={isShadePinned}
            toggleAllRampsCollapse={toggleAllRampsCollapse}
            resetToDefaults={resetToDefaults}
            resetStylePresets={resetStylePresets}
            toggleRampLock={toggleRampLock}
            shuffleRamp={shuffleRamp}
            duplicateRamp={duplicateRamp}
            copyRampToClipboard={copyRampToClipboard}
            downloadSingleRampGpl={downloadSingleRampGpl}
            resetHiddenShades={resetHiddenShades}
            removeRamp={removeRamp}
            toggleBaseEditor={toggleBaseEditor}
            updateEditorHex={updateEditorHex}
            updateEditorHsv={updateEditorHsv}
            setEditingIndex={setEditingIndex}
            toggleRampCollapse={toggleRampCollapse}
            hideShade={hideShade}
            setOverride={setOverride}
            clearOverride={clearOverride}
            pickCompareSwatch={pickCompareSwatch}
            copyHex={copyHex}
            tagNextLabel={tagNextLabel}
            togglePinEditor={togglePinEditor}
            setBaseColors={setBaseColors}
          />
        </SectionCard>

        <SectionCard
          sectionKey="harmony" accent="#ff00ff" bg={t.cardBgPink} glow={0.4}
          open={harmonyOpen} onToggle={() => setHarmonyOpen(o => !o)}
          headerTitle={harmonyOpen ? 'Collapse Harmony Colors' : 'Expand Harmony Colors'}
          headerTourId="harmony-header"
          icon={<Sparkles size={22} />} title="Harmony Colors"
        >
          <HarmonyPanel
            baseColors={baseColors}
            aiColorNames={aiColorNames}
            safeAnchor={safeAnchor}
            lockedRamps={lockedRamps}
            harmonizeMode={harmonizeMode}
            setHarmonizeMode={setHarmonizeMode}
            harmonizeBaseline={harmonizeBaseline}
            restoreHarmonizeBaseline={restoreHarmonizeBaseline}
            harmonize={harmonize}
            harmony={harmony}
            addHarmonyPair={addHarmonyPair}
            addHarmonyMany={addHarmonyMany}
            setHarmonyAnchor={setHarmonyAnchor}
            addHarmonyColor={addHarmonyColor}
          />
        </SectionCard>

        {/* ---------- Pixel Playground (collapsible) ---------- */}
        <SectionCard
          sectionKey="playground" accent="#00ff88" bg={t.cardBgGreen} glow={0.3}
          open={pgOpen} onToggle={() => setPgOpen(o => !o)}
          headerTitle={pgOpen ? 'Collapse Pixel Playground' : 'Expand Pixel Playground'}
          chevronColor="#a5f3fc" keepMounted
          icon={<Gamepad2 size={22} />} title="Pixel Playground"
        >
          <PlaygroundPanel
            pgOpen={pgOpen}
            vizStyle={vizStyle}
            setVizStyle={setVizStyle}
            rampsBalanced={rampsBalanced}
            rampsMuted={rampsMuted}
            rampsPunchy={rampsPunchy}
            isDark={theme !== 'light'}
          />
        </SectionCard>

        {/* ---------- Visualize & Compare (collapsible) ---------- */}
        <VizComparePanel
          sbsOpen={sbsOpen}
          setSbsOpen={setSbsOpen}
          vizStyle={vizStyle}
          setVizStyle={setVizStyle}
          vizSubOpen={vizSubOpen}
          toggleVizSub={toggleVizSub}
          matrixColorSet={matrixColorSet}
          setMatrixColorSet={setMatrixColorSet}
          matrixView={matrixView}
          setMatrixView={setMatrixView}
          ditherPattern={ditherPattern}
          setDitherPattern={setDitherPattern}
          ditherCrossRamp={ditherCrossRamp}
          setDitherCrossRamp={setDitherCrossRamp}
          ditherZoom={ditherZoom}
          setDitherZoom={setDitherZoom}
          sbsLeft={sbsLeft}
          setSbsLeft={setSbsLeft}
          sbsRight={sbsRight}
          setSbsRight={setSbsRight}
          sbsLeftPayload={sbsLeftPayload}
          sbsRightPayload={sbsRightPayload}
          sbsLeftError={sbsLeftError}
          sbsRightError={sbsRightError}
          sbsLeftLoading={sbsLeftLoading}
          sbsRightLoading={sbsRightLoading}
          sbsRemapSource={sbsRemapSource}
          sbsLeftRemap={sbsLeftRemap}
          sbsRightRemap={sbsRightRemap}
          sbsLeftRemapLoading={sbsLeftRemapLoading}
          sbsRightRemapLoading={sbsRightRemapLoading}
          remapImageDataUrl={remapImageDataUrl}
          remapImageNaturalSize={remapImageNaturalSize}
          remapOutput={remapOutput}
          remapDither={remapDither}
          setRemapDither={setRemapDither}
          remapLoading={remapLoading}
          remapError={remapError}
          remapImageName={remapImageName}
          remapDownloadScale={remapDownloadScale}
          setRemapDownloadScale={setRemapDownloadScale}
          remapDownloadConfirmPending={remapDownloadConfirmPending}
          setRemapDownloadConfirmPending={setRemapDownloadConfirmPending}
          remapDragOver={remapDragOver}
          setRemapDragOver={setRemapDragOver}
          remapDownloadConfirmTimerRef={remapDownloadConfirmTimerRef}
          savedPalettes={savedPalettes}
          aiColorNames={aiColorNames}
          getSnapshotForSlot={getSnapshotForSlot}
          getSlotLabel={getSlotLabel}
          getActiveRemapPalette={getActiveRemapPalette}
          exportLightnessPng={exportLightnessPng}
          exportMosaicPng={exportMosaicPng}
          exportMatrixPng={exportMatrixPng}
          exportDitherPng={exportDitherPng}
          downloadRemap={downloadRemap}
          clearRemapImage={clearRemapImage}
          handleRemapImageUpload={handleRemapImageUpload}
        />
        {/* ---------- Saved Palettes (collapsible) ---------- */}
        <SectionCard
          sectionKey="saved" accent="#ffff00" bg={t.cardBgYellow} glow={0.25}
          open={savedOpen} onToggle={() => setSavedOpen(o => !o)}
          headerTitle={savedOpen ? "Collapse the Saved Palettes section" : "Expand the Saved Palettes section"}
          chevronColor="#a5f3fc"
          icon={<FolderOpen size={22} />} title="Saved Palettes "
          headerAside={<span className="text-xs normal-case tracking-normal" style={{ color: theme === 'dark' ? 'rgba(254, 240, 138, 0.7)' : theme === 'neutral' ? '#2a1a00' : '#713f12' }}>({savedPalettes.length})</span>}
        >
            <SavedPalettesPanel
              savedPalettes={savedPalettes}
              savedError={savedError}
              savedBusy={savedBusy}
              saveName={saveName}
              setSaveName={setSaveName}
              savedFilter={savedFilter}
              setSavedFilter={setSavedFilter}
              confirmDeleteSlug={confirmDeleteSlug}
              renamingSlug={renamingSlug}
              renameDraft={renameDraft}
              setRenameDraft={setRenameDraft}
              renameError={renameError}
              classicLoaderId={classicLoaderId}
              setClassicLoaderId={setClassicLoaderId}
              saveCurrentPalette={saveCurrentPalette}
              loadPalette={loadPalette}
              requestDeletePalette={requestDeletePalette}
              startRename={startRename}
              cancelRename={cancelRename}
              commitRename={commitRename}
              loadClassicPalette={loadClassicPalette}
              saveNameInputRef={saveNameInputRef}
            />
        </SectionCard>

        {/* History panel. Lists every undoable action, newest first, with
            the current state highlighted. Click any entry to jump back
            (or forward) to that point. Session-only: a page reload starts
            fresh. Cap is HISTORY_DEPTH_CAP entries; oldest drops first.
            Keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Y) move sequentially
            through the same list regardless of whether the panel is open.
            Collapsed by default per user preference (matches Photoshop's
            History panel which sits in a sidebar drawer). */}
        <SectionCard
          sectionKey="history" accent="#a855f7" bg={t.cardBgViz} glow={0.25}
          open={historyOpen} onToggle={() => setHistoryOpen(o => !o)}
          headerTitle={historyOpen ? "Collapse the History panel" : "Expand the History panel (undo/redo)"}
          chevronColor="#e9d5ff"
          icon={<History size={22} />} title="History"
          headerAside={
            <span className="text-xs font-normal opacity-70 normal-case tracking-normal">
              ({historyIndex + 1} of {historyEntries.length})
            </span>
          }
        >
            <HistoryPanel />
        </SectionCard>

        {/* Export & Tools: collapsible card matching section card pattern */}
        <SectionCard
          sectionKey="export" accent="#00ffff" bg={t.cardBgViz} glow={0.3}
          marginClass="mb-3" dataTourId="export-panel" headerTourId="export-header"
          open={exportOpen} onToggle={() => setExportOpen(o => !o)}
          headerTitle={exportOpen ? 'Collapse Export & Tools' : 'Expand Export & Tools'}
          icon={<Download size={22} />} title="Export & Tools"
        >
            <ExportPanel
              copyPaletteToClipboard={copyPaletteToClipboard}
              exportLightnessPng={exportLightnessPng}
              exportMosaicPng={exportMosaicPng}
              getSnapshotForSlot={getSnapshotForSlot}
              toggleCompareMode={toggleCompareMode}
              compareMode={compareMode}
              hardwareLock={hardwareLock}
              hwPickerOpen={hwPickerOpen}
              setHwPickerOpen={setHwPickerOpen}
              exportFeedback={exportFeedback}
              lastSavedPath={lastSavedPath}
              revealLastSaved={revealLastSaved}
              bakeHardwareLock={bakeHardwareLock}
              toggleHardwareLock={toggleHardwareLock}
              gplStyle={gplStyle}
              setGplStyle={setGplStyle}
              exportFormat={exportFormat}
              setExportFormat={setExportFormat}
              exportActiveFormat={exportActiveFormat}
              handleGplFile={handleGplFile}
            />
        </SectionCard>
        </div>{/* end sortable sections */}

        <div className="rounded-lg overflow-hidden" style={{ background: t.tipPanelBg, border: `2px solid ${t.tipPanelBorder}` }}>
          <button onClick={() => setTipsOpen(o => !o)} title={tipsOpen ? 'Collapse Tips' : 'Expand Tips'} className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
            <span className={`text-xs font-bold uppercase tracking-widest ${t.tipPanelStrong}`}>Tips</span>
            <span className={t.tipPanelText}>{tipsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {tipsOpen && <div className={`px-4 pb-4 text-xs ${t.tipPanelText}`}>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ TIP:</strong> Click any swatch to copy its hex code.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ DICE:</strong> Rolls a random hex into the Single Color input. Click again to re-roll.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ SURPRISE ME:</strong> The AI invents a subject AND generates its palette in one shot. Uses one API call.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ IMPORT:</strong> Drop a Piskel C file to add custom preview sprites.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ COPY:</strong> Click the cyan icon on custom sprites to copy their source code.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ EDIT:</strong> Click the slider icon on any ramp to adjust its base color with HSV sliders or a color picker.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ PIN:</strong> Click the pushpin on any shade (except the base) to lock that shade to a custom hex. The base shade is always your chosen base color, so pinning it would do nothing. Pins are per-style: a pin on a Balanced swatch only affects the Balanced ramp. Click a pinned pin again to unpin.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HIDE SHADE:</strong> Right-click any swatch to hide that shade across all 3 styles for that base. Hidden shades are excluded from .gpl / .txt exports and the visualization. Use the Restore button on the ramp card to bring them back. The last visible shade in a ramp cannot be hidden.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ CONTRAST:</strong> Hover any ramp swatch to see WCAG AA contrast ratios against its neighbors. Click the WCAG Check button to enter pick-two mode: click an anchor, then any other ramp swatch to see the ratio, AA tier, and a live foreground/background preview.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HARMONIZE:</strong> Rotates every unlocked non-anchor ramp to a color-theory position (complement, analogous, triadic, etc.) relative to the anchor ramp. Anchor is the ramp set in the Derive From selector. Lock any ramp to hold its hue in place during the rotation.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ LOCK RAMP:</strong> Click the lock icon on any ramp card to freeze it. Generate, Shuffle, and Harmonize all skip locked ramps. Pins and hidden shades are unaffected. Useful for protecting a finished ramp while iterating on the rest of the palette.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ SIDE-BY-SIDE:</strong> Compare two palettes (the working palette or any saved palette) in mosaic, lightness bar, and chromatic plot views. Useful for comparing a candidate palette against an established one. Distinct from WCAG Check in the export bar, which checks two individual swatches for WCAG contrast.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HARMONY:</strong> With multiple ramps, use the "Derive From" selector at the top of the Harmony Colors section to choose which ramp drives the harmony palette.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ SAVE:</strong> Name and save palettes locally. They persist across browser sessions on this device. The Saved Palettes section also has a compact loader for the classic "inspired by" presets (DB16, PICO-8, Game Boy, etc).</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ LOCK:</strong> Click a hardware button (NES, Game Boy, CGA 16, EGA 64, C64) to enter a persistent lock mode. Every generated shade and harmony color snaps to the nearest hardware-legal hex. Click the active button again or "Unlock" to return to free generation. Non-destructive: your base colors and pins are preserved.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HISTORY:</strong> The History section above the export bar lists your recent actions. Click any entry to jump to that state, or use Cmd/Ctrl+Z and Cmd/Ctrl+Y for sequential undo/redo. Last 20 actions are remembered per browser session; a page reload starts fresh.</p>
          <p><strong className={t.tipPanelStrong}>▸ .GPL:</strong> Standard GIMP palette format, importable into Piskel, Aseprite, GIMP, Krita, and most pixel art tools.</p>
          </div>}
        </div>
        </div>{/* end CVD filter wrapper */}

        {/* Update notification. Fixed bottom-right, outside CVD wrapper. */}
        {updateInfo && (
          <div className="fixed bottom-4 right-4 z-50 rounded-lg p-4 border-2 w-80" style={{ background: 'rgba(26,10,46,0.97)', borderColor: themedAccentBorder('#00ffff'), boxShadow: '0 0 24px rgba(0,255,255,0.4)' }}>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2" style={{ color: sectionHeadColor('#00ffff'), textShadow: accentTextGlow('#00ffff') }}>
              Update Available
            </h3>
            <p className="text-xs text-cyan-100/80 mb-3">
              Version {updateInfo.version} is{updateInfo.isPortable ? ' available.' : ' ready.'}{' '}
              {updateInfo.isPortable
                ? 'Portable builds don’t auto-update; grab the new .exe from the Releases page.'
                : updateReady ? 'Downloaded and ready to install.' : updateDownloading ? 'Downloading...' : 'Download and install now?'}
            </p>
            <div className="flex gap-2 flex-wrap">
              {updateInfo.isPortable && (
                <button
                  onClick={() => { window.electronAPI?.openReleasesPage?.(); setUpdateInfo(null); }}
                  className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all"
                  style={{ boxShadow: '0 0 8px #00ffff' }}
                >
                  Open Releases
                </button>
              )}
              {!updateInfo.isPortable && !updateReady && !updateDownloading && (
                <button
                  onClick={() => { setUpdateDownloading(true); window.electronAPI?.downloadUpdate?.(); }}
                  className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all"
                  style={{ boxShadow: '0 0 8px #00ffff' }}
                >
                  Update Now
                </button>
              )}
              {!updateInfo.isPortable && updateReady && (
                <button
                  onClick={() => window.electronAPI?.installUpdate?.()}
                  className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all"
                  style={{ boxShadow: '0 0 8px #00ffff' }}
                >
                  Restart to Install
                </button>
              )}
              {(updateInfo.isPortable || (!updateReady && !updateDownloading)) && (
                <>
                  <button
                    onClick={() => setUpdateInfo(null)}
                    className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-purple-900/60 text-cyan-200 border-2 border-cyan-700/50 hover:bg-purple-800/60 transition-all"
                  >
                    Later
                  </button>
                  <button
                    onClick={() => { window.electronAPI?.skipUpdate?.(updateInfo.version); setUpdateInfo(null); }}
                    className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-purple-900/60 text-pink-200 border-2 border-pink-700/50 hover:bg-purple-800/60 transition-all"
                  >
                    Skip This Version
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* WCAG Check floating panel. Sits OUTSIDE the CVD filter wrapper
            so its color swatches and ratio numbers stay legible regardless
            of which colorblind simulation is active. Fixed to the top-right
            so it doesn't cover ramp content while the user is picking. */}
        {compareMode && (
          <div className="fixed top-4 right-4 z-40 rounded-lg p-4 border-2 max-w-sm w-80" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ffff00'), boxShadow: '0 0 20px rgba(255, 255, 0, 0.5)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}>
                <Contrast size={16} />WCAG Contrast
              </h3>
              <button onClick={toggleCompareMode} title="Exit WCAG Check" className="w-6 h-6 bg-pink-500 text-white rounded-full border-2 border-pink-200 hover:bg-pink-400 hover:scale-110 transition-all flex items-center justify-center text-sm font-bold" style={{ boxShadow: '0 0 8px rgba(255, 0, 110, 0.6)' }}>×</button>
            </div>
            {!compareAnchor && (
              <p className="text-xs text-cyan-100/80">Click any ramp swatch to set it as the anchor color.</p>
            )}
            {compareAnchor && !compareResult && (
              <div className="space-y-2">
                <p className="text-xs text-cyan-100/80">Anchor set. Click another swatch to compute the contrast ratio.</p>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded border-2 border-yellow-300" style={{ background: compareAnchor.hex, boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }} />
                  <div className="text-xs text-cyan-100 font-mono">{compareAnchor.hex.toUpperCase()}</div>
                </div>
              </div>
            )}
            {compareAnchor && compareResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded border-2 border-yellow-300" style={{ background: compareResult.aHex, boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }} />
                    <div className="text-[10px] text-cyan-100 font-mono">{compareResult.aHex.toUpperCase()}</div>
                  </div>
                  <span className="text-cyan-200 text-lg font-bold">vs</span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded border-2 border-cyan-300" style={{ background: compareResult.bHex, boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }} />
                    <div className="text-[10px] text-cyan-100 font-mono">{compareResult.bHex.toUpperCase()}</div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: compareResult.tier === 'AA' ? '#86efac' : compareResult.tier === 'AA Large' ? '#fde047' : '#fca5a5' }}>{compareResult.ratio.toFixed(2)}:1</div>
                  <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: compareResult.tier === 'AA' ? '#86efac' : compareResult.tier === 'AA Large' ? '#fde047' : '#fca5a5' }}>
                    {compareResult.tier === 'AA' && 'Passes AA (4.5:1 normal text)'}
                    {compareResult.tier === 'AA Large' && 'Passes AA Large only (3:1 large text / UI)'}
                    {compareResult.tier === 'fail' && 'Fails AA (below 3:1)'}
                  </div>
                </div>
                {/* Live preview: B-on-A and A-on-B text samples so the user
                    can eyeball whether the ratio is acceptable for their
                    actual use case. WCAG ratios are perceptually imperfect;
                    seeing the swatch as foreground/background often clarifies
                    what passing actually looks like. */}
                <div className="space-y-1">
                  <div className="rounded text-center py-2 text-sm font-bold" style={{ background: compareResult.aHex, color: compareResult.bHex }}>Sample text Sample text</div>
                  <div className="rounded text-center py-2 text-sm font-bold" style={{ background: compareResult.bHex, color: compareResult.aHex }}>Sample text Sample text</div>
                </div>
                <p className="text-[10px] text-cyan-100/60 text-center">Click anchor again to unlock. Click another swatch to compare against the anchor.</p>
              </div>
            )}
          </div>
        )}

        {/* GPL import modal. Shown when gplImport state is set (after a
            successful or failed parse). Sits OUTSIDE the CVD filter
            wrapper so its colors aren't subject to colorblind simulation.
            Fixed-position overlay covers the whole viewport. Modal
            content is centered. The error case shows just a close button;
            the success case shows two action buttons (all / subset) and
            a cancel. */}
        {gplImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setGplImport(null)}>
            <div onClick={(e) => e.stopPropagation()} className="rounded-lg p-6 border-2 max-w-md w-full" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ffff00'), boxShadow: t.glowStrong > 0.5 ? '0 0 30px rgba(255, 255, 0, 0.5)' : accentGlow('#ffff00', 0.4) }}>
              <h2 className="text-xl font-bold mb-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}>Import .GPL</h2>
              {gplImport.error ? (
                <>
                  <p className="text-sm mb-4 text-cyan-100/80">{gplImport.error}</p>
                  <div className="flex justify-end">
                    <button onClick={() => setGplImport(null)} title="Close this dialog" className={`px-4 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}>Close</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm mb-1 text-cyan-100/80">Loaded <span className="font-bold text-yellow-200">{gplImport.name}</span> with <span className="font-bold text-yellow-200">{gplImport.colors.length}</span> color{gplImport.colors.length === 1 ? '' : 's'}.</p>
                  <p className="text-xs italic mb-4 text-cyan-100/60">This will replace your current palette. How should the imported colors be used?</p>
                  {/* Color preview strip */}
                  <div className="flex w-full rounded overflow-hidden border-2 mb-4" style={{ height: '24px', borderColor: t.vizDataBorder }}>
                    {gplImport.colors.slice(0, 32).map((hex, i) => (
                      <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => applyGplImport('all')} title="Use every imported color as a base (capped at 16)" className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-2" style={{ boxShadow: '0 0 10px rgba(255, 255, 0, 0.4)' }}>
                      <Palette size={14} />
                      Use all as bases{gplImport.colors.length > 16 ? ` (first 16 of ${gplImport.colors.length})` : ` (${gplImport.colors.length} ramps)`}
                    </button>
                    <button onClick={() => applyGplImport('subset')} title="Let the app cluster the imported colors and pick representative bases automatically" className="px-4 py-2 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-200 hover:bg-cyan-300 transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-2" style={{ boxShadow: '0 0 10px rgba(0, 255, 255, 0.4)' }}>
                      <Sparkles size={14} />
                      Auto-pick representatives
                    </button>
                    <button onClick={() => setGplImport(null)} title="Cancel import without changing the current palette" className={`px-4 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <TourPanel
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
        onStartGuide={startTour}
      />
      <TourOverlay
        open={tourOpen}
        guideId={tourGuideId}
        step={tourStep}
        appState={{ mode, imageDataUrl, exportOpen, compareMode, hwPickerOpen, baseColors, harmonized: harmonizeBaseline != null }}
        runSetup={runTourSetup}
        onSetStep={setTourStep}
        onExit={exitTour}
      />
    </div>
    </EditorProvider>
    </PaletteProvider>
    </LayoutProvider>
    </ThemeProvider>
  );
}