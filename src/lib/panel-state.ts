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
}

export const PANEL_STORAGE_KEY = 'ui:panels';

export const PANEL_DEFAULTS: PanelState = {
  harmonyOpen: true, tipsOpen: false, hwPickerOpen: false, exportOpen: false,
  historyOpen: false, savedOpen: false, sbsOpen: false, pgOpen: false, rampsOpen: true,
};

export function loadPanelState(): PanelState {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    return raw ? { ...PANEL_DEFAULTS, ...JSON.parse(raw) } : PANEL_DEFAULTS;
  } catch {
    return PANEL_DEFAULTS;
  }
}
