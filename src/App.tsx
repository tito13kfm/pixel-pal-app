// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Copy, Shuffle, Palette, Sparkles, Download, Sun, Wand2, Upload, Image as ImageIcon, Dice5, Pipette, ChevronDown, ChevronUp, BarChart3, Save, Trash2, FolderOpen, Sliders, Pin, Contrast, Cpu, Plus, Columns, Lock, Unlock, History, RotateCcw, Edit2, Check, X, CopyPlus, GripVertical, Gamepad2 } from 'lucide-react';
import { hexToHsl, hslToHex, hexToRgb } from './lib/color';
import {
  WORD_POOL, spriteVase, spriteWalkman, spriteCassette,
  spriteDiamond, DEFAULT_SPRITE_LIBRARY,
  HARDWARE_PALETTES, MOOD_PRESETS,
} from './lib/constants';
import { TourPanel } from './components/TourPanel'
import { TourOverlay } from './components/TourOverlay'
import { RampAdvancedPanel } from './components/RampAdvancedPanel';
import { PixelPlayground } from './components/PixelPlayground';
import type { GamutStrategySerialized } from './lib/palette';
import { lightnessMarkers, LIGHTNESS_GRIDLINES } from './lib/strip-export';
import { AdjacencyMatrix } from './components/AdjacencyMatrix';
import { DitherBlend } from './components/DitherBlend';
import { CrossRampDither } from './components/CrossRampDither';
import { DITHER_PATTERNS } from './lib/viz-interaction';
import { THEME_TOKENS } from './lib/theme';
import { V2EngineNotice } from './components/V2EngineNotice';
import { CvdActiveBadge } from './components/CvdActiveBadge';
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
import { DEFAULT_STYLE_PRESETS } from './lib/style-presets';
import { buildRandomHex } from './lib/randomizer';
import { generatePalette } from './lib/palette-generator';
import { applyMoodToHex } from './lib/mood';
import { generateHarmony } from './lib/harmony';
import { parsePiskelC } from './lib/palette-import';
import { quantizeToHardware } from './lib/hardware-quantize';
import { buildRampsForSnapshot } from './lib/snapshot-ramps';
import { buildRamp } from './lib/ramp-pipeline';
import { isValidRampSize } from './lib/ramp-engine';
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
import { useImageExtractHandlers } from './hooks/useImageExtractHandlers';
import { useImageRemap } from './hooks/useImageRemap';
import { useImageRemapCompute } from './hooks/useImageRemapCompute';
import { useHarmony } from './hooks/useHarmony';
import { useSideBySide } from './hooks/useSideBySide';
import { useSideBySideCompute } from './hooks/useSideBySideCompute';
import { useSavedPalettes } from './hooks/useSavedPalettes';
import { useSavedPalettesActions } from './hooks/useSavedPalettesActions';
import { useRampEditing } from './hooks/useRampEditing';
import { formatHistoryAge } from './lib/history-snapshot';
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

// hexToHsl, hslToHex, hexToRgb: imported from ./lib/color.
// The HSV editor conversions (hexToHsv/hsvToHex) and the WCAG compare
// helpers moved with their handlers to hooks/useRampEditing.ts (#113
// slice 3).


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
  // ----- Image Remap Preview -----
  // Separate image slot from the From Image extraction feature. The user
  // uploads a reference image and remaps every pixel to the nearest color
  // in the currently active palette (vizStyle, hidden shades, hardware
  // lock applied); a debounced effect recomputes the preview as the
  // palette changes. None of this state is persisted (matches the From
  // Image mode), saved with palettes, or in the history snapshot. See
  // IMAGE_REMAP_PLAN.md and ARCHITECTURE.md's remap section for the full
  // design. The remap STATE fields live in the useImageRemap() hook
  // (destructured above); the compute pipeline + handlers live in
  // useImageRemapCompute() (called below, after the ramp memos it reads);
  // the SBS slot remap effects stay here in the wiring layer.

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
  // Ref to the Save Palette name input. Used by the `S` keyboard
  // shortcut to scroll the saved-palettes section into view and focus
  // the field for immediate typing. Set via the ref attribute on the
  // input element down in the JSX tree.
  const saveNameInputRef = useRef(null);
  const resetConfirmTimerRef = useRef(null);

  // Active hardware palette object when locked, otherwise null. Resolved
  // here once so the ramp useMemos don't re-do the find on every iteration.
  const activeHardware = useMemo(() => {
    if (!hardwareLock) return null;
    return HARDWARE_PALETTES.find(hw => hw.id === hardwareLock) || null;
  }, [hardwareLock]);

  // Mood preset (#135): a MOOD_PRESETS id or null. Session-level setting like
  // hardwareLock (survives resetPaletteState on purpose), but unlike
  // hardwareLock it is NOT in the undo snapshot and NOT in saved payloads:
  // it never changes currently rendered output, it only biases FUTURE
  // Surprise Me / Around This / Harmonize actions. Composes with Hardware
  // Lock (mood shapes base-color inputs; the lock quantizes rendered shades).
  // Persisted as ui:moodPreset (see the effects near the other ui:* prefs).
  const [moodPreset, setMoodPreset] = useState(null);
  const activeMood = useMemo(() => {
    if (!moodPreset) return null;
    return MOOD_PRESETS.find(m => m.id === moodPreset) || null;
  }, [moodPreset]);


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
  // buildWorkingSnapshot (viz/export/compare, in useSideBySideCompute). Both must carry the same
  // buildRamp inputs to stay in sync (#36, #37) - extend this, not either
  // call site, when a new render input is added (#62).
  const workingRenderInputs = useCallback(() => ({
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

  const liveRampSnapshot = useMemo(() => workingRenderInputs(), [workingRenderInputs]);

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

  // ----- Image Remap Preview wiring -----
  // The compute pipeline (active-palette derivation, upload/clear/download
  // handlers, the debounced auto-refresh effect, and the two-click download
  // confirmation timer) lives in useImageRemapCompute. It reads the SAME
  // ramp memos the Visualization section uses (vizStyle, hidden shades,
  // hardware lock baked in), which guarantees preview/viz parity. The remap
  // STATE stays in useImageRemap (destructured above).
  const {
    getActiveRemapPalette, handleRemapImageUpload, clearRemapImage,
    downloadRemap, remapDownloadConfirmTimerRef,
  } = useImageRemapCompute({
    baseColors, rampsPunchy, rampsBalanced, rampsMuted, vizStyle,
    resolveBaseForRamp: boundResolveBaseForRamp, labelsForRamp, filterHidden: boundFilterHidden,
    remapImageDataUrl, setRemapImageDataUrl, remapImageNaturalSize, setRemapImageNaturalSize,
    setRemapOutput, setRemapOutputSignature, remapDither, setRemapLoading, setRemapError,
    remapImageName, setRemapImageName, remapDownloadScale, setRemapDownloadScale,
    remapDownloadConfirmPending, setRemapDownloadConfirmPending,
  });

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

  // surpriseMe / buildAroundColor: backlog item F, the non-AI one-click
  // multi-base generator. Both are full-palette-replace paths and follow the
  // same contract as handleGenerate's 'color' branch: tag history, replace
  // baseColors, resetPaletteState, then bump shuffleSeed DIRECTLY (locks were
  // just cleared; bumpShuffleSeed reads the old lockedRamps closure and would
  // take the wrong branch, see ARCHITECTURE.md rules 1-2). The active mood
  // preset (#135) biases hue/chroma/lightness sampling when set.
  const surpriseMe = () => {
    const colors = generatePalette({ count: 5, mood: activeMood });
    tagNextLabel(activeMood ? `Surprise Me (${activeMood.name})` : 'Surprise Me');
    setColorInput(colors[0]);
    setBaseColors(colors);
    setAiColorNames([]);
    setEditingIndex(null);
    resetPaletteState();
    setShuffleSeed(s => s + 1);
  };

  // Seeded variant: the current colorInput hex is kept VERBATIM as base 1
  // (never mood-clamped; the user's pick wins) and 4 companions are derived
  // around its hue.
  const buildAroundColor = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
      setAddBaseFeedback('Invalid hex');
      setTimeout(() => setAddBaseFeedback(''), 2000);
      return;
    }
    const colors = generatePalette({ count: 5, seedHex: colorInput, mood: activeMood });
    tagNextLabel(`Palette around ${colorInput.toLowerCase()}`);
    setBaseColors(colors);
    setAiColorNames([]);
    setEditingIndex(null);
    resetPaletteState();
    setShuffleSeed(s => s + 1);
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

  // Harmony add handlers (append derived harmony colors as new bases) live
  // in useHarmony; HarmonyPanel receives them via props below.
  const { addHarmonyColor, addHarmonyPair, addHarmonyMany } = useHarmony({
    baseColors, setBaseColors, setAiColorNames,
  });


  // Per-ramp / per-shade editing handlers (#113 slice 3): remove/duplicate,
  // dock scroll+highlight, base editor, pin/override cluster, hide/restore,
  // per-ramp + lock-aware shuffle, ramp lock, WCAG compare handlers, and the
  // card collapse toggles live in useRampEditing. Document state flows
  // through the Zustand-backed usePaletteState inside the hook.
  const {
    removeRamp, duplicateRamp, scrollToRamp, highlightedRamp,
    toggleBaseEditor, updateEditorHsv, updateEditorHex,
    isShadePinned, togglePinEditor, setOverride, clearOverride,
    hideShade, resetHiddenShades,
    shuffleRamp, bumpShuffleSeed, toggleRampLock,
    toggleCompareMode, pickCompareSwatch,
    toggleRampCollapse, toggleAllRampsCollapse, anyRampExpanded,
  } = useRampEditing({ tagNextLabel, setExportFeedback });


  // resetPaletteState: clears every customization layer that the eight
  // full-palette-replace paths share. Callers are still responsible for
  // setting baseColors (or aiColorNames when applicable),
  // tagging the next history label via tagNextLabel, and bumping the shuffle seed if their path
  // requires it. Preserves rampSize, hardwareLock, moodPreset, theme, CRT,
  // CVD on purpose: those are session-level settings, not per-palette state.
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

  // From Image extraction handlers (#113): upload/drag-drop/paste decode +
  // extract, re-extract, and the eyedropper live in useImageExtractHandlers.
  // Panel state stays in useImageExtract (destructured above). Called here
  // (not next to the state hook) because it binds resetPaletteState and
  // bumpShuffleSeed, which are declared just above.
  const {
    handleImageUpload, reExtractFromImage,
    handleDragOver, handleDragLeave, handleDrop,
    handleImageHover, handleImageLeave, handleImageClick,
  } = useImageExtractHandlers({
    mode, imageDataUrl, setImageDataUrl, imageColorCount,
    setImageLoading, setImageError, setIsDragging, eyedropperActive,
    setImageZoom, setImageNaturalSize, setHoveredColor,
    tagNextLabel, resetPaletteState, bumpShuffleSeed,
  });

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
      // Mood bias (#135): clamp the rotated color into the active mood's
      // hue/chroma/lightness envelope. Applied AFTER the rotation so the
      // color-theory relationship drives placement and the mood constrains
      // it. The anchor is untouched (it never enters this loop).
      if (activeMood) newBaseColors[i] = applyMoodToHex(newBaseColors[i], activeMood);
    }
    const modeLabel = harmonizeMode.replace('-', ' ');
    const moodSuffix = activeMood ? `, ${activeMood.name}` : '';
    tagNextLabel(`Harmonize (${targets.length}, ${modeLabel}${moodSuffix})`);
    setBaseColors(newBaseColors);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback(`Harmonized ${targets.length} ramp${targets.length === 1 ? '' : 's'}: ${modeLabel}${moodSuffix}`);
    setTimeout(() => setExportFeedback(''), 2000);
  }, [baseColors, safeAnchor, lockedRamps, harmonizeBaseline, harmonizeMode, activeMood, setExportFeedback, setHarmonizeBaseline, tagNextLabel, setBaseColors, setCompareAnchor, setCompareResult]);
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

  // rampSize: persisted at ui:rampSize. Valid values 2..64.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:rampSize');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (isValidRampSize(parsed)) {
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

  // moodPreset: persisted at ui:moodPreset (#135). Session-level bias for
  // Surprise Me / Around This / Harmonize; same load-once + mountRef-guarded
  // persist shape as ui:rampSize. Valid values: a MOOD_PRESETS id or null.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:moodPreset');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && MOOD_PRESETS.some(m => m.id === parsed)) {
            setMoodPreset(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default (null).
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount load, same as ui:rampSize
  }, []);
  const moodPresetMountRef = useRef(false);
  useEffect(() => {
    if (!moodPresetMountRef.current) { moodPresetMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:moodPreset', JSON.stringify(moodPreset)); } catch {}
    })();
  }, [moodPreset]);

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
  // Saved-palette persistence + import handlers (#113 slice 2): the list
  // refresh, save/load/delete/rename, the classic + .gpl loaders, and the
  // two-click delete-confirm timer live in useSavedPalettesActions. Document
  // state flows through the Zustand-backed usePaletteState inside the hook;
  // everything non-store-backed is bound here. gplImport/setGplImport come
  // back out because the Escape handler and the import modal JSX read them.
  const {
    saveCurrentPalette, loadPalette, loadClassicPalette,
    gplImport, setGplImport, handleGplFile, applyGplImport,
    requestDeletePalette, startRename, cancelRename, commitRename,
  } = useSavedPalettesActions({
    savedPalettes, setSavedPalettes, saveName, setSaveName,
    setSavedError, setSavedBusy,
    confirmDeleteSlug, setConfirmDeleteSlug,
    setRenamingSlug, renameDraft, setRenameDraft, setRenameError,
    gplStyle, setGplStyle, vizStyle, setVizStyle,
    spriteKey, setSpriteKey, customSprites, setCustomSprites,
    gamutPerRamp, setGamutPerRamp, advancedOpen, setAdvancedOpen,
    setV2NoticePending, setExportFeedback, tagNextLabel, resetPaletteState,
  });

  // History watcher, ref-sync, and undo/redo keybinds now live in useHistory.
  // Side-by-side compare pipeline (#113): the per-slot saved-payload fetch
  // effects, slot -> snapshot resolution (working / classic / saved slug),
  // slot display labels, and the SBS image-remap effects (shared source
  // decode + per-slot worker remaps) live in useSideBySideCompute. The SBS
  // STATE stays in useSideBySide (destructured above); the shared remap
  // upload comes from useImageRemap.
  const { getSnapshotForSlot, getSlotLabel } = useSideBySideCompute({
    workingRenderInputs, hiddenShades, rampSize, stylePresets, hueShiftStrength,
    vizStyle, savedPalettes, remapImageDataUrl, remapDither,
    sbsLeft, sbsRight, sbsLeftPayload, setSbsLeftPayload, sbsRightPayload, setSbsRightPayload,
    setSbsLeftError, setSbsRightError, setSbsLeftLoading, setSbsRightLoading,
    sbsRemapSource, setSbsRemapSource, setSbsLeftRemap, setSbsRightRemap,
    setSbsLeftRemapLoading, setSbsRightRemapLoading,
  });

  // History snapshot machinery (applyUndoSnapshot, undo/redo/jumpToHistoryIndex,
  // canUndo/canRedo) lives in useHistory. inferLabel lives in
  // ./lib/history-snapshot. undo/redo/jump/canUndo/canRedo are destructured from
  // the useHistory() call above.

  // formatHistoryAge (relative-time formatter for the History panel) moved
  // to lib/history-snapshot.ts (#113 slice 2); imported above.

  // toggleRampCollapse / toggleAllRampsCollapse / anyRampExpanded moved to
  // hooks/useRampEditing.ts (#113 slice 3); destructured above.

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
  // `compareMode`) are declared. `gplImport` now arrives from the
  // useSavedPalettesActions() call above; an earlier placement throws
  // "Cannot access 'gplImport' before initialization" when React
  // evaluates the dependency array during render (temporal dead zone).
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
  // Placement: must be AFTER the useSavedPalettesActions() call that
  // returns `gplImport` (same TDZ constraint as the Escape handler above).
  // `harmonize` declares earlier in the component body.
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
          .text-pink-300:not([class*="bg-black/"]),
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
          [class*="bg-black/"] .text-pink-300 { color: #f9a8d4 !important; }
          [class*="bg-black/"] [class*="text-pink-300/"] { color: #f9a8d4 !important; }
          [class*="bg-black/"] .text-yellow-200 { color: #fef08a !important; }
          [class*="bg-black/"] .text-yellow-100 { color: #fef9c3 !important; }
          [class*="bg-black/"] .text-green-100 { color: #dcfce7 !important; }
          input[class*="bg-black/"], textarea[class*="bg-black/"], select[class*="bg-black/"] {
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
          surpriseMe={surpriseMe} buildAroundColor={buildAroundColor}
          moodPreset={moodPreset} setMoodPreset={setMoodPreset}
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
            moodPreset={moodPreset}
            setMoodPreset={setMoodPreset}
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

        <CvdActiveBadge cvdMode={cvdMode} />

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
              <p className="text-xs text-cyan-100/80 bg-black/60 rounded px-2 py-1">Click any ramp swatch to set it as the anchor color.</p>
            )}
            {compareAnchor && !compareResult && (
              <div className="space-y-2 bg-black/60 rounded p-2">
                <p className="text-xs text-cyan-100/80">Anchor set. Click another swatch to compute the contrast ratio.</p>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded border-2 border-yellow-300" style={{ background: compareAnchor.hex, boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }} />
                  <div className="text-xs text-cyan-100 font-mono">{compareAnchor.hex.toUpperCase()}</div>
                </div>
              </div>
            )}
            {compareAnchor && compareResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 justify-center bg-black/60 rounded p-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded border-2 border-yellow-300" style={{ background: compareResult.aHex, boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }} />
                    <div className="text-[10px] text-cyan-100 font-mono">{compareResult.aHex.toUpperCase()}</div>
                  </div>
                  <span className="text-lg font-bold" style={{ color: themedAccent('#00ffff') }}>vs</span>
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
                <p className="text-[10px] text-cyan-100/60 text-center bg-black/60 rounded px-2 py-1">Click anchor again to unlock. Click another swatch to compare against the anchor.</p>
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
                  <p className="text-sm mb-4 text-cyan-100/80 bg-black/60 rounded px-2 py-1">{gplImport.error}</p>
                  <div className="flex justify-end">
                    <button onClick={() => setGplImport(null)} title="Close this dialog" className={`px-4 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}>Close</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm mb-1 text-cyan-100/80 bg-black/60 rounded px-2 py-1">Loaded <span className="font-bold text-yellow-200">{gplImport.name}</span> with <span className="font-bold text-yellow-200">{gplImport.colors.length}</span> color{gplImport.colors.length === 1 ? '' : 's'}.</p>
                  <p className="text-xs italic mb-4 text-cyan-100/60 bg-black/60 rounded px-2 py-1">This will replace your current palette. How should the imported colors be used?</p>
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