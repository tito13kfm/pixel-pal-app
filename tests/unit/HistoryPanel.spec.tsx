import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryPanel } from '../../src/components/panels/HistoryPanel';
import { PaletteProvider } from '../../src/contexts';

const base = {
  historyEntries: [
    { label: 'Initial', timestamp: 1000 },
    { label: 'Edit ramp', timestamp: 2000 },
    { label: 'Harmonize', timestamp: 3000 },
  ],
  historyIndex: 1,
  jumpToHistoryIndex: () => {},
  canUndo: true,
  canRedo: true,
  formatHistoryAge: () => '1m ago',
};
const wrap = (value: any) => render(<PaletteProvider value={value}><HistoryPanel /></PaletteProvider>);

test('renders entries newest-first and marks the current one disabled', () => {
  wrap(base);
  const buttons = screen.getAllByRole('button');
  // newest (Harmonize) first
  expect(buttons[0]).toHaveTextContent(/Harmonize/i);
  // current index 1 (Edit ramp) is disabled
  const current = screen.getByRole('button', { name: /Edit ramp/i });
  expect(current).toBeDisabled();
});

test('clicking a non-current entry calls jumpToHistoryIndex with its real index', () => {
  const jump = vi.fn();
  wrap({ ...base, jumpToHistoryIndex: jump });
  fireEvent.click(screen.getByRole('button', { name: /Harmonize/i }));
  expect(jump).toHaveBeenCalledWith(2); // Harmonize is index 2, not reversed index 0
});
