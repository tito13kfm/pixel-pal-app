import { render, screen, fireEvent } from '@testing-library/react';
import { LospecBrowserPanel } from '../../src/components/panels/LospecBrowserPanel';
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
  hasApiKey: true,
  userApiKeyInput: '', setUserApiKeyInput: () => {},
  savedUserApiKey: null as string | null,
  saveUserApiKey: async () => {},
  clearUserApiKey: async () => {},
  query: '', setQuery: () => {},
  tag: '', setTag: () => {},
  minColors: null, setMinColors: () => {},
  maxColors: null, setMaxColors: () => {},
  sort: '-publishedAt' as const, setSort: () => {},
  page: 0,
  results: [] as any[],
  suggestions: [] as any[],
  total: 0,
  loading: false,
  error: '',
  rateLimitLow: false,
  runBrowse: () => {},
  nextPage: () => {},
  prevPage: () => {},
  runSuggest: () => {},
  loadBySlugOrUrl: async () => null,
  onLoad: () => {},
};

function wrap(props: Partial<typeof base> = {}) {
  return render(<ThemeProvider value={theme as any}><LospecBrowserPanel {...base} {...props} /></ThemeProvider>);
}

test('shows a keyless-degraded notice when hasApiKey is false', () => {
  wrap({ hasApiKey: false });
  expect(screen.getByText(/requires an api key|browse.*unavailable/i)).toBeInTheDocument();
});

test('shows the error message when present', () => {
  wrap({ error: 'Browse failed' });
  expect(screen.getByText('Browse failed')).toBeInTheDocument();
});

test('renders a result card with name, author, and a Load action', () => {
  const onLoad = vi.fn();
  wrap({
    results: [{ slug: 'a', title: 'A Palette', colors: ['#111111', '#222222'], numberOfColors: 2, author: 'Someone', url: 'https://lospec.com/palette-list/a' }],
    onLoad,
  });
  expect(screen.getByText('A Palette')).toBeInTheDocument();
  expect(screen.getByText(/Someone/)).toBeInTheDocument();
  fireEvent.click(screen.getByTitle(/use all.*as bases|load all/i));
  expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ slug: 'a' }), 'all');
});

test('shows the "Palette data from Lospec" attribution footer', () => {
  wrap();
  expect(screen.getByText(/Palette data from Lospec/)).toBeInTheDocument();
});

test('renders an API key input wired to userApiKeyInput, and calling save invokes saveUserApiKey', () => {
  const setUserApiKeyInput = vi.fn();
  const saveUserApiKey = vi.fn();
  wrap({ userApiKeyInput: 'draft-key', setUserApiKeyInput, saveUserApiKey });
  const input = screen.getByLabelText(/lospec api key/i) as HTMLInputElement;
  expect(input.value).toBe('draft-key');
  fireEvent.change(input, { target: { value: 'new-value' } });
  expect(setUserApiKeyInput).toHaveBeenCalledWith('new-value');
  fireEvent.click(screen.getByTitle(/save.*api key/i));
  expect(saveUserApiKey).toHaveBeenCalled();
});

test('shows a Clear action only when a user key is already saved', () => {
  const { rerender } = wrap({ savedUserApiKey: null });
  expect(screen.queryByTitle(/clear.*api key/i)).not.toBeInTheDocument();
  rerender(<ThemeProvider value={theme as any}><LospecBrowserPanel {...base} savedUserApiKey="saved-key" clearUserApiKey={() => {}} /></ThemeProvider>);
  expect(screen.getByTitle(/clear.*api key/i)).toBeInTheDocument();
});
