import { render, screen, fireEvent } from '@testing-library/react';
import { ExportPanel } from '../../src/components/panels/ExportPanel';
import { ThemeProvider } from '../../src/contexts';

const theme = {
  t: { cardBgViz: '#111', controlBtnDefault: 'btn-def', controlBtnHover: 'btn-hov' },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};

const base = {
  copyPaletteToClipboard: () => {},
  exportLightnessPng: () => {},
  exportMosaicPng: () => {},
  getSnapshotForSlot: () => ({}),
  toggleCompareMode: () => {},
  compareMode: false,
  hardwareLock: null as string | null,
  hwPickerOpen: false,
  setHwPickerOpen: () => {},
  exportFeedback: '',
  lastSavedPath: null as string | null,
  revealLastSaved: () => {},
  bakeHardwareLock: () => {},
  toggleHardwareLock: () => {},
  exportFormat: 'gpl',
  setExportFormat: () => {},
  exportActiveFormat: () => {},
  handleGplFile: () => {},
};

function wrap(props: Partial<typeof base> = {}) {
  return render(
    <ThemeProvider value={theme as any}>
      <ExportPanel {...base} {...props} />
    </ThemeProvider>,
  );
}

test('renders the core export actions and preserves tour-ids', () => {
  const { container } = wrap();
  expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Lightness PNG/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Mosaic PNG/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /WCAG Check/i })).toBeInTheDocument();
  // tour-ids that live inside the body must survive the move
  expect(container.querySelector('[data-tour-id="wcag-check-btn"]')).toBeInTheDocument();
  expect(container.querySelector('[data-tour-id="hardware-lock-btn"]')).toBeInTheDocument();
  expect(container.querySelector('[data-tour-id="gpl-export-btn"]')).toBeInTheDocument();
});

test('shows the Hardware Lock open button when unlocked, hides the locked sub-block', () => {
  wrap({ hardwareLock: null });
  expect(screen.getByRole('button', { name: /Hardware Lock/i })).toBeInTheDocument();
  expect(screen.queryByText(/Locked:/i)).not.toBeInTheDocument();
});

test('renders the locked sub-block (name, bake, unlock) when hardwareLock is set', () => {
  wrap({ hardwareLock: 'nes' });
  expect(screen.getByText(/Locked:/i)).toBeInTheDocument();
  expect(screen.getByText('NES')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Bake into pins/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Unlock/i })).toBeInTheDocument();
  // the "open picker" Hardware Lock button is gone while locked
  expect(screen.queryByRole('button', { name: /^Hardware Lock$/i })).not.toBeInTheDocument();
});

test('renders the hardware palette picker when open and unlocked', () => {
  wrap({ hardwareLock: null, hwPickerOpen: true });
  // picker lists every hardware palette by name
  expect(screen.getByRole('button', { name: 'NES' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Game Boy' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'C64' })).toBeInTheDocument();
});

test('shows the Reveal-in-folder button only when lastSavedPath is set (desktop)', () => {
  const reveal = vi.fn();
  const { rerender } = wrap({ lastSavedPath: null });
  expect(screen.queryByRole('button', { name: /Reveal in folder/i })).not.toBeInTheDocument();
  rerender(
    <ThemeProvider value={theme as any}>
      <ExportPanel {...base} lastSavedPath="/tmp/out.gpl" revealLastSaved={reveal} />
    </ThemeProvider>,
  );
  const btn = screen.getByRole('button', { name: /Reveal in folder/i });
  fireEvent.click(btn);
  expect(reveal).toHaveBeenCalledTimes(1);
});

test('shows the export feedback badge when set', () => {
  wrap({ exportFeedback: 'Saved!' });
  expect(screen.getByText('Saved!')).toBeInTheDocument();
});

test('wires the primary action buttons to their handlers', () => {
  const copy = vi.fn();
  const exportFmt = vi.fn();
  wrap({ copyPaletteToClipboard: copy, exportActiveFormat: exportFmt });
  fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
  expect(copy).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /^Download$/i }));
  expect(exportFmt).toHaveBeenCalledTimes(1);
});
