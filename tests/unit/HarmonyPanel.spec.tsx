import { render, screen, fireEvent } from '@testing-library/react';
import { HarmonyPanel } from '../../src/components/panels/HarmonyPanel';
import { ThemeProvider, LayoutProvider } from '../../src/contexts';
import type { HarmonyPanelProps } from '../../src/components/panels/HarmonyPanel';

const theme = {
  t: {
    vizDataBorder: '#555',
  },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};

const noop = () => {};

const layout = {
  sectionOrder: ['harmony'],
  makeSectionDragHandlers: () => ({}),
  dropLine: () => null,
  sectionGrip: () => null,
  historyOpen: false,
  setHistoryOpen: noop as any,
};

const harmony = {
  complementary: '#ff0000',
  analogous1: '#00ff00', analogous2: '#0000ff',
  triadic1: '#ffff00', triadic2: '#ff00ff',
  splitComp1: '#00ffff', splitComp2: '#ff8800',
  tetradic1: '#8800ff', tetradic2: '#00ff88', tetradic3: '#ff0088',
  square1: '#8888ff', square2: '#ff8888', square3: '#88ff88',
};

const baseProps: HarmonyPanelProps = {
  baseColors: ['#112233'],
  aiColorNames: ['Forest'],
  safeAnchor: 0,
  lockedRamps: new Set(),
  harmonizeMode: 'complement',
  setHarmonizeMode: noop,
  harmonizeBaseline: null,
  restoreHarmonizeBaseline: noop,
  harmonize: noop,
  harmony,
  addHarmonyPair: noop as any,
  addHarmonyMany: noop,
  setHarmonyAnchor: noop,
  addHarmonyColor: noop,
};

function wrap(props: Partial<HarmonyPanelProps> = {}) {
  return render(
    <ThemeProvider value={theme as any}>
      <LayoutProvider value={layout as any}>
        <HarmonyPanel {...baseProps} {...props} />
      </LayoutProvider>
    </ThemeProvider>,
  );
}

test('renders intro tip text', () => {
  wrap();
  expect(screen.getByText(/Click any swatch to add a ramp/)).toBeInTheDocument();
});

test('renders Complementary swatch with correct hex', () => {
  wrap();
  expect(screen.getByText('#FF0000')).toBeInTheDocument();
});

test('renders all six harmony category labels', () => {
  wrap();
  expect(screen.getByText('Complementary')).toBeInTheDocument();
  expect(screen.getByText('Analogous')).toBeInTheDocument();
  expect(screen.getByText('Triadic')).toBeInTheDocument();
  expect(screen.getByText('Split-Comp')).toBeInTheDocument();
  expect(screen.getByText('Tetradic')).toBeInTheDocument();
  expect(screen.getByText('Square')).toBeInTheDocument();
});

test('calls addHarmonyColor when Complementary swatch clicked', () => {
  const addHarmonyColor = vi.fn();
  wrap({ addHarmonyColor });
  fireEvent.click(screen.getByTitle(/Add complementary/));
  expect(addHarmonyColor).toHaveBeenCalledWith('#ff0000', 'complementary');
});

test('calls addHarmonyPair when + Add Both clicked for Analogous', () => {
  const addHarmonyPair = vi.fn();
  wrap({ addHarmonyPair });
  const btns = screen.getAllByText('+ Add Both');
  fireEvent.click(btns[0]);
  expect(addHarmonyPair).toHaveBeenCalledWith('#00ff00', '#0000ff', 'analogous 1', 'analogous 2');
});

test('calls addHarmonyMany when + Add All clicked for Tetradic', () => {
  const addHarmonyMany = vi.fn();
  wrap({ addHarmonyMany });
  const btns = screen.getAllByText('+ Add All');
  fireEvent.click(btns[0]);
  expect(addHarmonyMany).toHaveBeenCalledWith([
    { hex: '#8800ff', name: 'tetradic 1' },
    { hex: '#00ff88', name: 'tetradic 2' },
    { hex: '#ff0088', name: 'tetradic 3' },
  ]);
});

test('does not show Derive From block with single base color', () => {
  wrap({ baseColors: ['#112233'] });
  expect(screen.queryByText(/Derive From/)).not.toBeInTheDocument();
});

test('shows Derive From block with multiple base colors', () => {
  wrap({ baseColors: ['#112233', '#445566'], aiColorNames: ['Forest', 'Ocean'] });
  expect(screen.getByText(/Derive From/)).toBeInTheDocument();
  expect(screen.getByText('Forest')).toBeInTheDocument();
  expect(screen.getByText('Ocean')).toBeInTheDocument();
});

test('calls setHarmonyAnchor when anchor button clicked', () => {
  const setHarmonyAnchor = vi.fn();
  wrap({ baseColors: ['#112233', '#445566'], aiColorNames: ['Forest', 'Ocean'], setHarmonyAnchor });
  fireEvent.click(screen.getByTitle(/Use Ocean .* as harmony source/));
  expect(setHarmonyAnchor).toHaveBeenCalledWith(1);
});

test('renders harmonize mode buttons', () => {
  wrap({ baseColors: ['#112233', '#445566'], aiColorNames: ['Forest', 'Ocean'] });
  expect(screen.getByText('Compl.')).toBeInTheDocument();
  expect(screen.getByText('Analog')).toBeInTheDocument();
  // 'Triadic' appears in both mode buttons and PairCard title
  expect(screen.getAllByText('Triadic').length).toBeGreaterThanOrEqual(2);
});

test('calls setHarmonizeMode when mode button clicked', () => {
  const setHarmonizeMode = vi.fn();
  wrap({ baseColors: ['#112233', '#445566'], aiColorNames: ['A', 'B'], setHarmonizeMode });
  fireEvent.click(screen.getByText('Analog'));
  expect(setHarmonizeMode).toHaveBeenCalledWith('analogous');
});

test('calls harmonize when Harmonize button clicked', () => {
  const harmonize = vi.fn();
  wrap({ baseColors: ['#112233', '#445566'], aiColorNames: ['A', 'B'], harmonize });
  fireEvent.click(screen.getByText('Harmonize'));
  expect(harmonize).toHaveBeenCalledOnce();
});

test('shows Restore button when harmonizeBaseline is set', () => {
  wrap({ baseColors: ['#112233', '#445566'], aiColorNames: ['A', 'B'], harmonizeBaseline: ['#112233', '#445566'] });
  expect(screen.getByText('Restore')).toBeInTheDocument();
});

test('calls restoreHarmonizeBaseline when Restore clicked', () => {
  const restoreHarmonizeBaseline = vi.fn();
  wrap({
    baseColors: ['#112233', '#445566'],
    aiColorNames: ['A', 'B'],
    harmonizeBaseline: ['#112233'],
    restoreHarmonizeBaseline,
  });
  fireEvent.click(screen.getByText('Restore'));
  expect(restoreHarmonizeBaseline).toHaveBeenCalledOnce();
});

test('Harmonize button disabled when all non-anchor ramps locked', () => {
  wrap({
    baseColors: ['#112233', '#445566'],
    aiColorNames: ['A', 'B'],
    lockedRamps: new Set([1]),
  });
  expect(screen.getByText('Harmonize')).toBeDisabled();
});
