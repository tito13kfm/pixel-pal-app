import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLospecBrowser } from '../../src/hooks/useLospecBrowser';
import { __resetLospecThrottleForTests, __resetLospecUserApiKeyForTests } from '../../src/lib/lospec';

describe('useLospecBrowser', () => {
  beforeEach(() => {
    __resetLospecThrottleForTests();
    __resetLospecUserApiKeyForTests();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('reports hasApiKey false and does not fetch on mount', () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { result } = renderHook(() => useLospecBrowser());
    expect(result.current.hasApiKey).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runBrowse fetches results only when explicitly called, and surfaces LospecNoKeyError as a friendly message', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const { result } = renderHook(() => useLospecBrowser());
    await act(async () => { result.current.runBrowse(); });
    expect(result.current.error).toMatch(/API key/i);
    expect(result.current.results).toEqual([]);
  });

  it('runSuggest debounces and only fires once for rapid input', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ([]) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { result } = renderHook(() => useLospecBrowser());
    act(() => { result.current.runSuggest('p'); result.current.runSuggest('pi'); result.current.runSuggest('pic'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('pic');
  });

  it('loadBySlugOrUrl rejects unparseable input without fetching', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { result } = renderHook(() => useLospecBrowser());
    const out = await result.current.loadBySlugOrUrl('!!! not a slug');
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads a stored user API key override on mount and reflects it in hasApiKey', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const store = new Map<string, string>();
    (window as any).storage = {
      get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
      set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
      delete: async (key: string) => { store.delete(key); return { ok: true }; },
      list: async (prefix: string) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)) }),
    };
    store.set('lospec:userApiKey', 'stored-user-key');
    const { result } = renderHook(() => useLospecBrowser());
    // The mount effect's async storage read resolves on the microtask queue,
    // but flushing the resulting setState back into `result.current` goes
    // through React's scheduler, which falls back to a (faked) setTimeout in
    // this jsdom test environment. Advance by 0 to let that flush happen.
    // (Deliberately not using RTL's `waitFor` here: its `asyncWrapper` drains
    // the microtask queue via a real `setTimeout(0)` with only Jest fake-timer
    // detection built in, so under Vitest's fake timers with `setTimeout`
    // faked it never resolves and the whole call hangs, regardless of the
    // condition being polled. See useLospecBrowser hook implementation notes.)
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.hasApiKey).toBe(true);
    expect(result.current.savedUserApiKey).toBe('stored-user-key');
  });

  it('saveUserApiKey persists the input and updates hasApiKey/savedUserApiKey', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const store = new Map<string, string>();
    (window as any).storage = {
      get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
      set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
      delete: async (key: string) => { store.delete(key); return { ok: true }; },
      list: async (prefix: string) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)) }),
    };
    const { result } = renderHook(() => useLospecBrowser());
    // See the note above on why `waitFor` isn't used with fake timers here;
    // flush the mount effect instead (hasApiKey is already synchronously
    // false from initial state, but the flush drains the no-op storage-read
    // update so it doesn't linger as unflushed scheduler work).
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.hasApiKey).toBe(false);
    act(() => { result.current.setUserApiKeyInput('new-user-key'); });
    await act(async () => { await result.current.saveUserApiKey(); });
    expect(result.current.hasApiKey).toBe(true);
    expect(result.current.savedUserApiKey).toBe('new-user-key');
    expect(store.get('lospec:userApiKey')).toBe('new-user-key');
  });

  it('rateLimitLow reflects the most recent response, clearing once the budget recovers', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', 'test-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'X-RateLimit-Remaining': '5' }),
        json: async () => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'X-RateLimit-Remaining': '200' }),
        json: async () => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { result } = renderHook(() => useLospecBrowser());
    await act(async () => { result.current.runBrowse(); });
    expect(result.current.rateLimitLow).toBe(true);
    // Different tag forces a distinct cache key so the second call actually
    // hits the network instead of serving the first call's cached page.
    act(() => { result.current.setTag('game-boy'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { result.current.runBrowse(); });
    expect(result.current.rateLimitLow).toBe(false);
  });

  it('clearUserApiKey removes the override and clears the input', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const store = new Map<string, string>();
    (window as any).storage = {
      get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
      set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
      delete: async (key: string) => { store.delete(key); return { ok: true }; },
      list: async (prefix: string) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)) }),
    };
    const { result } = renderHook(() => useLospecBrowser());
    act(() => { result.current.setUserApiKeyInput('temp-key'); });
    await act(async () => { await result.current.saveUserApiKey(); });
    await act(async () => { await result.current.clearUserApiKey(); });
    expect(result.current.hasApiKey).toBe(false);
    expect(result.current.savedUserApiKey).toBeNull();
    expect(result.current.userApiKeyInput).toBe('');
    expect(store.has('lospec:userApiKey')).toBe(false);
  });
});
