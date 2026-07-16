// Single Color tab generation actions (#113): New palette (handleGenerate),
// the random hex roller, the one-click multi-base generators (#135), and
// Add-to-Palette.
//
// Extracted from App.tsx. Document state flows through the Zustand-backed
// usePaletteState(); the colorInput field stays App-owned (resetToDefaults
// and the JSX read it too) and arrives via params along with the mood, the
// cross-domain callbacks, and mode. Owns only the inline "Add to Palette"
// feedback string + its auto-clear timers.
import { useState } from 'react';
import { usePaletteState } from './usePaletteState';
import { buildRandomHex } from '../lib/randomizer';
import { generatePalette } from '../lib/palette-generator';
import type { MOOD_PRESETS } from '../lib/constants';

type MoodPreset = (typeof MOOD_PRESETS)[number];

interface UseGenerationActionsParams {
  mode: string;
  colorInput: string;
  setColorInput: (v: string) => void;
  activeMood: MoodPreset | null;
  tagNextLabel: (label: string) => void;
  resetPaletteState: () => void;
  bumpShuffleSeed: () => void;
}

export function useGenerationActions(p: UseGenerationActionsParams) {
  const { mode, colorInput, setColorInput, activeMood, tagNextLabel, resetPaletteState, bumpShuffleSeed } = p;
  const {
    baseColors, setBaseColors, setAiColorNames, setShuffleSeed,
    setEditingIndex, rampSize, setRampSizeOverrides,
  } = usePaletteState();

  // Brief inline feedback shown next to the "Add to Palette" button on the
  // Single Color tab. Separate from exportFeedback because the export
  // badge lives near the bottom of the page and is invisible to a user
  // working at the top. Clears itself via setTimeout.
  const [addBaseFeedback, setAddBaseFeedback] = useState('');

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

  return { addBaseFeedback, handleGenerate, randomizeColor, surpriseMe, buildAroundColor, addColorAsBase };
}
