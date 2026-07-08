// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Copy, Shuffle, Palette, Sparkles, Download, Sun, Wand2, Upload, Image as ImageIcon, Dice5, Pipette, ChevronDown, ChevronUp, BarChart3, Save, Trash2, FolderOpen, Sliders, Pin, Contrast, Cpu, Plus, Columns, Lock, Unlock, History, RotateCcw, Edit2, Check, X, CopyPlus, GripVertical, Gamepad2 } from 'lucide-react';
import {
  hexToHsl, hslToHex, hexToRgb, rgbToHex,
  rgbToHsl, hslToRgb, hexToHsv, hsvToHex, hsvToRgb,
} from './lib/color';
import { presetToPoints } from './lib/curve';
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
import { slugify } from './lib/palette';
import { lightnessMarkers, LIGHTNESS_GRIDLINES } from './lib/strip-export';
import { AdjacencyMatrix } from './components/AdjacencyMatrix';
import { DitherBlend } from './components/DitherBlend';
import { CrossRampDither } from './components/CrossRampDither';
import { DITHER_PATTERNS } from './lib/viz-interaction';
import { THEME_TOKENS } from './lib/theme';
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
import { InputPanel } from './components/panels/InputPanel';
import { HeaderControls } from './components/panels/HeaderControls';
import { wcagRelativeLuminance, wcagContrast, wcagAaTier } from './lib/wcag';
import { DEFAULT_STYLE_PRESETS } from './lib/style-presets';
import { buildRandomHex } from './lib/randomizer';
import { generateHarmony } from './lib/harmony';
import { parsePiskelC, parseGpl, subsetGplColors } from './lib/palette-import';
import { quantizeToHardware } from './lib/hardware-quantize';
import { extractDominantColors } from './lib/image-extract';
import { remapImageToPalette, computeRemapScaleOptions, estimateRemapCost } from './lib/image-remap';
import { buildRampsForSnapshot } from './lib/snapshot-ramps';
import { buildRamp } from './lib/ramp-pipeline';
import { shadeLabelsFor, labelsForRamp, applyOverrides, filterHidden, resolveBaseForRamp, resolveSizeForRamp, resolveHueShiftForRamp, generateRamp } from './lib/ramp-helpers';
import { permuteStringKeyMap } from './lib/permute-indexed-state';
import { ThemeProvider, LayoutProvider, PaletteProvider, EditorProvider } from './contexts';
import { useDisplaySettings } from './hooks/useDisplaySettings';
import { useVizSettings } from './hooks/useVizSettings';
import { useExportSettings } from './hooks/useExportSettings';
import { useExport } from './hooks/useExport';
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

  // Active hardware palette object when locked, otherwise null. Resolved
  // here once so the ramp useMemos don't re-do the find on every iteration.
  const activeHardware = useMemo(() => {
    if (!hardwareLock) return null;
    return HARDWARE_PALETTES.find(hw => hw.id === hardwareLock) || null;
  }, [hardwareLock]);


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
  // Shared render-input field set for liveRampSnapshot (main grid) and
  // buildWorkingSnapshot (viz/export/compare) below. Both must carry the same
  // buildRamp inputs to stay in sync (#36, #37) - extend this, not either
  // call site, when a new render input is added (#62).
  const workingRenderInputs = () => ({
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
  });

  const liveRampSnapshot = useMemo(() => workingRenderInputs(), [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, hardwareLock, hueShiftStrength, hueShiftStrengthPerRamp, lightnessCurvePerRamp, satCurvePerRamp, gamutPerRamp, shuffleSeed, rampShuffleOffsets, stylePresets]);

  const rampsPunchy = useMemo(() => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, 'punchy', i)), [liveRampSnapshot]);
  const rampsBalanced = useMemo(() => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, 'balanced', i)), [liveRampSnapshot]);
  const rampsMuted = useMemo(() => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, 'muted', i)), [liveRampSnapshot]);

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

  // resolveBaseForRamp and filterHidden gained explicit state params when
  // they moved to lib/ramp-helpers.ts (SP2 phase c, task 3). useExport's own
  // parameter types stay fixed at their original 2-arg/3-arg shape, so bind
  // the extra state here rather than changing useExport's signature.
  const boundResolveBaseForRamp = (hex, i) => resolveBaseForRamp(hex, i, rampSatOverrides);
  const boundFilterHidden = (ramp, labels, i) => filterHidden(ramp, labels, i, hiddenShades);
  const boundResolveSizeForRamp = (i) => resolveSizeForRamp(i, rampSizeOverrides, rampSize);
  const boundResolveHueShiftForRamp = (i) => resolveHueShiftForRamp(i, hueShiftStrengthPerRamp, hueShiftStrength);

  const {
    copyHex, buildPaletteText, exportPalette, exportLightnessPng, exportMosaicPng,
    exportMatrixPng, exportDitherPng, copyPaletteToClipboard, collectPaletteEntries,
    buildPaletteGpl, exportPaletteGpl, exportPalettePal, exportPaletteAse,
    exportPaletteStripPng, exportActiveFormat, revealLastSaved, buildSingleRampText,
    buildSingleRampGpl, copyRampToClipboard, downloadSingleRampGpl,
  } = useExport({
    baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted, harmony,
    resolveBaseForRamp: boundResolveBaseForRamp, labelsForRamp, filterHidden: boundFilterHidden, buildRampsForSnapshot,
    rampSize, vizStyle, gplStyle, rampExportStyle, exportFormat,
    matrixColorSet, matrixView, ditherPattern,
    copiedHex, setCopiedHex, exportFeedback, setExportFeedback,
    lastSavedPath, setLastSavedPath, sessionRampGplFolder, setSessionRampGplFolder,
  });

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
      const effectiveBase = resolveBaseForRamp(baseColors[i], i, rampSatOverrides);
      const labels = labelsForRamp(ramp, effectiveBase);
      return filterHidden(ramp, labels, i, hiddenShades).hexes;
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

  const addHarmonyColor = useCallback((hex, name) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  }, [baseColors, setBaseColors, setAiColorNames]);

  const addHarmonyPair = useCallback((hex1, hex2, name1, name2) => {
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
  }, [baseColors, setBaseColors, setAiColorNames]);

  // N-ary version for tetradic/square which add 3 derived colors (the base
  // itself is already a ramp). Skips any color that's already in baseColors
  // and any duplicate among the input pairs.
  const addHarmonyMany = useCallback((pairs) => {
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
  }, [baseColors, setBaseColors, setAiColorNames]);

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
  const harmonize = useCallback(() => {
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
    const HARMONIZE_MODE_SLOTS = {
      complement:         [180],
      analogous:          [30, 330, 15, 345, 45, 315, 20, 340, 60, 300, 10],
      triadic:            [120, 240, 60, 180, 300, 30, 90, 150, 210, 270, 330],
      'split-complement': [150, 210, 30, 330, 120, 240, 60, 180, 90, 270, 45],
      square:             [90, 180, 270, 45, 135, 225, 315, 30, 60, 120, 150],
      tetradic:           [60, 240, 180, 120, 300, 30, 90, 150, 210, 270, 330],
    };
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
  }, [baseColors, safeAnchor, lockedRamps, harmonizeBaseline, harmonizeMode, setExportFeedback, setHarmonizeBaseline, tagNextLabel, setBaseColors, setCompareAnchor, setCompareResult]);
  const restoreHarmonizeBaseline = useCallback(() => {
    if (!harmonizeBaseline) return;
    tagNextLabel('Restore pre-harmonize hues');
    setBaseColors(harmonizeBaseline.slice());
    setHarmonizeBaseline(null);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback('Restored original hues');
    setTimeout(() => setExportFeedback(''), 2000);
  }, [harmonizeBaseline, tagNextLabel, setBaseColors, setHarmonizeBaseline, setCompareAnchor, setCompareResult, setExportFeedback]);

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
      ...workingRenderInputs(),
      hiddenShades, // working-only: the live grid hides at the display
                    // boundary instead (see liveRampSnapshot comment above)
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
        const effBase = resolveBaseForRamp(baseColors[i], i, rampSatOverrides);
        const effSize = resolveSizeForRamp(i, rampSizeOverrides, rampSize);
        for (const style of STYLES) {
          const raw = generateRamp(effBase, effSize, style, hueShiftStrength, i, {
            gamutPerRamp, stylePresets, shuffleSeed, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp,
          });
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



  // eslint-disable-next-line react-hooks/exhaustive-deps -- THEME_TOKENS is pure static; deps=[theme] is correct
  const t = useMemo(() => THEME_TOKENS[theme] || THEME_TOKENS.dark, [theme]);

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
          <BaseColorDock baseColors={baseColors} onDelete={removeRamp} onJump={scrollToRamp} cvdMode={cvdMode} />
        )}
        <V2EngineNotice show={v2NoticePending} />
        <HeaderControls
          setLauncherOpen={setLauncherOpen}
          theme={theme} setTheme={setTheme}
          crtEnabled={crtEnabled} setCrtEnabled={setCrtEnabled}
          cvdMode={cvdMode} setCvdMode={setCvdMode}
        />

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

        <InputPanel
          mode={mode} setMode={setMode} colorInput={colorInput} setColorInput={setColorInput}
          randomizeColor={randomizeColor} addColorAsBase={addColorAsBase} addBaseFeedback={addBaseFeedback}
          isDragging={isDragging} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleDrop={handleDrop}
          imageDataUrl={imageDataUrl} handleImageUpload={handleImageUpload} imageColorCount={imageColorCount} setImageColorCount={setImageColorCount}
          reExtractFromImage={reExtractFromImage} imageLoading={imageLoading} eyedropperActive={eyedropperActive} setEyedropperActive={setEyedropperActive}
          hoveredColor={hoveredColor} imageZoom={imageZoom} setImageZoom={setImageZoom} imageNaturalSize={imageNaturalSize} setImageNaturalSize={setImageNaturalSize}
          imageRef={imageRef} handleImageHover={handleImageHover} handleImageLeave={handleImageLeave} handleImageClick={handleImageClick} imageError={imageError}
          handleGenerate={handleGenerate}
          spriteLibrary={spriteLibrary} rampsPunchy={rampsPunchy} spriteKey={spriteKey} setSpriteKey={setSpriteKey}
          removeCustomSprite={removeCustomSprite} copySpriteSource={copySpriteSource} showSpriteImporter={showSpriteImporter} setShowSpriteImporter={setShowSpriteImporter}
          spriteDragging={spriteDragging} handleSpriteDragOver={handleSpriteDragOver} handleSpriteDragLeave={handleSpriteDragLeave} handleSpriteDrop={handleSpriteDrop}
          handleSpriteFile={handleSpriteFile} spriteImportName={spriteImportName} setSpriteImportName={setSpriteImportName}
          spriteImportText={spriteImportText} setSpriteImportText={setSpriteImportText} spriteImportError={spriteImportError} setSpriteImportError={setSpriteImportError}
          importSprite={importSprite}
          rampSize={rampSize} setRampSize={setRampSize} hueShiftStrength={hueShiftStrength} setHueShiftStrength={setHueShiftStrength}
        />

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
            filterHidden={boundFilterHidden}
            resolveBaseForRamp={boundResolveBaseForRamp}
            resolveSizeForRamp={boundResolveSizeForRamp}
            resolveHueShiftForRamp={boundResolveHueShiftForRamp}
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