// Stateful wrapper owning the per-ramp / per-shade editing handlers
// (#113 slice 3).
//
// Extracted from App.tsx: remove/duplicate ramp (with all the base-keyed
// re-keying), the dock scroll-and-highlight, the base-color editor
// (open/close + HSV/hex commits), the per-shade pin/override cluster,
// hide/restore shades, per-ramp + lock-aware global shuffle, ramp lock,
// the WCAG compare-mode handlers, and the card collapse toggles.
//
// Every piece of document state these handlers touch lives in the
// Zustand-backed usePaletteState(), so the hook reads/writes the exact
// same store App.tsx renders from and only two cross-domain callbacks
// arrive via params (same binding pattern as useSavedPalettesActions).
// The only state owned here is the dock-highlight flash (highlightedRamp
// + its auto-clear timer).
//
// Deliberately NOT here: resetPaletteState / resetToDefaults (they also
// clear side-by-side + image-remap state owned by App.tsx), harmonize /
// restoreHarmonizeBaseline (App-local baseline/mode state), and the
// generation handlers (colorInput / mood / image-extract domains).
import { useRef, useState } from 'react';
import { usePaletteState } from './usePaletteState';
import { hexToHsv, hsvToHex } from '../lib/color';
import { hexToOklch, oklchToHex, gamutMap } from '../lib/oklch';
import type { Oklch } from '../lib/oklch';
import { wcagContrast, wcagAaTier } from '../lib/wcag';

// Sparse per-shade pin map: overrides[baseIndex][shadeIndex] = { punchy?,
// balanced?, muted? }. The store types the field as Record<string, unknown>
// (it never looks inside); this is the real shape the handlers maintain.
type OverridesMap = Record<string, Record<string, Record<string, string>>>;

interface UseRampEditingParams {
  tagNextLabel: (label: string) => void;
  setExportFeedback: (v: string) => void;
  // gamutPerRamp is App-local state (not store-backed), so its re-keying on
  // remove/duplicate goes through this setter, mirroring how reorderRamps'
  // caller permutes it (ARCHITECTURE.md invariant 3).
  setGamutPerRamp: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function useRampEditing(p: UseRampEditingParams) {
  const {
    baseColors, setBaseColors, setAiColorNames,
    setShuffleSeed,
    overrides, setOverrides,
    setHarmonyAnchor,
    setRampSizeOverrides, setRampSatOverrides,
    setHueShiftStrengthPerRamp,
    setLightnessCurvePerRamp, setSatCurvePerRamp,
    hiddenShades, setHiddenShades, setRampShuffleOffsets,
    lockedRamps, setLockedRamps, collapsedRamps, setCollapsedRamps,
    editingIndex, setEditingIndex, setEditorHsv,
    setEditorOklch, setEditorMode,
    pinEditor, setPinEditor,
    setCompareMode, compareAnchor, setCompareAnchor, setCompareResult,
  } = usePaletteState();

  const removeRamp = (index: number) => {
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
    setOverrides(prev0 => {
      const prev = prev0 as OverridesMap;
      const next: OverridesMap = {};
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
    // keeps pointing at the same color. The safeAnchor read in App.tsx also
    // guards against any one-frame staleness here.
    setHarmonyAnchor(prev => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
    // Same shift logic for per-ramp size and saturation overrides.
    const shiftBaseKeyedMap = <T,>(prev: Record<number, T>): Record<number, T> => {
      const next: Record<number, T> = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (idx === index) continue;
        const newIdx = idx > index ? idx - 1 : idx;
        next[newIdx] = prev[idx];
      }
      return next;
    };
    setRampSizeOverrides(shiftBaseKeyedMap);
    setRampSatOverrides(shiftBaseKeyedMap);
    setHiddenShades(shiftBaseKeyedMap);
    setRampShuffleOffsets(shiftBaseKeyedMap);
    // Per-ramp advanced settings follow the same drop-and-shift rule
    // (ARCHITECTURE.md invariant 3). These four were historically missed
    // (tracked on #113): removing a ramp left a per-ramp hue shift,
    // Advanced curve, or gamut strategy attached to the wrong index.
    setHueShiftStrengthPerRamp(shiftBaseKeyedMap);
    setLightnessCurvePerRamp(shiftBaseKeyedMap);
    setSatCurvePerRamp(shiftBaseKeyedMap);
    p.setGamutPerRamp(shiftBaseKeyedMap);
    // collapsedRamps is a Set, not an object map. Same shift semantics:
    // drop the removed index, shift later indices down by 1.
    setCollapsedRamps(prev => {
      const next = new Set<number>();
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
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx === index) continue;
        next.add(idx > index ? idx - 1 : idx);
      }
      return next;
    });
  };

  // Base-color dock (#80): smooth-scroll to a ramp and flash a highlight when
  // the user clicks a swatch body in the dock.
  const [highlightedRamp, setHighlightedRamp] = useState<number | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToRamp = (index: number) => {
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
  // sat override, hidden shades, ramp shuffle offset, per-ramp hue shift,
  // lightness/sat curves, gamut strategy, ai color name). The
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
  const duplicateRamp = (i: number) => {
    if (i < 0 || i >= baseColors.length) return;
    p.tagNextLabel('Duplicate ramp');
    // Deep-clone helper for per-base entries. Plain JSON is sufficient:
    // the contents are POJO maps / arrays / primitives.
    const deepClone = <T,>(entry: T): T => (entry === undefined ? entry : JSON.parse(JSON.stringify(entry)));
    // Generic appender for sparse base-keyed maps: writes the cloned
    // source entry at index N (the position after append).
    const appendDup = <T,>(map: Record<number, T>): Record<number, T> => {
      if (!Object.prototype.hasOwnProperty.call(map, i)) return map;
      const N = baseColors.length;
      return { ...map, [N]: deepClone(map[i]) };
    };
    setBaseColors(prev => [...prev, prev[i]]);
    setAiColorNames(prev => [...prev, prev[i] !== undefined ? prev[i] : '']);
    setOverrides(appendDup as (prev: Record<string, unknown>) => Record<string, unknown>);
    setRampSizeOverrides(appendDup);
    setRampSatOverrides(appendDup);
    setHiddenShades(appendDup);
    setRampShuffleOffsets(appendDup);
    // Per-ramp advanced settings are part of the ramp's identity too
    // (ARCHITECTURE.md invariant 3); without these the duplicate rendered
    // differently from its source whenever the source had a per-ramp hue
    // shift, Advanced curve, or gamut strategy (tracked on #113).
    setHueShiftStrengthPerRamp(appendDup);
    setLightnessCurvePerRamp(appendDup);
    setSatCurvePerRamp(appendDup);
    p.setGamutPerRamp(appendDup as (prev: Record<string, unknown>) => Record<string, unknown>);
    p.setExportFeedback('Duplicated ramp');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  // Open/close the base-color editor for ramp `index`. Toggling the same index
  // closes it. Opening a different index switches and re-seeds editorHsv from
  // that ramp's current base color.
  const toggleBaseEditor = (index: number) => {
    if (editingIndex === index) {
      setEditingIndex(null);
      return;
    }
    const hex = baseColors[index];
    if (hex) {
      // Keep the exact (unrounded) HSV as the live editing state. Rounding
      // here used to bake into editorHsv permanently: the next single-slider
      // drag would spread the other two rounded channels back into baseColors,
      // silently snapping hue/saturation by up to +/-0.5 even though the user
      // only touched one slider. Rounding now happens only at render time for
      // the numeric labels (see RampsPanel).
      setEditorHsv(hexToHsv(hex));
      const oklch = hexToOklch(hex);
      if (oklch) setEditorOklch(oklch);
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
  const updateEditorHsv = (next: { h: number; s: number; v: number }) => {
    setEditorHsv(next);
    if (editingIndex === null) return;
    const hex = hsvToHex(next);
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // Commit a hex update from the color picker: writes hex through, then syncs
  // the editor's HSV display so the sliders reflect the new value. The picker
  // can produce arbitrary 24-bit values that don't correspond to round HSV
  // numbers, so we let the displayed HSV show the actual derived values.
  const updateEditorHex = (hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    setEditorHsv(hexToHsv(hex));
    const oklch = hexToOklch(hex);
    if (oklch) setEditorOklch(oklch);
    if (editingIndex === null) return;
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // Commit an OKLCH update from the editor: mirrors updateEditorHsv, writing
  // the live editorOklch state directly (never re-derived from hex mid-drag,
  // for the same reason described above) and gamut-mapping ('auto', same
  // default as the ramp engine) before converting to hex so an out-of-sRGB
  // chroma/lightness/hue combination still produces a valid base color.
  const updateEditorOklch = (next: Oklch) => {
    setEditorOklch(next);
    if (editingIndex === null) return;
    const hex = oklchToHex(gamutMap(next, 'auto'));
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // Switch which color space the base-color editor sliders show. Re-seeds the
  // *other* representation from the current base color hex at the switch
  // point only (not on every drag), so neither cache drifts from the other.
  const updateEditorMode = (mode: 'hsv' | 'oklch') => {
    if (editingIndex !== null) {
      const hex = baseColors[editingIndex];
      // Same guard as toggleBaseEditor: baseColors[editingIndex] is undefined
      // for an out-of-range index, which would otherwise propagate into
      // hexToHsv/hexToOklch as a bad hex string.
      if (hex) {
        if (mode === 'oklch') {
          const oklch = hexToOklch(hex);
          if (oklch) setEditorOklch(oklch);
        } else {
          setEditorHsv(hexToHsv(hex));
        }
      }
    }
    setEditorMode(mode);
  };

  // ---------- Per-shade override helpers ----------
  // Overrides are keyed by (baseIndex, shadeIndex, style). isShadePinned
  // tests for a pin in one specific style; setOverride writes one; clearOverride
  // removes one and prunes empty containers up the tree.
  const isShadePinned = (baseIndex: number, shadeIndex: number, style: string): boolean => {
    const inner = (overrides as OverridesMap)[baseIndex];
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
  const togglePinEditor = (baseIndex: number, shadeIndex: number, style: string, currentHex: string) => {
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
  const setOverride = (baseIndex: number, shadeIndex: number, style: string, hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    if (!['punchy', 'balanced', 'muted'].includes(style)) return;
    const norm = hex.toLowerCase();
    setOverrides(prev0 => {
      const prev = prev0 as OverridesMap;
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
  const clearOverride = (baseIndex: number, shadeIndex: number, style: string) => {
    setOverrides(prev0 => {
      const prev = prev0 as OverridesMap;
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
  const hideShade = (baseIndex: number, shadeIndex: number, rampLen: number) => {
    const currentHidden = Array.isArray(hiddenShades[baseIndex]) ? hiddenShades[baseIndex] : [];
    if (currentHidden.includes(shadeIndex)) return; // already hidden
    const wouldBeHidden = currentHidden.length + 1;
    if (wouldBeHidden >= rampLen) {
      // Last visible shade; refuse.
      p.setExportFeedback('Cannot hide the last visible shade');
      setTimeout(() => p.setExportFeedback(''), 2000);
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
  const resetHiddenShades = (baseIndex: number) => {
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
  const shuffleRamp = (baseIndex: number) => {
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

  // toggleRampLock: flip lock state for one ramp index. Used by the
  // padlock icon on each ramp card.
  const toggleRampLock = (baseIndex: number) => {
    setLockedRamps(prev => {
      const next = new Set(prev);
      if (next.has(baseIndex)) next.delete(baseIndex);
      else next.add(baseIndex);
      return next;
    });
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
  const pickCompareSwatch = (baseIndex: number, shadeIndex: number, style: string, hex: string) => {
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

  // Toggle a single ramp card's collapse state. When collapsing a card
  // whose base editor or pin editor is currently open, close those too
  // since they reference shades that are about to be hidden.
  const toggleRampCollapse = (index: number) => {
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

  return {
    removeRamp, duplicateRamp, scrollToRamp, highlightedRamp,
    toggleBaseEditor, updateEditorHsv, updateEditorHex,
    updateEditorOklch, updateEditorMode,
    isShadePinned, togglePinEditor, setOverride, clearOverride,
    hideShade, resetHiddenShades,
    shuffleRamp, bumpShuffleSeed, toggleRampLock,
    toggleCompareMode, pickCompareSwatch,
    toggleRampCollapse, toggleAllRampsCollapse, anyRampExpanded,
  };
}
