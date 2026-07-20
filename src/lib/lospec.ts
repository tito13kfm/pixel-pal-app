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

// Temporary stub. Task 4 will replace with real throttle/cache wrapper.
async function throttledFetch(url: string, init: RequestInit = {}) {
  return fetch(url, init);
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
