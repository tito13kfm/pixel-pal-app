// Harmony handlers (#113): append derived harmony colors to the palette as
// new bases, plus the global Harmonize action (rotate unlocked bases to
// color-theory positions around the anchor) and its restore-baseline undo.
//
// Extracted from App.tsx in two steps: the add-as-base handlers first, then
// harmonize/restoreHarmonizeBaseline with their mode/baseline state once the
// binding pattern for cross-domain callbacks (tagNextLabel /
// setExportFeedback) was established. Document state (baseColors, compare
// fields, lockedRamps) flows through the Zustand-backed usePaletteState();
// the anchor/mood inputs and cross-domain callbacks arrive via params.
// Consumed by HarmonyPanel via App.tsx prop wiring.
//
// All three add handlers skip colors already present in baseColors (the base
// itself is already a ramp) and pad aiColorNames up to the current base
// count before appending, so names stay index-aligned even when earlier
// bases never got a name.
import { useCallback, useEffect, useState } from 'react';
import { usePaletteState } from './usePaletteState';
import { hexToHsl, hslToHex } from '../lib/color';
import { applyMoodToHex } from '../lib/mood';
import type { MOOD_PRESETS } from '../lib/constants';

type MoodPreset = (typeof MOOD_PRESETS)[number];

interface UseHarmonyParams {
  safeAnchor: number;
  activeMood: MoodPreset | null;
  tagNextLabel: (label: string) => void;
  setExportFeedback: (v: string) => void;
}

export function useHarmony({ safeAnchor, activeMood, tagNextLabel, setExportFeedback }: UseHarmonyParams) {
  const {
    baseColors, setBaseColors, setAiColorNames, lockedRamps,
    setCompareAnchor, setCompareResult,
  } = usePaletteState();

  const [harmonizeMode, setHarmonizeMode] = useState('complement');
  const [harmonizeBaseline, setHarmonizeBaseline] = useState<string[] | null>(null);

  const addHarmonyColor = useCallback((hex: string, name: string) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  }, [baseColors, setBaseColors, setAiColorNames]);

  const addHarmonyPair = useCallback((hex1: string, hex2: string, name1: string, name2: string) => {
    const toAdd: string[] = [], namesToAdd: string[] = [];
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
  const addHarmonyMany = useCallback((pairs: { hex: string; name: string }[]) => {
    const toAdd: string[] = [], namesToAdd: string[] = [];
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
    const targets: number[] = [];
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
    const HARMONIZE_MODE_SLOTS: Record<string, number[]> = {
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

  // Drop the restore baseline when the base count changes: the saved hues
  // no longer line up index-for-index with the current ramps. (Previously a
  // line inside App.tsx's baseColors.length watcher effect.)
  useEffect(() => {
    if (harmonizeBaseline && harmonizeBaseline.length !== baseColors.length) setHarmonizeBaseline(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- length watcher only, same as the original App.tsx effect
  }, [baseColors.length]);

  return {
    addHarmonyColor, addHarmonyPair, addHarmonyMany,
    harmonize, restoreHarmonizeBaseline,
    harmonizeMode, setHarmonizeMode, harmonizeBaseline,
  };
}
