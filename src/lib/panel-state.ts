export interface PanelState {
  harmonyOpen: boolean;
  tipsOpen: boolean;
  hwPickerOpen: boolean;
  exportOpen: boolean;
  historyOpen: boolean;
  savedOpen: boolean;
  sbsOpen: boolean;
  pgOpen: boolean;
  rampsOpen: boolean;
  lospecOpen: boolean;
}

export const PANEL_STORAGE_KEY = 'ui:panels';

export const PANEL_DEFAULTS: PanelState = {
  harmonyOpen: true, tipsOpen: false, hwPickerOpen: false, exportOpen: false,
  historyOpen: false, savedOpen: false, sbsOpen: false, pgOpen: false, rampsOpen: true,
  lospecOpen: false,
};

export function loadPanelState(): PanelState {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    // JSON.parse returns any; unknown keys and wrong-typed values pass through at runtime.
    return raw ? { ...PANEL_DEFAULTS, ...JSON.parse(raw) } as PanelState : PANEL_DEFAULTS;
  } catch {
    return PANEL_DEFAULTS;
  }
}
