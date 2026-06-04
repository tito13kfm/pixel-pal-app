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
const DEFAULT_SECTION_ORDER = ['playground', 'viz', 'saved', 'history', 'export'];

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
    const valid = Array.isArray(loaded)
      && loaded.length === DEFAULT_SECTION_ORDER.length
      && DEFAULT_SECTION_ORDER.every(k => loaded.includes(k));
    return valid ? loaded : DEFAULT_SECTION_ORDER;
  });
  const resetSectionOrder = () => setSectionOrder(DEFAULT_SECTION_ORDER);

  // { key, pos: 'before'|'after' } — drop target + which edge, from cursor half
  const [dragOver, setDragOver] = useState(null);
  const [draggingKey, setDraggingKey] = useState(null);

  // Persist the panel-open set on every change (no mount-skip: the original
  // wrote on first render too, harmless re-write of the loaded values).
  useEffect(() => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen, pgOpen, rampsOpen }))
  }, [harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen, pgOpen, rampsOpen]);

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
    vizSubOpen, toggleVizSub,
    sectionOrder, setSectionOrder, resetSectionOrder, DEFAULT_SECTION_ORDER,
    dragOver, setDragOver, draggingKey, setDraggingKey,
  };
}
