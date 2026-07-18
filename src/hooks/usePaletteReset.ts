// Shared palette-reset paths (#113): resetPaletteState (the customization
// wipe every full-palette-replace path calls) and resetToDefaults (the
// user-visible two-click "start fresh" action).
//
// Extracted from App.tsx. Document state flows through the Zustand-backed
// usePaletteState(); the cross-domain state resetPaletteState also clears
// (side-by-side slots, image-remap output, the colorInput field) arrives
// via params, as do tagNextLabel and the reset-confirm state owned by
// useSavedPalettes. Owns only the confirm auto-disarm timer handle.
import { useRef } from 'react';
import { usePaletteState } from './usePaletteState';
import { buildRandomHex } from '../lib/randomizer';

interface UsePaletteResetParams {
  // Side-by-side slot state (useSideBySide).
  setSbsLeft: (v: string | null) => void;
  setSbsRight: (v: string | null) => void;
  setSbsLeftPayload: (v: null) => void;
  setSbsRightPayload: (v: null) => void;
  setSbsLeftError: (v: string) => void;
  setSbsRightError: (v: string) => void;
  setSbsLeftLoading: (v: boolean) => void;
  setSbsRightLoading: (v: boolean) => void;
  // Image remap output (useImageRemap).
  setRemapOutput: (v: null) => void;
  setRemapOutputSignature: (v: null) => void;
  setRemapError: (v: string) => void;
  // Reset-confirm state (useSavedPalettes) + the Single Color input field.
  confirmReset: boolean;
  setConfirmReset: (v: boolean) => void;
  setColorInput: (v: string) => void;
  tagNextLabel: (label: string) => void;
}

export function usePaletteReset(p: UsePaletteResetParams) {
  const {
    setSbsLeft, setSbsRight, setSbsLeftPayload, setSbsRightPayload,
    setSbsLeftError, setSbsRightError, setSbsLeftLoading, setSbsRightLoading,
    setRemapOutput, setRemapOutputSignature, setRemapError,
    confirmReset, setConfirmReset, setColorInput, tagNextLabel,
  } = p;
  const {
    setBaseColors, setAiColorNames, setShuffleSeed,
    setOverrides, setPinEditor, setHarmonyAnchor,
    setRampSizeOverrides, setRampSatOverrides, setHueShiftStrengthPerRamp,
    setHiddenShades, setRampShuffleOffsets,
    setCompareAnchor, setCompareResult,
    setCollapsedRamps, setLockedRamps,
    setHueShiftStrength, setEditingIndex,
    setLightnessCurvePerRamp, setSatCurvePerRamp,
    setRampStyleOverrides, setRampStyleScalars,
  } = usePaletteState();

  const resetConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // resetPaletteState: clears every customization layer that the eight
  // full-palette-replace paths share. Callers are still responsible for
  // setting baseColors (or aiColorNames when applicable),
  // tagging the next history label via tagNextLabel, and bumping the shuffle seed if their path
  // requires it. Preserves rampSize, hardwareLock, moodPreset, theme, CRT,
  // CVD on purpose: those are session-level settings, not per-palette state.
  // paletteDefaultStyle is preserved for the same reason (the user's working
  // style survives New/Surprise Me); the two per-ramp #69 style maps are
  // per-palette and cleared below.
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
    // #69 per-ramp style overrides + custom scalars are keyed to the old
    // palette's ramp indices; loadPalette re-sets them from the payload
    // after this wipe, every other replace path starts clean.
    setRampStyleOverrides({});
    setRampStyleScalars({});
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

  return { resetPaletteState, resetToDefaults };
}
