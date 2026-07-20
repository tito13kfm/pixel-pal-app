import { describe, it, expect, beforeEach } from 'vitest';
import { PANEL_STORAGE_KEY, PANEL_DEFAULTS, loadPanelState } from '../../src/lib/panel-state';

describe('loadPanelState', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults when nothing is stored', () => {
    expect(loadPanelState()).toEqual(PANEL_DEFAULTS);
  });

  it('merges stored partial state over defaults', () => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ tipsOpen: true }));
    expect(loadPanelState()).toEqual({ ...PANEL_DEFAULTS, tipsOpen: true });
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(PANEL_STORAGE_KEY, '{not json');
    expect(loadPanelState()).toEqual(PANEL_DEFAULTS);
  });

  it('ignores non-object JSON and returns defaults', () => {
    localStorage.setItem(PANEL_STORAGE_KEY, '123');
    expect(loadPanelState()).toEqual(PANEL_DEFAULTS);
  });

  it('defaults lospecOpen to false', () => {
    localStorage.removeItem(PANEL_STORAGE_KEY);
    expect(loadPanelState().lospecOpen).toBe(false);
  });
});
