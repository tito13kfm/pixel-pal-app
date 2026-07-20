import { useTheme } from '../../contexts';
import type { LospecPalette, LospecBrowseParams } from '../../lib/lospec';

export interface LospecBrowserPanelProps {
  hasApiKey: boolean;
  userApiKeyInput: string; setUserApiKeyInput: (v: string) => void;
  savedUserApiKey: string | null;
  saveUserApiKey: () => Promise<void>;
  clearUserApiKey: () => Promise<void>;
  query: string; setQuery: (v: string) => void;
  tag: string; setTag: (v: string) => void;
  minColors: number | null; setMinColors: (v: number | null) => void;
  maxColors: number | null; setMaxColors: (v: number | null) => void;
  sort: LospecBrowseParams['sort']; setSort: (v: LospecBrowseParams['sort']) => void;
  page: number;
  results: LospecPalette[];
  suggestions: LospecPalette[];
  total: number;
  loading: boolean;
  error: string;
  rateLimitLow: boolean;
  runBrowse: () => void;
  nextPage: () => void;
  prevPage: () => void;
  runSuggest: (q: string) => void;
  loadBySlugOrUrl: (input: string) => Promise<LospecPalette | null>;
  onLoad: (palette: LospecPalette, mode: 'all' | 'subset') => void;
}

const PAGE_SIZE = 20;

export function LospecBrowserPanel({
  hasApiKey,
  userApiKeyInput, setUserApiKeyInput,
  savedUserApiKey,
  saveUserApiKey,
  clearUserApiKey,
  query, setQuery,
  tag, setTag,
  minColors, setMinColors,
  maxColors, setMaxColors,
  sort, setSort,
  page,
  results,
  suggestions,
  total,
  loading,
  error,
  rateLimitLow,
  runBrowse,
  nextPage,
  prevPage,
  runSuggest,
  onLoad,
}: LospecBrowserPanelProps) {
  const { t } = useTheme();

  return (
    <div className="p-6 pt-2 flex flex-col gap-4">
      {/* API key settings */}
      <div className="flex flex-col gap-2 bg-black/60 rounded border-2 border-yellow-700/40 p-3">
        <label htmlFor="lospec-api-key-input" className="text-xs font-bold uppercase tracking-wider text-yellow-100/80">
          Lospec API Key
        </label>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <input
            id="lospec-api-key-input"
            type="password"
            value={userApiKeyInput}
            onChange={(e) => setUserApiKeyInput(e.target.value)}
            placeholder="Optional: paste your Lospec API key"
            className="flex-1 px-3 py-2 rounded bg-black/60 text-yellow-100 border-2 border-yellow-700/60 focus:border-yellow-400 focus:outline-none text-sm"
          />
          <button
            onClick={() => saveUserApiKey()}
            title="Save your Lospec API key"
            className="px-3 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 transition-all text-xs uppercase tracking-wider"
          >
            Save
          </button>
          {savedUserApiKey != null && (
            <button
              onClick={() => clearUserApiKey()}
              title="Clear your saved Lospec API key"
              className="px-3 py-2 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-purple-800/60"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-[10px] text-yellow-100/60 italic">
          ▸ Optional. Stored locally on this device only, never sent anywhere but Lospec.
        </p>
      </div>

      {!hasApiKey && (
        <div className="text-xs rounded p-2 border-2 bg-purple-900/60 text-yellow-100 border-yellow-700/50">
          Browsing the Lospec catalog requires an API key. You can still search by name below.
        </div>
      )}

      {error && (
        <div className={`text-xs rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>
          {error}
        </div>
      )}

      {rateLimitLow && (
        <div className="text-xs rounded p-2 border-2 bg-yellow-900/40 text-yellow-200 border-yellow-600/50">
          Lospec API rate limit is running low.
        </div>
      )}

      {/* Search / filters */}
      <div className="flex flex-col gap-2 bg-black/60 rounded border-2 border-cyan-700/40 p-3">
        <input
          type="text"
          value={query}
          onChange={(e) => runSuggest(e.target.value)}
          placeholder="Search palettes by name..."
          className="px-3 py-2 rounded bg-black/60 text-cyan-100 border-2 border-cyan-700/60 focus:border-cyan-400 focus:outline-none text-sm"
        />
        {suggestions.length > 0 && (
          <ul className="text-xs text-cyan-100/80">
            {suggestions.map((s) => (
              <li key={s.slug}>{s.title}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag..."
            className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-700/60 focus:border-cyan-400 focus:outline-none text-sm w-24"
          />
          <input
            type="number"
            value={minColors ?? ''}
            onChange={(e) => setMinColors(e.target.value === '' ? null : Number(e.target.value))}
            placeholder="Min colors"
            className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-700/60 focus:border-cyan-400 focus:outline-none text-sm w-24"
          />
          <input
            type="number"
            value={maxColors ?? ''}
            onChange={(e) => setMaxColors(e.target.value === '' ? null : Number(e.target.value))}
            placeholder="Max colors"
            className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-700/60 focus:border-cyan-400 focus:outline-none text-sm w-24"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as LospecBrowseParams['sort'])}
            className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-700/60 focus:border-cyan-400 focus:outline-none text-sm"
          >
            <option value="-publishedAt">Newest</option>
            <option value="publishedAt">Oldest</option>
            <option value="-downloads">Most downloaded</option>
            <option value="-likes">Most liked</option>
            <option value="-numberOfColors">Most colors</option>
            <option value="numberOfColors">Fewest colors</option>
          </select>
          <button
            onClick={runBrowse}
            disabled={loading}
            title="Browse the Lospec catalog with the current filters"
            className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all text-xs uppercase tracking-wider disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Browse'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="text-center text-cyan-100/60 italic text-sm py-6 border-2 border-dashed border-cyan-700/40 rounded bg-black/60">
          No results yet. Browse or search above.
        </div>
      ) : (
        <div className="grid gap-2">
          {results.map((p) => (
            <div key={p.slug} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-black/60 rounded border-2 border-cyan-700/40 p-2">
              <div className="flex h-10 sm:h-12 rounded overflow-hidden border flex-shrink-0 sm:w-32" style={{ minWidth: '8rem', borderColor: t.vizDataBorder }}>
                {p.colors.map((hex, i) => (
                  <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-cyan-100 font-bold text-sm truncate">{p.title}</div>
                <div className="text-cyan-100/60 text-[10px]">
                  by {p.author || 'unknown'} &middot; {p.numberOfColors} colors &middot; <a href={p.url} target="_blank" rel="noreferrer" className="underline">view on Lospec</a>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => onLoad(p, 'all')}
                  title="Use all as bases: load every color as a base ramp"
                  className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all text-xs uppercase tracking-wider"
                >
                  Use All as Bases
                </button>
                <button
                  onClick={() => onLoad(p, 'subset')}
                  title="Auto-pick representative colors as bases"
                  className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-purple-900/60 text-cyan-100 border-cyan-700/50 hover:bg-purple-800/60"
                >
                  Auto-pick Representatives
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-center gap-3 text-xs text-cyan-100/70">
          <button
            onClick={prevPage}
            disabled={page <= 0}
            title="Previous page"
            className="px-3 py-1 rounded font-bold border-2 uppercase tracking-wider disabled:opacity-40 bg-purple-900/60 text-cyan-100 border-cyan-700/50 hover:bg-purple-800/60"
          >
            Prev
          </button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          <button
            onClick={nextPage}
            disabled={(page + 1) * PAGE_SIZE >= total}
            title="Next page"
            className="px-3 py-1 rounded font-bold border-2 uppercase tracking-wider disabled:opacity-40 bg-purple-900/60 text-cyan-100 border-cyan-700/50 hover:bg-purple-800/60"
          >
            Next
          </button>
        </div>
      )}

      <p className="text-[10px] text-yellow-100/50 italic text-center">Palette data from Lospec (lospec.com).</p>
    </div>
  );
}
