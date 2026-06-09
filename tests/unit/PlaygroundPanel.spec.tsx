import { render, screen, fireEvent } from '@testing-library/react';
import { PlaygroundPanel } from '../../src/components/panels/PlaygroundPanel';
import { ThemeProvider } from '../../src/contexts';

const theme = {
  t: {
    text: '#ffffff',
    controlBtnDefault: 'bg-purple-900/60',
    controlBtnHover: 'hover:bg-purple-800/60',
  },
  themedAccent: (h: string) => h,
  themedAccentBorder: (h: string) => h,
  accentGlow: () => 'glow',
  accentTextGlow: () => 'tglow',
  sectionHeadColor: (h: string) => h,
};

const ramps2 = [['#111', '#222'], ['#333', '#444']];

const base = {
  pgOpen: true,
  vizStyle: 'balanced' as const,
  setVizStyle: () => {},
  rampsBalanced: ramps2,
  rampsMuted: ramps2,
  rampsPunchy: ramps2,
  isDark: true,
};

function wrap(props: Partial<typeof base> = {}) {
  return render(
    <ThemeProvider value={theme as any}>
      <PlaygroundPanel {...base} {...props} />
    </ThemeProvider>,
  );
}

test('renders palette style buttons', () => {
  wrap();
  expect(screen.getByText('punchy')).toBeInTheDocument();
  expect(screen.getByText('balanced')).toBeInTheDocument();
  expect(screen.getByText('muted')).toBeInTheDocument();
});

test('hides content when pgOpen is false', () => {
  const { container } = wrap({ pgOpen: false });
  const root = container.firstElementChild as HTMLElement;
  expect(root.style.display).toBe('none');
});

test('shows content when pgOpen is true', () => {
  const { container } = wrap({ pgOpen: true });
  const root = container.firstElementChild as HTMLElement;
  expect(root.style.display).toBe('');
});

test('calls setVizStyle when a style button is clicked', () => {
  const setVizStyle = vi.fn();
  wrap({ setVizStyle });
  fireEvent.click(screen.getByText('punchy'));
  expect(setVizStyle).toHaveBeenCalledWith('punchy');
});

test('renders "Palette style" label', () => {
  wrap();
  expect(screen.getByText('Palette style')).toBeInTheDocument();
});
