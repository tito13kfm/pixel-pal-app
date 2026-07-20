import { useState, useEffect } from 'react';
import { PANEL_STORAGE_KEY, loadPanelState } from '../lib/panel-state';

/**
 * Collapsible-section layout state: the open/closed flag for each panel
 * (ramps, harmony, tips, hardware picker, export, history, saved, side-by-side,
 * playground), the per-ramp Advanced disclosure map, the user's custom section
 * order, and the in-progress drag-reorder state. Two persistence effects keep
 * the panel-open set and the section order in localStorage. The panel-open
 * defaults are read ONCE at module import (matching the original module-level
 * `_panels` in App.tsx) so a remount doesn't re-hit storage mid-session.
 *
 * `historyOpen` is a panel toggle and lives here; Wave 2's useHistory receives
 * `setHistoryOpen` as a callback rather than owning the state.
 */
const _panels = loadPanelState();
const DEFAULT_SECTION_ORDER = ['ramps', 'harmony', 'playground', 'viz', 'saved', 'lospec', 'history', 'export'];

// Collapsible subsections inside the Visualize & Compare card (main view only;
// compare slots always render expanded). Persisted separately from the panel set
// under its own key so the panel-state schema/test stays untouched. Default: all
// open. Unknown/missing keys fall back to open via the base-merge below.
const VIZ_SUBSECTIONS = ['imagePreview', 'chromatic', 'lightness', 'mosaic', 'adjacency', 'dither'];

export function usePanelLayout() {
  const [rampsOpen, setRampsOpen] = useState(_panels.rampsOpen);
  const [harmonyOpen, setHarmonyOpen] = useState(_panels.harmonyOpen);
  const [tipsOpen, setTipsOpen] = useState(_panels.tipsOpen);
  const [hwPickerOpen, setHwPickerOpen] = useState(_panels.hwPickerOpen);
  const [exportOpen, setExportOpen] = useState(_panels.exportOpen);
  const [historyOpen, setHistoryOpen] = useState(_panels.historyOpen);
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [savedOpen, setSavedOpen] = useState(_panels.savedOpen);
  const [sbsOpen, setSbsOpen] = useState(_panels.sbsOpen);
  const [pgOpen, setPgOpen] = useState(_panels.pgOpen);
  const [lospecOpen, setLospecOpen] = useState(_panels.lospecOpen);

  const [vizSubOpen, setVizSubOpen] = useState<Record<string, boolean>>(() => {
    const base = Object.fromEntries(VIZ_SUBSECTIONS.map(k => [k, true]));
    try {
      const loaded = JSON.parse(localStorage.getItem('ui:vizSubOpen') || 'null');
      return loaded && typeof loaded === 'object' && !Array.isArray(loaded)
        ? { ...base, ...loaded }
        : base;
    } catch { return base; }
  });
  const toggleVizSub = (key: string) => setVizSubOpen(m => ({ ...m, [key]: !m[key] }));

  const [sectionOrder, setSectionOrder] = useState(() => {
    const loaded = JSON.parse(localStorage.getItem('ui:sectionOrder') || 'null');
    if (!Array.isArray(loaded)) return DEFAULT_SECTION_ORDER;
    // Merge, don't reset: keep the saved order for keys we still know, then append
    // any DEFAULT keys the saved order is missing (cards added in a later version,
    // e.g. ramps/harmony in #44) and drop stale keys no longer in DEFAULT. This
    // preserves a user's existing arrangement instead of discarding it wholesale
    // the way a strict length/every check did when new keys appeared.
    const known = loaded.filter(k => DEFAULT_SECTION_ORDER.includes(k));
    const missing = DEFAULT_SECTION_ORDER.filter(k => !known.includes(k));
    const merged = [...known, ...missing];
    return merged.length === DEFAULT_SECTION_ORDER.length ? merged : DEFAULT_SECTION_ORDER;
  });
  const resetSectionOrder = () => setSectionOrder(DEFAULT_SECTION_ORDER);

  // { key, pos: 'before'|'after' }: drop target + which edge, from cursor half
  const [dragOver, setDragOver] = useState(null);
  const [draggingKey, setDraggingKey] = useState(null);

  // Persist the panel-open set on every change (no mount-skip: the original
  // wrote on first render too, harmless re-write of the loaded values).
  useEffect(() => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen, pgOpen, rampsOpen, lospecOpen }))
  }, [harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen, pgOpen, rampsOpen, lospecOpen]);

  useEffect(() => {
    localStorage.setItem('ui:sectionOrder', JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  useEffect(() => {
    localStorage.setItem('ui:vizSubOpen', JSON.stringify(vizSubOpen));
  }, [vizSubOpen]);

  return {
    rampsOpen, setRampsOpen, harmonyOpen, setHarmonyOpen, tipsOpen, setTipsOpen,
    hwPickerOpen, setHwPickerOpen, exportOpen, setExportOpen,
    historyOpen, setHistoryOpen, advancedOpen, setAdvancedOpen,
    savedOpen, setSavedOpen, sbsOpen, setSbsOpen, pgOpen, setPgOpen,
    lospecOpen, setLospecOpen,
    vizSubOpen, toggleVizSub,
    sectionOrder, setSectionOrder, resetSectionOrder, DEFAULT_SECTION_ORDER,
    dragOver, setDragOver, draggingKey, setDraggingKey,
  };
}
