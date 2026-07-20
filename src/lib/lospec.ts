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

// Read via this accessor only (never scattered import.meta.env reads) so
// tests can stub it; vitest doesn't load .env, so tests stub process.env.
export function getLospecApiKey(): string | null {
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

const CACHE_PREFIX = 'lospec:';
const CATALOG_PAGE_TTL_MS = 24 * 60 * 60 * 1000;
const PALETTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHED_PAGES = 20;

interface CacheEnvelope<T> { cachedAt: number; data: T }

async function cacheGet<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
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

async function cacheSet<T>(key: string, data: T): Promise<void> {
  if (typeof window === 'undefined' || !window.storage) return;
  await window.storage.set(CACHE_PREFIX + key, JSON.stringify({ cachedAt: Date.now(), data }));
  if (key.startsWith('page:')) await evictOldPages();
}

async function evictOldPages(): Promise<void> {
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
