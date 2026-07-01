import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import App from '../../src/App';
import {
  enableRenderCounts, disableRenderCounts, resetRenderCounts, getRenderCount,
} from '../../src/lib/renderCount';
import { useRampsStore } from '../../src/store/rampsStore';
import { DEFAULT_STYLE_PRESETS } from '../../src/lib/style-presets';

// Zustand stores are module-level singletons: state persists across render(<App/>)
// calls within this file (unlike the old useState-based hook, where every mount
// got fresh defaults). Reset to defaults before each test so later tests here
// can't inherit ramps state leaked by earlier ones.
function resetRampsStore() {
  useRampsStore.setState({
    baseColors: ['#ff00ff'],
    aiColorNames: [],
    rampSize: 6,
    shuffleSeed: 0,
    overrides: {},
    harmonyAnchor: 0,
    rampSizeOverrides: {},
    rampSatOverrides: {},
    hueShiftStrengthPerRamp: {},
    hiddenShades: {},
    rampShuffleOffsets: {},
    hardwareLock: null,
    hueShiftStrength: 1.0,
    lockedRamps: new Set(),
    collapsedRamps: new Set(),
    lightnessCurvePerRamp: {},
    satCurvePerRamp: {},
    editingIndex: null,
    editorHsv: { h: 0, s: 0, v: 0 },
    pinEditor: null,
    compareMode: false,
    compareAnchor: null,
    compareResult: null,
    stylePresets: DEFAULT_STYLE_PRESETS,
  });
}

// NOTE: do NOT wrap <App> in StrictMode here — StrictMode double-renders and would
// double the counts. RTL's render() does not add StrictMode, which is what we want.
describe('phase-a memo: panel render isolation', () => {
  beforeEach(() => {
    resetRampsStore();
    disableRenderCounts();
  });

  it('HistoryPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    // History uses `{open && children}`, so expand it to mount the panel.
    fireEvent.click(screen.getByTitle('Expand the History panel (undo/redo)'));
    resetRenderCounts();
    // Orthogonal interaction: Tips toggle. `tipsOpen` is passed to no panel.
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('HistoryPanel')).toBe(0);
  });

  it('PlaygroundPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    // PlaygroundPanel is keepMounted, so it is already mounted — no expand needed.
    resetRenderCounts();
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('PlaygroundPanel')).toBe(0);
  });

  it('PlaygroundPanel renders at least once on mount (memo is not over-aggressive)', () => {
    enableRenderCounts();
    render(<App />);
    expect(getRenderCount('PlaygroundPanel')).toBeGreaterThan(0);
  });
});

describe('phase-b memo: HarmonyPanel render isolation', () => {
  beforeEach(() => {
    resetRampsStore();
    disableRenderCounts();
  });

  it('HarmonyPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    resetRenderCounts();
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('HarmonyPanel')).toBe(0);
  });

  it('HarmonyPanel renders at least once on mount (memo is not over-aggressive)', () => {
    enableRenderCounts();
    render(<App />);
    expect(getRenderCount('HarmonyPanel')).toBeGreaterThan(0);
  });
});
