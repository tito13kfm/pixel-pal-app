import { render, screen, fireEvent } from '@testing-library/react';
import { VizComparePanel } from '../../src/components/panels/VizComparePanel';
import { ThemeProvider, LayoutProvider } from '../../src/contexts';
import type { VizComparePanelProps } from '../../src/components/panels/VizComparePanel';

const theme = {
  t: {
    cardBgViz: 'linear-gradient(135deg,#000,#111)',
    controlBtnDefault: 'bg-purple-900/60',
    controlBtnHover: 'hover:bg-purple-800/60',
    alertErrorBg: 'bg-red-900', alertErrorText: 'text-red-200', alertErrorBorder: 'border-red-500',
    alertInfoBg: 'bg-blue-900', alertInfoText: 'text-blue-200', alertInfoBorder: 'border-blue-500',
    alertWarnBg: 'bg-yellow-900', alertWarnText: 'text-yellow-200', alertWarnBorder: 'border-yellow-500',
    vizDataBorder: '#555', vizRingStroke: '#444', vizSpokeStroke: '#333', vizAxisLabel: '#aaa',
  },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};

const noop = () => {};

const layout = {
  sectionOrder: ['viz'],
  makeSectionDragHandlers: () => ({}),
  dropLine: () => null,
  sectionGrip: () => null,
  historyOpen: false,
  setHistoryOpen: noop as any,
};

const baseProps: VizComparePanelProps = {
  sbsOpen: true,
  setSbsOpen: noop as any,
  vizStyle: 'balanced',
  setVizStyle: noop as any,
  vizSubOpen: {},
  toggleVizSub: noop,
  matrixColorSet: 'unique',
  setMatrixColorSet: noop as any,
  matrixView: 'pair',
  setMatrixView: noop as any,
  ditherPattern: 'bayer4',
  setDitherPattern: noop as any,
  ditherCrossRamp: false,
  setDitherCrossRamp: noop as any,
  ditherZoom: 1,
  setDitherZoom: noop,
  sbsLeft: null,
  setSbsLeft: noop,
  sbsRight: null,
  setSbsRight: noop,
  sbsLeftPayload: null,
  sbsRightPayload: null,
  sbsLeftError: '',
  sbsRightError: '',
  sbsLeftLoading: false,
  sbsRightLoading: false,
  sbsRemapSource: null,
  sbsLeftRemap: null,
  sbsRightRemap: null,
  sbsLeftRemapLoading: false,
  sbsRightRemapLoading: false,
  remapImageDataUrl: null,
  remapImageNaturalSize: null,
  remapOutput: null,
  remapDither: 'none',
  setRemapDither: noop as any,
  remapLoading: false,
  remapError: '',
  remapImageName: '',
  remapDownloadScale: 1,
  setRemapDownloadScale: noop,
  remapDownloadConfirmPending: false,
  setRemapDownloadConfirmPending: noop,
  remapDragOver: false,
  setRemapDragOver: noop,
  remapDownloadConfirmTimerRef: { current: null },
  savedPalettes: [],
  aiColorNames: null,
  getSnapshotForSlot: () => null,
  getSlotLabel: () => 'working palette',
  getActiveRemapPalette: () => [],
  exportLightnessPng: noop,
  exportMosaicPng: noop,
  exportMatrixPng: noop,
  exportDitherPng: noop,
  downloadRemap: noop,
  clearRemapImage: noop,
  handleRemapImageUpload: noop,
};

function wrap(props: Partial<VizComparePanelProps> = {}) {
  return render(
    <ThemeProvider value={theme as any}>
      <LayoutProvider value={layout as any}>
        <VizComparePanel {...baseProps} {...props} />
      </LayoutProvider>
    </ThemeProvider>,
  );
}

test('renders section title', () => {
  wrap();
  expect(screen.getByText('Visualize & Compare')).toBeInTheDocument();
});

test('renders style buttons Punchy/Balanced/Muted', () => {
  wrap();
  expect(screen.getByTitle(/Punchy ramps/)).toBeInTheDocument();
  expect(screen.getByTitle(/Balanced ramps/)).toBeInTheDocument();
  expect(screen.getByTitle(/Muted ramps/)).toBeInTheDocument();
});

test('calls setVizStyle when style button clicked', () => {
  const setVizStyle = vi.fn();
  wrap({ setVizStyle });
  fireEvent.click(screen.getByTitle(/Punchy ramps/));
  expect(setVizStyle).toHaveBeenCalledWith('punchy');
});

test('renders Image Preview upload area when no image loaded', () => {
  wrap();
  expect(screen.getByText(/Drop an image here/)).toBeInTheDocument();
});

test('calls handleRemapImageUpload when file selected', () => {
  const handleRemapImageUpload = vi.fn();
  wrap({ handleRemapImageUpload });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'test.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  expect(handleRemapImageUpload).toHaveBeenCalledWith(file);
});

test('shows Clear button and source filename when image loaded', () => {
  wrap({ remapImageDataUrl: 'data:image/png;base64,abc', remapImageName: 'art.png' });
  expect(screen.getByTitle('Remove the uploaded image')).toBeInTheDocument();
  expect(screen.getByText('art.png')).toBeInTheDocument();
});

test('calls clearRemapImage when Clear clicked', () => {
  const clearRemapImage = vi.fn();
  wrap({ clearRemapImage, remapImageDataUrl: 'data:image/png;base64,abc', remapImageName: 'art.png' });
  fireEvent.click(screen.getByTitle('Remove the uploaded image'));
  expect(clearRemapImage).toHaveBeenCalledOnce();
});

test('renders Slot A and Slot B selects', () => {
  wrap();
  expect(screen.getByTitle(/Pick the palette to visualize/)).toBeInTheDocument();
  expect(screen.getByTitle(/Pick a second palette/)).toBeInTheDocument();
});

test('setSbsOpen called when header toggled', () => {
  const setSbsOpen = vi.fn();
  wrap({ setSbsOpen });
  fireEvent.click(screen.getByTitle('Collapse the Visualize & Compare section'));
  expect(setSbsOpen).toHaveBeenCalledOnce();
});

test('shows loading state for slot A', () => {
  wrap({ sbsLeftLoading: true });
  expect(screen.getByText(/Loading Slot A/)).toBeInTheDocument();
});

test('shows error state for slot A', () => {
  const snap = { baseColors: ['#ff0000'], aiColorNames: [] };
  wrap({ sbsLeftError: 'Failed to load palette', getSnapshotForSlot: () => snap });
  expect(screen.getByText('Failed to load palette')).toBeInTheDocument();
});

test('two-column layout when sbsRight is set', () => {
  const snap = { baseColors: ['#ff0000'], aiColorNames: [] };
  wrap({ sbsRight: 'working', getSnapshotForSlot: () => snap });
  expect(screen.getByTitle('Clear slot B to return to single-column view')).toBeInTheDocument();
});

test('calls setSbsRight(null) when Clear slot B clicked', () => {
  const setSbsRight = vi.fn();
  const snap = { baseColors: ['#ff0000'], aiColorNames: [] };
  wrap({ sbsRight: 'working', setSbsRight, getSnapshotForSlot: () => snap });
  fireEvent.click(screen.getByTitle('Clear slot B to return to single-column view'));
  expect(setSbsRight).toHaveBeenCalledWith(null);
});
