import { useCallback, useEffect, useRef, useState } from 'react';
import {
  browseLospecPalettes, suggestLospecPalettes, fetchLospecPalette,
  parseLospecSlug, getLospecApiKey, debounce, LospecNoKeyError,
  loadUserApiKeyOverride, saveUserApiKeyOverride, getLospecRateLimitRemaining,
} from '../lib/lospec';
import type { LospecPalette, LospecBrowseParams } from '../lib/lospec';

export interface UseLospecBrowserResult {
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
  runBrowse: () => void; // explicit action: fetch page 0 with current filters
  nextPage: () => void;
  prevPage: () => void;
  runSuggest: (q: string) => void; // debounced internally
  loadBySlugOrUrl: (input: string) => Promise<LospecPalette | null>;
  cancelPending: () => void; // aborts any in-flight request (panel close/unmount)
}

export function useLospecBrowser(): UseLospecBrowserResult {
  const [hasApiKey, setHasApiKey] = useState(() => getLospecApiKey() !== null);
  const [userApiKeyInput, setUserApiKeyInput] = useState('');
  const [savedUserApiKey, setSavedUserApiKey] = useState<string | null>(null);

  // Local-storage read only (not a Lospec network call) - doesn't violate
  // the "nothing fires on mount" constraint, which is about outbound
  // requests to lospec.com/api.lospec.com.
  useEffect(() => {
    let cancelled = false;
    loadUserApiKeyOverride().then((stored) => {
      if (cancelled) return;
      setSavedUserApiKey(stored);
      setHasApiKey(getLospecApiKey() !== null);
    });
    return () => { cancelled = true; };
  }, []);

  const saveUserApiKey = useCallback(async () => {
    const trimmed = userApiKeyInput.trim() || null;
    await saveUserApiKeyOverride(trimmed);
    setSavedUserApiKey(trimmed);
    setHasApiKey(getLospecApiKey() !== null);
  }, [userApiKeyInput]);

  const clearUserApiKey = useCallback(async () => {
    await saveUserApiKeyOverride(null);
    setSavedUserApiKey(null);
    setUserApiKeyInput('');
    setHasApiKey(getLospecApiKey() !== null);
  }, []);

  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [minColors, setMinColors] = useState<number | null>(null);
  const [maxColors, setMaxColors] = useState<number | null>(null);
  const [sort, setSort] = useState<LospecBrowseParams['sort']>('-publishedAt');
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<LospecPalette[]>([]);
  const [suggestions, setSuggestions] = useState<LospecPalette[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rateLimitLow, setRateLimitLow] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const PAGE_SIZE = 20;

  const cancelPending = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const browsePage = useCallback(async (nextPage: number) => {
    cancelPending();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const params: LospecBrowseParams = {
        tag: tag || undefined,
        minColors: minColors ?? undefined,
        maxColors: maxColors ?? undefined,
        sort,
        limit: PAGE_SIZE,
        offset: nextPage * PAGE_SIZE,
      };
      const res = await browseLospecPalettes(params, controller.signal);
      setResults(res.palettes);
      setTotal(res.total);
      setPage(nextPage);
      const remaining = getLospecRateLimitRemaining();
      setRateLimitLow(remaining !== null && remaining < 10);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (err instanceof LospecNoKeyError) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Browse failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [tag, minColors, maxColors, sort, cancelPending]);

  const runBrowse = useCallback(() => { browsePage(0); }, [browsePage]);
  const nextPage = useCallback(() => { browsePage(page + 1); }, [browsePage, page]);
  const prevPage = useCallback(() => { if (page > 0) browsePage(page - 1); }, [browsePage, page]);

  const debouncedSuggestRef = useRef(debounce(async (q: string, signal: AbortSignal) => {
    try {
      const res = await suggestLospecPalettes(q, signal);
      setSuggestions(res);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSuggestions([]);
    }
  }, 300));

  const runSuggest = useCallback((q: string) => {
    setQuery(q);
    cancelPending();
    const controller = new AbortController();
    abortRef.current = controller;
    debouncedSuggestRef.current(q, controller.signal);
  }, [cancelPending]);

  const loadBySlugOrUrl = useCallback(async (input: string): Promise<LospecPalette | null> => {
    const slug = parseLospecSlug(input);
    if (!slug) {
      setError('Not a recognized Lospec slug or URL. Try a plain slug (e.g. "pear36") or a full lospec.com/palette-list/ URL.');
      return null;
    }
    cancelPending();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      return await fetchLospecPalette(slug, controller.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
      setError(err instanceof Error ? err.message : 'Load failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [cancelPending]);

  return {
    hasApiKey, userApiKeyInput, setUserApiKeyInput, savedUserApiKey, saveUserApiKey, clearUserApiKey,
    query, setQuery, tag, setTag, minColors, setMinColors,
    maxColors, setMaxColors, sort, setSort, page, results, suggestions, total,
    loading, error, rateLimitLow, runBrowse, nextPage, prevPage, runSuggest,
    loadBySlugOrUrl, cancelPending,
  };
}
