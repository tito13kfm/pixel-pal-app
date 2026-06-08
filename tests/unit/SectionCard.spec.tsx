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

test('threads headerTitle tooltip and headerTourId onto the header button', () => {
  wrap(
    <SectionCard
      sectionKey="export" accent="#00ffff" bg="#111" glow={0.3} open onToggle={() => {}}
      title="Export" icon={<i />} headerTitle="Collapse Export & Tools" headerTourId="export-header"
    >
      <p>body</p>
    </SectionCard>,
  );
  const header = screen.getByRole('button', { name: /Export/ });
  expect(header).toHaveAttribute('title', 'Collapse Export & Tools');
  expect(header).toHaveAttribute('data-tour-id', 'export-header');
});

test('keepMounted keeps children in the DOM when closed', () => {
  wrap(
    <SectionCard sectionKey="playground" accent="#00ff88" bg="#111" glow={0.3} open={false} onToggle={() => {}} title="Playground" icon={<i />} keepMounted>
      <p>canvas body</p>
    </SectionCard>,
  );
  // closed, but keepMounted → still rendered (caller hides via CSS)
  expect(screen.getByText('canvas body')).toBeInTheDocument();
});
