import { render, screen, fireEvent } from '@testing-library/react';
import { RampsPanel } from '../../src/components/panels/RampsPanel';
import { ThemeProvider, LayoutProvider } from '../../src/contexts';
import type { RampsPanelProps } from '../../src/components/panels/RampsPanel';

const theme = {
  t: {
    swatchHex: '#aaa',
    swatchLabel: '#888',
    colorNameText: '#ccc',
    controlPanelBg: '',
    controlPanelBorder: '',
    controlBtnDefault: 'bg-purple-900',
    controlBtnHover: 'hover:bg-purple-800',
    cardBgCyan: '',
    panelTextInactive: 'text-gray-400',
  },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};

const layout = {
  sectionOrder: ['ramps'],
  makeSectionDragHandlers: () => ({}),
  dropLine: () => null,
  sectionGrip: () => null,
  historyOpen: false,
  setHistoryOpen: (() => {}) as any,
};

const noop = () => {};
const noopDispatch = (() => {}) as any;

const DEFAULT_STYLE_PRESETS = {
  punchy:   { reach: 0.9,   chromaFalloff: 0.15 },
  balanced: { reach: 0.575, chromaFalloff: 0.475 },
  muted:    { reach: 0.15,  chromaFalloff: 0.85 },
};

const baseRampProps: RampsPanelProps = {
  theme: 'dark',
  baseColors: ['#ff6b35'],
  aiColorNames: ['Ember'],
  rampsPunchy: [['#ff9999', '#ff6b35', '#aa3300']],
  rampsBalanced: [['#ffaaaa', '#ff6b35', '#bb4400']],
  rampsMuted: [['#ddbbbb', '#cc6644', '#994422']],
  rampsActive: [['#ff9999', '#ff6b35', '#aa3300']],
  activeStyleFor: (_i) => 'punchy',
  rampStyleOverrides: {},
  setRampStyleOverride: noop as any,
  setRampStyleOverrides: noopDispatch,
  paletteDefaultStyle: 'punchy',
  setPaletteDefaultStyle: noopDispatch,
  stylePresets: DEFAULT_STYLE_PRESETS,
  setStylePresets: noopDispatch,
  activeHardware: null,
  collapsedRamps: new Set(),
  anyRampExpanded: true,
  lockedRamps: new Set(),
  hiddenShades: {},
  rampSizeOverrides: {},
  setRampSizeOverrides: noopDispatch,
  rampSize: 5,
  rampSatOverrides: {},
  setRampSatOverrides: noopDispatch,
  editingIndex: null,
  editorHsv: { h: 20, s: 80, v: 90 },
  editorOklch: { L: 0.7, C: 0.15, H: 30 },
  editorMode: 'hsv',
  pinEditor: null,
  setPinEditor: noop as any,
  advancedOpen: {},
  setAdvancedOpen: noopDispatch,
  lightnessCurvePerRamp: {},
  setLightnessCurvePerRamp: noopDispatch,
  satCurvePerRamp: {},
  setSatCurvePerRamp: noopDispatch,
  gamutPerRamp: {},
  setGamutPerRamp: noopDispatch,
  hueShiftStrengthPerRamp: {},
  setHueShiftStrengthPerRamp: noopDispatch,
  spriteLibrary: {},
  spriteKey: 'vase',
  copiedHex: null,
  compareAnchor: null,
  compareMode: false,
  highlightedRamp: null,
  confirmReset: false,
  makeRampDragHandlers: () => ({}),
  rampDropLine: () => null,
  rampGrip: () => null,
  labelsForRamp: (_ramp, _base) => ['dark', 'base', 'light'],
  filterHidden: (ramp, labels, _i) => ({ hexes: ramp, labels, originalIndices: ramp.map((_, j) => j) }),
  resolveBaseForRamp: (hex, _i) => hex,
  resolveSizeForRamp: (_i) => 5,
  resolveHueShiftForRamp: (_i) => 0,
  isShadePinned: (_i, _j, _s) => false,
  toggleAllRampsCollapse: noop,
  resetToDefaults: noop,
  resetStylePresets: noop,
  toggleRampLock: noop,
  shuffleRamp: noop,
  duplicateRamp: noop,
  copyRampToClipboard: noop,
  downloadSingleRampGpl: noop,
  resetHiddenShades: noop,
  removeRamp: noop,
  toggleBaseEditor: noop,
  updateEditorHex: noop,
  updateEditorHsv: noop,
  updateEditorOklch: noop,
  updateEditorMode: noop,
  setEditingIndex: noop as any,
  toggleRampCollapse: noop,
  hideShade: noop,
  setOverride: noop,
  clearOverride: noop,
  pickCompareSwatch: noop,
  copyHex: noop,
  tagNextLabel: noop,
  togglePinEditor: noop,
  setBaseColors: noopDispatch,
};

function wrap(props: Partial<RampsPanelProps> = {}) {
  return render(
    <ThemeProvider value={theme as any}>
      <LayoutProvider value={layout as any}>
        <RampsPanel {...baseRampProps} {...props} />
      </LayoutProvider>
    </ThemeProvider>,
  );
}

test('renders Style Tuning section', () => {
  wrap();
  expect(screen.getByText('Style Tuning')).toBeInTheDocument();
});

test('no global ramp-export style toggle (style is per-ramp, #69)', () => {
  wrap();
  // The retired "Ramp export:" Punchy/Balanced/Muted toggle is gone; per-ramp
  // Copy/Download now use each ramp's own active style. The "▸ Punchy" etc.
  // section labels (show-all-three view) still render when expanded.
  expect(screen.queryByText('Ramp export:')).toBeNull();
});

test('renders color name in ramp card', () => {
  wrap();
  expect(screen.getAllByText('Ember').length).toBeGreaterThanOrEqual(1);
});

test('default view shows only the active style section label (#69)', () => {
  wrap();
  expect(screen.getByText('▸ Punchy')).toBeInTheDocument();
  expect(screen.queryByText('▸ Balanced')).not.toBeInTheDocument();
  expect(screen.queryByText('▸ Muted')).not.toBeInTheDocument();
});

test('default view shows the ramp\'s active (non-punchy) style, not always Punchy (#69)', () => {
  wrap({ activeStyleFor: (_i) => 'balanced', rampsActive: [['#ffaaaa', '#ff6b35', '#bb4400']] });
  expect(screen.queryByText('▸ Punchy')).not.toBeInTheDocument();
  expect(screen.getByText('▸ Balanced')).toBeInTheDocument();
});

test('toggling "Compare All 3 Styles" shows all three stacked sections (#69)', () => {
  wrap();
  expect(screen.queryByText('▸ Balanced')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Compare All 3 Styles'));
  expect(screen.getByText('▸ Punchy')).toBeInTheDocument();
  expect(screen.getByText('▸ Balanced')).toBeInTheDocument();
  expect(screen.getByText('▸ Muted')).toBeInTheDocument();
});

test('per-ramp style picker calls setRampStyleOverride with the clicked style (#69)', () => {
  const setRampStyleOverride = vi.fn();
  wrap({ editingIndex: 0, setRampStyleOverride });
  fireEvent.click(screen.getByTitle(/Set this ramp's active style to Balanced/));
  expect(setRampStyleOverride).toHaveBeenCalledWith(0, 'balanced');
});

test('"Set All Ramps → Default" clears rampStyleOverrides (#69)', () => {
  const setRampStyleOverrides = vi.fn();
  wrap({ setRampStyleOverrides });
  fireEvent.click(screen.getByText('Set All Ramps → Default'));
  expect(setRampStyleOverrides).toHaveBeenCalledWith({});
});

test('palette default-style selector calls setPaletteDefaultStyle (#69)', () => {
  const setPaletteDefaultStyle = vi.fn();
  wrap({ setPaletteDefaultStyle });
  fireEvent.click(screen.getByTitle(/Set the palette default style to Muted/));
  expect(setPaletteDefaultStyle).toHaveBeenCalledWith('muted');
});

test('does not render swatch rows when ramp collapsed', () => {
  wrap({ collapsedRamps: new Set([0]) });
  expect(screen.queryByText('▸ Punchy')).not.toBeInTheDocument();
});

test('shows hardware lock banner when activeHardware set', () => {
  wrap({ activeHardware: { colors: ['#000000', '#ffffff'] } as any });
  expect(screen.getByText(/Locked to/)).toBeInTheDocument();
  expect(screen.getByText(/hardware-legal/)).toBeInTheDocument();
});

test('does not show hardware lock banner when null', () => {
  wrap({ activeHardware: null });
  expect(screen.queryByText(/Locked to/)).not.toBeInTheDocument();
});

test('shows Collapse All when anyRampExpanded is true', () => {
  wrap({ baseColors: ['#ff6b35', '#00aaff'], aiColorNames: ['Ember', 'Sky'],
    rampsPunchy: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
    rampsBalanced: [['#ffaaaa', '#ff6b35', '#bb4400'], ['#aaddff', '#00aaff', '#006699']],
    rampsMuted: [['#ddbbbb', '#cc6644', '#994422'], ['#bbccdd', '#4488bb', '#224455']],
    rampsActive: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
  });
  expect(screen.getByText('Collapse All')).toBeInTheDocument();
});

test('shows Expand All when anyRampExpanded is false', () => {
  wrap({ baseColors: ['#ff6b35', '#00aaff'], aiColorNames: ['Ember', 'Sky'],
    anyRampExpanded: false,
    collapsedRamps: new Set([0, 1]),
    rampsPunchy: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
    rampsBalanced: [['#ffaaaa', '#ff6b35', '#bb4400'], ['#aaddff', '#00aaff', '#006699']],
    rampsMuted: [['#ddbbbb', '#cc6644', '#994422'], ['#bbccdd', '#4488bb', '#224455']],
    rampsActive: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
  });
  expect(screen.getByText('Expand All')).toBeInTheDocument();
});

test('calls toggleAllRampsCollapse when Collapse All clicked', () => {
  const toggleAllRampsCollapse = vi.fn();
  wrap({ baseColors: ['#ff6b35', '#00aaff'], aiColorNames: ['Ember', 'Sky'],
    toggleAllRampsCollapse,
    rampsPunchy: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
    rampsBalanced: [['#ffaaaa', '#ff6b35', '#bb4400'], ['#aaddff', '#00aaff', '#006699']],
    rampsMuted: [['#ddbbbb', '#cc6644', '#994422'], ['#bbccdd', '#4488bb', '#224455']],
    rampsActive: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
  });
  fireEvent.click(screen.getByText('Collapse All'));
  expect(toggleAllRampsCollapse).toHaveBeenCalledOnce();
});

test('shows Reset to Defaults button', () => {
  wrap();
  expect(screen.getByText('Reset to Defaults')).toBeInTheDocument();
});

test('shows Confirm? when confirmReset is true', () => {
  wrap({ confirmReset: true });
  expect(screen.getByText('Confirm?')).toBeInTheDocument();
});

test('calls resetToDefaults when button clicked', () => {
  const resetToDefaults = vi.fn();
  wrap({ resetToDefaults });
  fireEvent.click(screen.getByText('Reset to Defaults'));
  expect(resetToDefaults).toHaveBeenCalledOnce();
});

test('renders swatch hex values when expanded', () => {
  wrap();
  expect(screen.getAllByText('#FF6B35').length).toBeGreaterThanOrEqual(1);
});

test('hex values rendered uppercase with hash', () => {
  wrap();
  // should be uppercase
  expect(screen.queryByText('ff6b35')).not.toBeInTheDocument();
  expect(screen.getAllByText('#FF6B35').length).toBeGreaterThanOrEqual(1);
});

test('calls toggleRampCollapse when clicking collapse area', () => {
  const toggleRampCollapse = vi.fn();
  wrap({ toggleRampCollapse });
  const collapseBtn = screen.getByTitle('Collapse this ramp card to icons only');
  fireEvent.click(collapseBtn);
  expect(toggleRampCollapse).toHaveBeenCalledWith(0);
});

test('shows restore button when hiddenShades set', () => {
  wrap({ hiddenShades: { 0: [0] } });
  expect(screen.getByText(/Restore 1/)).toBeInTheDocument();
});

test('calls resetHiddenShades when restore button clicked', () => {
  const resetHiddenShades = vi.fn();
  wrap({ hiddenShades: { 0: [0, 1] }, resetHiddenShades });
  fireEvent.click(screen.getByText(/Restore 2/));
  expect(resetHiddenShades).toHaveBeenCalledWith(0);
});

test('shows remove button when multiple ramps', () => {
  wrap({ baseColors: ['#ff6b35', '#00aaff'], aiColorNames: ['Ember', 'Sky'],
    rampsPunchy: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
    rampsBalanced: [['#ffaaaa', '#ff6b35', '#bb4400'], ['#aaddff', '#00aaff', '#006699']],
    rampsMuted: [['#ddbbbb', '#cc6644', '#994422'], ['#bbccdd', '#4488bb', '#224455']],
    rampsActive: [['#ff9999', '#ff6b35', '#aa3300'], ['#99ccff', '#00aaff', '#005599']],
  });
  expect(screen.getAllByTitle('Remove this ramp').length).toBe(2);
});

test('no remove button for single ramp', () => {
  wrap();
  expect(screen.queryByTitle('Remove this ramp')).not.toBeInTheDocument();
});

test('shows lock button for each ramp', () => {
  wrap();
  expect(screen.getByTitle(/Lock this ramp/)).toBeInTheDocument();
});

test('shows locked visual when ramp locked', () => {
  wrap({ lockedRamps: new Set([0]) });
  expect(screen.getByTitle(/Unlock this ramp/)).toBeInTheDocument();
});

test('calls toggleRampLock when lock button clicked', () => {
  const toggleRampLock = vi.fn();
  wrap({ toggleRampLock });
  fireEvent.click(screen.getByTitle(/Lock this ramp/));
  expect(toggleRampLock).toHaveBeenCalledWith(0);
});

test('shows Reset Styles button when presets differ from defaults', () => {
  // Modify one value to trigger the diff check
  wrap({ stylePresets: { ...DEFAULT_STYLE_PRESETS, punchy: { reach: 0.5, chromaFalloff: 0.15 } } });
  expect(screen.getByText('Reset Styles')).toBeInTheDocument();
});

test('no Reset Styles button when presets equal defaults', () => {
  wrap({ stylePresets: DEFAULT_STYLE_PRESETS });
  expect(screen.queryByText('Reset Styles')).not.toBeInTheDocument();
});

test('base editor rounds fractional HSV only for display, not the slider value', () => {
  // editorHsv holds exact (unrounded) HSV; rounding must happen at render time
  // only, so a single-slider drag doesn't snap the other two channels.
  wrap({ editingIndex: 0, editorHsv: { h: 127.34, s: 45.62, v: 78.91 } });
  expect(screen.getByText('127°')).toBeInTheDocument();
  expect(screen.getByText('46%')).toBeInTheDocument();
  expect(screen.getByText('79%')).toBeInTheDocument();
  const hueSlider = screen.getByTitle('Hue: 127°') as HTMLInputElement;
  expect(hueSlider.value).toBe('127.34');
});

test('OKLCH mode shows Light/Chroma/Hue sliders instead of HSV', () => {
  wrap({ editingIndex: 0, editorMode: 'oklch', editorOklch: { L: 0.6432, C: 0.157, H: 42.6 } });
  expect(screen.queryByText('Sat')).not.toBeInTheDocument();
  expect(screen.queryByText('Value')).not.toBeInTheDocument();
  expect(screen.getByText('Light')).toBeInTheDocument();
  expect(screen.getByText('Chroma')).toBeInTheDocument();
  expect(screen.getByText('64%')).toBeInTheDocument();
  expect(screen.getByText('0.157')).toBeInTheDocument();
  expect(screen.getByText('43°')).toBeInTheDocument();
});

test('clicking the OKLCH toggle calls updateEditorMode', () => {
  const updateEditorMode = vi.fn();
  wrap({ editingIndex: 0, updateEditorMode });
  fireEvent.click(screen.getByTitle(/Edit with perceptual OKLCH sliders/));
  expect(updateEditorMode).toHaveBeenCalledWith('oklch');
});

test('dragging the Chroma slider calls updateEditorOklch with the new value', () => {
  const updateEditorOklch = vi.fn();
  wrap({ editingIndex: 0, editorMode: 'oklch', editorOklch: { L: 0.6, C: 0.1, H: 30 }, updateEditorOklch });
  fireEvent.change(screen.getByTitle(/Chroma: 0.100/), { target: { value: '0.2' } });
  expect(updateEditorOklch).toHaveBeenCalledWith({ L: 0.6, C: 0.2, H: 30 });
});
