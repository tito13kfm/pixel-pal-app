import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { SavedPalettesPanel } from '../../src/components/panels/SavedPalettesPanel';
import { ThemeProvider } from '../../src/contexts';

const theme = {
  t: {
    alertErrorBg: 'bg-red-900',
    alertErrorText: 'text-red-200',
    alertErrorBorder: 'border-red-500',
    vizDataBorder: '#555',
  },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};

const base = {
  savedPalettes: [] as { slug: string; name: string; savedAt?: number; baseColors: string[] }[],
  savedError: '',
  savedBusy: false,
  saveName: '',
  setSaveName: () => {},
  savedFilter: '',
  setSavedFilter: () => {},
  confirmDeleteSlug: null as string | null,
  renamingSlug: null as string | null,
  renameDraft: '',
  setRenameDraft: () => {},
  renameError: '',
  classicLoaderId: 'nes',
  setClassicLoaderId: () => {},
  saveCurrentPalette: () => {},
  loadPalette: async () => {},
  requestDeletePalette: () => {},
  startRename: () => {},
  cancelRename: () => {},
  commitRename: async () => {},
  loadClassicPalette: () => {},
  saveNameInputRef: createRef<HTMLInputElement | null>(),
};

function wrap(props: Partial<typeof base> = {}) {
  return render(
    <ThemeProvider value={theme as any}>
      <SavedPalettesPanel {...base} {...props} />
    </ThemeProvider>,
  );
}

test('shows empty-state message when no saved palettes', () => {
  wrap();
  expect(screen.getByText(/No saved palettes yet/)).toBeInTheDocument();
});

test('shows save input and button', () => {
  wrap();
  expect(screen.getByPlaceholderText('Name this palette...')).toBeInTheDocument();
  expect(screen.getByTitle('Save the current palette to your browser\'s local storage')).toBeInTheDocument();
});

test('displays savedError when set', () => {
  wrap({ savedError: 'Save failed' });
  expect(screen.getByText('Save failed')).toBeInTheDocument();
});

test('renders saved palette list with load/rename/delete buttons', () => {
  const savedPalettes = [
    { slug: 'my-palette', name: 'My Palette', savedAt: 1234567890000, baseColors: ['#ff0000', '#00ff00'] },
  ];
  wrap({ savedPalettes });
  expect(screen.getByTitle('Load "My Palette" and replace the current palette')).toBeInTheDocument();
  expect(screen.getByTitle('Rename "My Palette"')).toBeInTheDocument();
  expect(screen.getByTitle('Delete "My Palette" from saved palettes')).toBeInTheDocument();
});

test('shows "Confirm?" delete button when confirmDeleteSlug matches', () => {
  const savedPalettes = [{ slug: 'pal', name: 'Pal', baseColors: ['#abc'] }];
  wrap({ savedPalettes, confirmDeleteSlug: 'pal' });
  expect(screen.getByText('Confirm?')).toBeInTheDocument();
});

test('shows rename input when renamingSlug matches', () => {
  const savedPalettes = [{ slug: 'pal', name: 'Pal', baseColors: ['#abc'] }];
  wrap({ savedPalettes, renamingSlug: 'pal', renameDraft: 'New Name' });
  expect(screen.getByDisplayValue('New Name')).toBeInTheDocument();
  expect(screen.getByTitle('Save the new name (Enter)')).toBeInTheDocument();
  expect(screen.getByTitle('Cancel rename (Escape)')).toBeInTheDocument();
});

test('shows filter input and clear button when palettes exist', () => {
  const savedPalettes = [{ slug: 'pal', name: 'Pal', baseColors: ['#abc'] }];
  wrap({ savedPalettes, savedFilter: 'test' });
  expect(screen.getByPlaceholderText('Filter by name...')).toBeInTheDocument();
  expect(screen.getByTitle('Clear the filter and show all saved palettes')).toBeInTheDocument();
});

test('shows no-match message when filter eliminates all palettes', () => {
  const savedPalettes = [{ slug: 'pal', name: 'Pal', baseColors: ['#abc'] }];
  wrap({ savedPalettes, savedFilter: 'zzz' });
  expect(screen.getByText(/No saved palettes match/)).toBeInTheDocument();
});

test('renders classic palette loader', () => {
  wrap();
  expect(screen.getByTitle(/Replace the current palette/)).toBeInTheDocument();
  expect(screen.getByTitle(/Pick a classic palette/)).toBeInTheDocument();
});

test('wires Save Current button to handler', () => {
  const saveCurrentPalette = vi.fn();
  wrap({ saveName: 'Test', saveCurrentPalette });
  fireEvent.click(screen.getByTitle('Save the current palette to your browser\'s local storage'));
  expect(saveCurrentPalette).toHaveBeenCalledOnce();
});

test('wires Load button to handler', () => {
  const loadPalette = vi.fn();
  const savedPalettes = [{ slug: 'my-pal', name: 'My Pal', baseColors: ['#f00'] }];
  wrap({ savedPalettes, loadPalette });
  fireEvent.click(screen.getByTitle('Load "My Pal" and replace the current palette'));
  expect(loadPalette).toHaveBeenCalledWith('my-pal');
});
