import { render, screen, fireEvent } from '@testing-library/react';
import { SectionCard } from '../../src/components/SectionCard';
import { LayoutProvider, ThemeProvider } from '../../src/contexts';

const layout = {
  sectionOrder: ['ramps', 'history', 'export'],
  makeSectionDragHandlers: () => ({}),
  dropLine: () => null,
  sectionGrip: (k: string) => <span data-testid={`grip-${k}`} />,
  historyOpen: true,
  setHistoryOpen: () => {},
};
const theme = {
  t: { cardBgViz: '#111', glowStrong: 0.6 },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};
function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider value={theme as any}>
      <LayoutProvider value={layout as any}>{ui}</LayoutProvider>
    </ThemeProvider>,
  );
}

test('renders title, grip, and children when open', () => {
  wrap(
    <SectionCard sectionKey="history" accent="#a855f7" bg="#111" glow={0.25} open onToggle={() => {}} title="History" icon={<i data-testid="icon" />}>
      <p>panel body</p>
    </SectionCard>,
  );
  expect(screen.getByText('History')).toBeInTheDocument();
  expect(screen.getByTestId('grip-history')).toBeInTheDocument();
  expect(screen.getByText('panel body')).toBeInTheDocument();
});

test('hides children when closed and fires onToggle on header click', () => {
  const onToggle = vi.fn();
  wrap(
    <SectionCard sectionKey="history" accent="#a855f7" bg="#111" glow={0.25} open={false} onToggle={onToggle} title="History" icon={<i />}>
      <p>panel body</p>
    </SectionCard>,
  );
  expect(screen.queryByText('panel body')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /History/ }));
  expect(onToggle).toHaveBeenCalledTimes(1);
});
