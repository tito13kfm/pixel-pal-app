import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseLospecSlug, fetchLospecPalette } from '../../src/lib/lospec';

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
