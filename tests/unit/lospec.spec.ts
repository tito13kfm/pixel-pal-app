import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseLospecSlug,
  fetchLospecPalette,
  throttledFetch,
  getLospecRateLimitRemaining,
  __resetLospecThrottleForTests,
  cacheGet,
  cacheSet,
  CACHE_PREFIX,
  CATALOG_PAGE_TTL_MS,
  PALETTE_TTL_MS,
  MAX_CACHED_PAGES,
  browseLospecPalettes,
  suggestLospecPalettes,
  debounce,
  LospecNoKeyError,
} from '../../src/lib/lospec';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => {
      const value = store.get(key);
      return value !== undefined ? { value } : null;
    },
    set: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async (prefix: string) => {
      const keys = Array.from(store.keys()).filter((k) => k.startsWith(prefix));
      return { keys };
    },
  };
}

describe('parseLospecSlug', () => {
  it('extracts a slug from a full lospec.com URL', () => {
    expect(parseLospecSlug('https://lospec.com/palette-list/greyt-bit')).toBe('greyt-bit');
  });
  it('extracts a slug from a URL with trailing slash/query', () => {
    expect(parseLospecSlug('https://lospec.com/palette-list/greyt-bit/')).toBe('greyt-bit');
  });
  it('accepts a bare slug', () => {
    expect(parseLospecSlug('greyt-bit')).toBe('greyt-bit');
  });
  it('rejects garbage input', () => {
    expect(parseLospecSlug('not a slug!!')).toBeNull();
    expect(parseLospecSlug('')).toBeNull();
  });
});

describe('fetchLospecPalette', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('uses the keyless {slug}.json endpoint when no API key is configured', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ name: 'Greyt-bit', author: 'Sam Keddy', colors: ['574368', 'ffffff'] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchLospecPalette('greyt-bit');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://lospec.com/palette-list/greyt-bit.json',
      expect.anything(),
    );
    expect(result).toEqual({
      slug: 'greyt-bit',
      title: 'Greyt-bit',
      colors: ['#574368', '#ffffff'],
      numberOfColors: 2,
      author: 'Sam Keddy',
      url: 'https://lospec.com/palette-list/greyt-bit',
    });
  });

  it('throws a clear error on 404', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers() }) as unknown as typeof fetch;
    await expect(fetchLospecPalette('nope')).rejects.toThrow(/not found/i);
  });

  it('uses the keyed endpoint first when an API key is configured, falling back to keyless on failure', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', 'test-key-123');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({ name: 'Greyt-bit', author: 'Sam Keddy', colors: ['574368'] }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchLospecPalette('greyt-bit');
    expect(fetchMock.mock.calls[0][0]).toContain('api.lospec.com/api/v1/palettes/greyt-bit');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key-123');
    expect(fetchMock.mock.calls[1][0]).toBe('https://lospec.com/palette-list/greyt-bit.json');
    expect(result.title).toBe('Greyt-bit');
  });

  it('successfully maps the keyed endpoint response when the API key call succeeds', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', 'test-key-456');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({
        slug: 'greyt-bit',
        title: 'Greyt-Bit',
        colors: ['574368', 'FFFFFF', '89f26e'],
        numberOfColors: 3,
        user: { name: 'Sam Keddy' },
        url: 'https://lospec.com/palette-list/greyt-bit',
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await fetchLospecPalette('greyt-bit');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('api.lospec.com/api/v1/palettes/greyt-bit?format=expanded');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key-456');
    expect(result).toEqual({
      slug: 'greyt-bit',
      title: 'Greyt-Bit',
      colors: ['#574368', '#ffffff', '#89f26e'],
      numberOfColors: 3,
      author: 'Sam Keddy',
      url: 'https://lospec.com/palette-list/greyt-bit',
    });
  });
});

describe('throttledFetch', () => {
  beforeEach(() => { __resetLospecThrottleForTests(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('waits at least 2s between two calls to different URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const p1 = throttledFetch('https://api.lospec.com/api/v1/a');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const p2 = throttledFetch('https://api.lospec.com/api/v1/b');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await Promise.all([p1, p2]);
  });

  it('single-flights identical concurrent URLs (one network call, both callers resolve)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const [r1, r2] = await Promise.all([
      throttledFetch('https://api.lospec.com/api/v1/same'),
      throttledFetch('https://api.lospec.com/api/v1/same'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it('captures X-RateLimit-Remaining from response headers', async () => {
    const headers = new Headers({ 'X-RateLimit-Remaining': '42' });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, headers, json: async () => ({}) }) as unknown as typeof fetch;
    await throttledFetch('https://api.lospec.com/api/v1/c');
    expect(getLospecRateLimitRemaining()).toBe(42);
  });
});

describe('cacheGet / cacheSet', () => {
  beforeEach(() => {
    const mock = makeMockStorage();
    (window as any).storage = mock;
  });

  afterEach(() => {
    delete (window as any).storage;
  });

  describe('TTL staleness', () => {
    it('reports a fresh page: key as stale: false', async () => {
      const data = { title: 'Test Palette' };
      await cacheSet('page:test-1', data);
      const result = await cacheGet<typeof data>('page:test-1');
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(false);
      expect(result!.data).toEqual(data);
    });

    it('reports a stale page: key (older than CATALOG_PAGE_TTL_MS) as stale: true', async () => {
      const data = { title: 'Old Page' };
      const storage = (window as any).storage;
      const envelope = { cachedAt: Date.now() - CATALOG_PAGE_TTL_MS - 1000, data };
      await storage.set(CACHE_PREFIX + 'page:stale-page', JSON.stringify(envelope));

      const result = await cacheGet<typeof data>('page:stale-page');
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(true);
    });

    it('reports a key just under the CATALOG_PAGE_TTL_MS threshold as stale: false', async () => {
      const data = { title: 'Almost Stale Page' };
      const storage = (window as any).storage;
      const envelope = { cachedAt: Date.now() - CATALOG_PAGE_TTL_MS + 1000, data };
      await storage.set(CACHE_PREFIX + 'page:almost-stale', JSON.stringify(envelope));

      const result = await cacheGet<typeof data>('page:almost-stale');
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(false);
    });

    it('reports a fresh non-page key as stale: false', async () => {
      const data = { slug: 'test-palette' };
      await cacheSet('palette:test-palette', data);
      const result = await cacheGet<typeof data>('palette:test-palette');
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(false);
    });

    it('reports a stale non-page key (older than PALETTE_TTL_MS) as stale: true', async () => {
      const data = { slug: 'old-palette' };
      const storage = (window as any).storage;
      const envelope = { cachedAt: Date.now() - PALETTE_TTL_MS - 1000, data };
      await storage.set(CACHE_PREFIX + 'palette:old-palette', JSON.stringify(envelope));

      const result = await cacheGet<typeof data>('palette:old-palette');
      expect(result).not.toBeNull();
      expect(result!.stale).toBe(true);
    });

    it('uses the longer PALETTE_TTL_MS (7 days) for non-page keys', async () => {
      // Verify the constants themselves for clarity
      expect(PALETTE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(CATALOG_PAGE_TTL_MS).toBe(24 * 60 * 60 * 1000);
      expect(PALETTE_TTL_MS).toBeGreaterThan(CATALOG_PAGE_TTL_MS);
    });
  });

  describe('LRU eviction cap', () => {
    it('does not evict when page entries are under the MAX_CACHED_PAGES limit', async () => {
      for (let i = 0; i < MAX_CACHED_PAGES - 1; i++) {
        await cacheSet(`page:p${i}`, { index: i });
      }

      const storage = (window as any).storage;
      const listed = await storage.list(CACHE_PREFIX + 'page:');
      expect(listed.keys.length).toBe(MAX_CACHED_PAGES - 1);
    });

    it('evicts the oldest entry when a new page: key exceeds MAX_CACHED_PAGES', async () => {
      const storage = (window as any).storage;

      // Add MAX_CACHED_PAGES entries with staggered timestamps
      for (let i = 0; i < MAX_CACHED_PAGES; i++) {
        const envelope = { cachedAt: Date.now() - (MAX_CACHED_PAGES - i) * 1000, data: { index: i } };
        await storage.set(CACHE_PREFIX + `page:p${i}`, JSON.stringify(envelope));
      }

      // Verify we have exactly MAX_CACHED_PAGES
      let listed = await storage.list(CACHE_PREFIX + 'page:');
      expect(listed.keys.length).toBe(MAX_CACHED_PAGES);

      // Add one more via cacheSet, which should trigger eviction
      await cacheSet(`page:pnew`, { index: 'new' });

      // Should still be at MAX_CACHED_PAGES, with the oldest (p0) evicted
      listed = await storage.list(CACHE_PREFIX + 'page:');
      expect(listed.keys.length).toBe(MAX_CACHED_PAGES);

      // Oldest entry (p0) should be gone
      const p0 = await storage.get(CACHE_PREFIX + 'page:p0');
      expect(p0).toBeNull();

      // Newest entry should exist
      const pnew = await storage.get(CACHE_PREFIX + 'page:pnew');
      expect(pnew).not.toBeNull();
    });

    it('evicts multiple oldest entries when significantly over the limit', async () => {
      const storage = (window as any).storage;

      // Add 2x the limit with staggered timestamps
      const overage = MAX_CACHED_PAGES * 2;
      for (let i = 0; i < overage; i++) {
        const envelope = { cachedAt: Date.now() - (overage - i) * 1000, data: { index: i } };
        await storage.set(CACHE_PREFIX + `page:p${i}`, JSON.stringify(envelope));
      }

      // Trigger eviction via cacheSet
      await cacheSet('page:trigger', { data: 'trigger' });

      // Should be capped at MAX_CACHED_PAGES
      const listed = await storage.list(CACHE_PREFIX + 'page:');
      expect(listed.keys.length).toBeLessThanOrEqual(MAX_CACHED_PAGES);
    });
  });

  describe('eviction scope', () => {
    it('only evicts lospec:page:* keys, never other lospec:* entries', async () => {
      const storage = (window as any).storage;

      // Add non-page lospec entries
      await storage.set(CACHE_PREFIX + 'palette:old', JSON.stringify({ cachedAt: Date.now() - 1000, data: 'old' }));
      await storage.set(CACHE_PREFIX + 'metadata:index', JSON.stringify({ cachedAt: Date.now() - 1000, data: 'meta' }));

      // Add MAX_CACHED_PAGES page entries
      for (let i = 0; i < MAX_CACHED_PAGES; i++) {
        const envelope = { cachedAt: Date.now() - (MAX_CACHED_PAGES - i) * 1000, data: { index: i } };
        await storage.set(CACHE_PREFIX + `page:p${i}`, JSON.stringify(envelope));
      }

      // Trigger eviction by adding one more page
      await cacheSet('page:new', { data: 'new' });

      // Non-page entries should still exist
      const paletteEntry = await storage.get(CACHE_PREFIX + 'palette:old');
      const metadataEntry = await storage.get(CACHE_PREFIX + 'metadata:index');
      expect(paletteEntry).not.toBeNull();
      expect(metadataEntry).not.toBeNull();

      // Page entries should be capped
      const listed = await storage.list(CACHE_PREFIX + 'page:');
      expect(listed.keys.length).toBeLessThanOrEqual(MAX_CACHED_PAGES);
    });
  });

  it('returns null when storage is unavailable', async () => {
    delete (window as any).storage;
    const result = await cacheGet('page:test');
    expect(result).toBeNull();
  });

  it('handles malformed cache entries gracefully', async () => {
    const storage = (window as any).storage;
    await storage.set(CACHE_PREFIX + 'page:corrupt', 'not-valid-json');
    const result = await cacheGet('page:corrupt');
    expect(result).toBeNull();
  });
});

describe('browseLospecPalettes', () => {
  beforeEach(() => { __resetLospecThrottleForTests(); (window as any).storage = makeMockStorage(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('throws LospecNoKeyError when no API key is configured', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    await expect(browseLospecPalettes({})).rejects.toBeInstanceOf(LospecNoKeyError);
  });

  it('fetches, maps, and caches a page when a key is configured', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', 'k');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, headers: new Headers(),
      json: async () => ({ data: [{ slug: 'a', title: 'A', colors: ['ff0000'], user: { name: 'Someone' }, url: 'https://lospec.com/palette-list/a' }], meta: { total: 1, limit: 20, offset: 0 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await browseLospecPalettes({ tag: 'game-boy' });
    expect(result.palettes).toEqual([{ slug: 'a', title: 'A', colors: ['#ff0000'], numberOfColors: 1, author: 'Someone', url: 'https://lospec.com/palette-list/a' }]);
    expect(result.total).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toContain('tag=game-boy');
    // second call with the same params hits cache, not fetch
    fetchMock.mockClear();
    const cached = await browseLospecPalettes({ tag: 'game-boy' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cached).toEqual(result);
  });

  it('serves stale cache on fetch failure', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', 'k');
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, headers: new Headers(),
      json: async () => ({ data: [], meta: { total: 0, limit: 20, offset: 0 } }),
    });
    const first = await browseLospecPalettes({});
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers() });
    // Force staleness by pretending the cache entry is old: write directly.
    const keys = await (window as any).storage.list('lospec:page:');
    const raw = await (window as any).storage.get(keys.keys[0]);
    const env = JSON.parse(raw.value);
    env.cachedAt = 0;
    await (window as any).storage.set(keys.keys[0], JSON.stringify(env));
    const second = await browseLospecPalettes({});
    expect(second).toEqual(first);
  });
});

describe('suggestLospecPalettes', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); __resetLospecThrottleForTests(); });

  it('uses the public no-auth endpoint when no key is configured', async () => {
    vi.stubEnv('VITE_LOSPEC_API_KEY', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), json: async () => ([{ slug: 'a', title: 'A', colors: ['ff0000'], userName: 'Someone' }]) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await suggestLospecPalettes('pico');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.lospec.com/palettes/suggest/pico');
    expect(result[0].author).toBe('Someone');
  });

  it('returns [] for an empty/whitespace query without fetching', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await suggestLospecPalettes('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses rapid calls into one, using the last args', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced('a'); debounced('b'); debounced('c');
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });
});
