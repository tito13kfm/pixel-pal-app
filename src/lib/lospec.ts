/// <reference types="node" />
// src/lib/lospec.ts
//
// Client for browsing/loading palettes from Lospec (issue #133). The ONLY
// module that knows Lospec URLs, so endpoint churn is a one-file fix.
// See docs/superpowers/specs/2026-07-18-lospec-browser-design.md for the
// full research + design rationale (rate limits, CORS, licensing).

export interface LospecPalette {
  slug: string;
  title: string;
  colors: string[]; // '#rrggbb', lowercase
  numberOfColors: number;
  author: string; // '' if unavailable
  url: string; // https://lospec.com/palette-list/{slug}
}

export class LospecNoKeyError extends Error {}

const LOSPEC_KEYED_BASE = 'https://api.lospec.com/api/v1';
const lospecPaletteUrl = (slug: string) => `https://lospec.com/palette-list/${slug}`;
const lospecKeylessSlugUrl = (slug: string) => `${lospecPaletteUrl(slug)}.json`;

let userApiKeyOverride: string | null = null;

export function setUserApiKeyOverrideCache(key: string | null): void {
  userApiKeyOverride = key && key.length > 0 ? key : null;
}

// Test-only: clears the module-level cache between tests.
export function __resetLospecUserApiKeyForTests(): void {
  userApiKeyOverride = null;
}

const USER_API_KEY_STORAGE_KEY = 'lospec:userApiKey';

export async function loadUserApiKeyOverride(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.storage) return null;
  const got = await window.storage.get(USER_API_KEY_STORAGE_KEY);
  const key = got?.value || null;
  setUserApiKeyOverrideCache(key);
  return key;
}

export async function saveUserApiKeyOverride(key: string | null): Promise<void> {
  if (typeof window === 'undefined' || !window.storage) return;
  const trimmed = key?.trim() || null;
  if (trimmed) {
    await window.storage.set(USER_API_KEY_STORAGE_KEY, trimmed);
  } else {
    await window.storage.delete(USER_API_KEY_STORAGE_KEY);
  }
  setUserApiKeyOverrideCache(trimmed);
}

// Read via this accessor only (never scattered import.meta.env reads) so
// tests can stub it; vitest doesn't load .env, so tests stub process.env.
export function getLospecApiKey(): string | null {
  if (userApiKeyOverride) return userApiKeyOverride;
  const fromImportMeta = (import.meta as any).env?.VITE_LOSPEC_API_KEY;
  const fromProcessEnv = typeof process !== 'undefined' ? process.env.VITE_LOSPEC_API_KEY : undefined;
  const key = fromImportMeta || fromProcessEnv;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

const SLUG_RE = /^[a-z0-9-]+$/i;
export function parseLospecSlug(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/lospec\.com\/palette-list\/([a-z0-9-]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  if (SLUG_RE.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function normalizeHex(hex: string): string {
  const stripped = hex.replace(/^#/, '').toLowerCase();
  return `#${stripped}`;
}

function mapExpandedPalette(d: any): LospecPalette {
  return {
    slug: d.slug,
    title: d.title,
    colors: (d.colors || []).map(normalizeHex),
    numberOfColors: d.numberOfColors ?? (d.colors || []).length,
    author: d.user?.name ?? '',
    url: d.url ?? lospecPaletteUrl(d.slug),
  };
}

const MIN_REQUEST_INTERVAL_MS = 2000;
let lastRequestAt = 0;
let rateLimitRemaining: number | null = null;
const inFlightByUrl = new Map<string, Promise<Response>>();

export function getLospecRateLimitRemaining(): number | null {
  return rateLimitRemaining;
}

// Test-only: module state (lastRequestAt/inFlightByUrl/rateLimitRemaining)
// persists across tests in the same file otherwise.
export function __resetLospecThrottleForTests(): void {
  lastRequestAt = 0;
  rateLimitRemaining = null;
  inFlightByUrl.clear();
}

export async function throttledFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const existing = inFlightByUrl.get(url);
  if (existing) return existing;
  const run = (async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    const res = await fetch(url, init);
    const remaining = res.headers.get('X-RateLimit-Remaining');
    if (remaining !== null) rateLimitRemaining = Number(remaining);
    return res;
  })();
  inFlightByUrl.set(url, run);
  try {
    return await run;
  } finally {
    inFlightByUrl.delete(url);
  }
}

export const CACHE_PREFIX = 'lospec:';
export const CATALOG_PAGE_TTL_MS = 24 * 60 * 60 * 1000;
export const PALETTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CACHED_PAGES = 20;

interface CacheEnvelope<T> { cachedAt: number; data: T }

export async function cacheGet<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  if (typeof window === 'undefined' || !window.storage) return null;
  const got = await window.storage.get(CACHE_PREFIX + key);
  if (!got || !got.value) return null;
  try {
    const env: CacheEnvelope<T> = JSON.parse(got.value);
    const ttl = key.startsWith('page:') ? CATALOG_PAGE_TTL_MS : PALETTE_TTL_MS;
    return { data: env.data, stale: Date.now() - env.cachedAt > ttl };
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  if (typeof window === 'undefined' || !window.storage) return;
  await window.storage.set(CACHE_PREFIX + key, JSON.stringify({ cachedAt: Date.now(), data }));
  if (key.startsWith('page:')) await evictOldPages();
}

async function evictOldPages(): Promise<void> {
  if (typeof window === 'undefined' || !window.storage) return;
  const listed = await window.storage.list(CACHE_PREFIX + 'page:');
  if (!listed || listed.keys.length <= MAX_CACHED_PAGES) return;
  const withTimes: { key: string; cachedAt: number }[] = [];
  for (const key of listed.keys) {
    const got = await window.storage.get(key);
    if (!got?.value) continue;
    try {
      withTimes.push({ key, cachedAt: JSON.parse(got.value).cachedAt || 0 });
    } catch {
      // malformed entry; leave it for now, don't fail eviction over it
    }
  }
  withTimes.sort((a, b) => a.cachedAt - b.cachedAt);
  const toDelete = withTimes.slice(0, withTimes.length - MAX_CACHED_PAGES);
  for (const { key } of toDelete) await window.storage.delete(key);
}

export async function fetchLospecPalette(slug: string, signal?: AbortSignal): Promise<LospecPalette> {
  const key = getLospecApiKey();
  if (key) {
    try {
      const res = await throttledFetch(`${LOSPEC_KEYED_BASE}/palettes/${slug}?format=expanded`, {
        headers: { Authorization: `Bearer ${key}` },
        signal,
      });
      if (res.ok) return mapExpandedPalette(await res.json());
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      // fall through to the keyless endpoint
    }
  }
  const res = await throttledFetch(lospecKeylessSlugUrl(slug), { signal });
  if (!res.ok) {
    throw new Error(res.status === 404 ? 'Palette not found on Lospec' : `Lospec request failed (${res.status})`);
  }
  const data = await res.json();
  return {
    slug,
    title: data.name,
    colors: (data.colors || []).map(normalizeHex),
    numberOfColors: (data.colors || []).length,
    author: data.author ?? '',
    url: lospecPaletteUrl(slug),
  };
}

export interface LospecBrowseParams {
  tag?: string;
  minColors?: number;
  maxColors?: number;
  numberOfColors?: number;
  sort?: 'createdAt' | '-createdAt' | 'downloads' | '-downloads' | 'likes' | '-likes' | 'numberOfColors' | '-numberOfColors' | 'publishedAt' | '-publishedAt';
  limit?: number;
  offset?: number;
}

export interface LospecBrowseResult {
  palettes: LospecPalette[];
  total: number;
  limit: number;
  offset: number;
}

function pageCacheKey(params: LospecBrowseParams): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${(params as any)[k]}`).join('&');
  return `page:${sorted}`;
}

export async function browseLospecPalettes(params: LospecBrowseParams, signal?: AbortSignal): Promise<LospecBrowseResult> {
  const key = getLospecApiKey();
  if (!key) {
    throw new LospecNoKeyError('Browsing the Lospec catalog requires an API key; try Load by slug/URL or Search by name instead.');
  }
  const cacheKey = pageCacheKey(params);
  const cached = await cacheGet<LospecBrowseResult>(cacheKey);
  if (cached && !cached.stale) return cached.data;
  const qs = new URLSearchParams();
  qs.set('format', 'expanded');
  if (params.tag) qs.set('tag', params.tag);
  if (params.minColors != null) qs.set('minColors', String(params.minColors));
  if (params.maxColors != null) qs.set('maxColors', String(params.maxColors));
  if (params.numberOfColors != null) qs.set('numberOfColors', String(params.numberOfColors));
  if (params.sort) qs.set('sort', params.sort);
  qs.set('limit', String(params.limit ?? 20));
  qs.set('offset', String(params.offset ?? 0));
  try {
    const res = await throttledFetch(`${LOSPEC_KEYED_BASE}/palettes?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
    if (!res.ok) throw new Error(`Lospec browse failed (${res.status})`);
    const data = await res.json();
    const result: LospecBrowseResult = {
      palettes: (data.data || []).map(mapExpandedPalette),
      total: data.meta?.total ?? 0,
      limit: data.meta?.limit ?? params.limit ?? 20,
      offset: data.meta?.offset ?? params.offset ?? 0,
    };
    await cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    if (cached) return cached.data;
    throw err;
  }
}

const lospecPublicSuggestUrl = (q: string) => `https://api.lospec.com/palettes/suggest/${encodeURIComponent(q)}`;
const lospecKeyedSuggestUrl = (q: string) => `${LOSPEC_KEYED_BASE}/palettes/suggest/${encodeURIComponent(q)}?format=expanded`;

export async function suggestLospecPalettes(query: string, signal?: AbortSignal): Promise<LospecPalette[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const key = getLospecApiKey();
  const url = key ? lospecKeyedSuggestUrl(trimmed) : lospecPublicSuggestUrl(trimmed);
  const init: RequestInit = key ? { headers: { Authorization: `Bearer ${key}` }, signal } : { signal };
  const res = await throttledFetch(url, init);
  if (!res.ok) throw new Error(`Lospec search failed (${res.status})`);
  const data = await res.json();
  const list: any[] = Array.isArray(data) ? data : (data.data || []);
  return list.slice(0, 10).map((d) => (key
    ? mapExpandedPalette(d)
    : {
      slug: d.slug,
      title: d.title,
      colors: (d.colors || []).map(normalizeHex),
      numberOfColors: d.numberOfColors ?? (d.colors || []).length,
      author: d.userName ?? '',
      url: lospecPaletteUrl(d.slug),
    }));
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}
