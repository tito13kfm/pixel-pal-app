# Lospec Browser (issue #133) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user browse/search the Lospec palette catalog from inside PIXEL.PAL and one-click "Load" a result straight into the working palette, with attribution preserved through save/load.

**Architecture:** One new network/cache client (`src/lib/lospec.ts`) talks to Lospec's keyed developer API (with keyless fallbacks for slug-load and name-search). A new hook (`useLospecBrowser`) owns the panel's fetch/filter/pagination state and calls the client only on explicit user action (never per keystroke, never on mount). A new presentational panel renders it. The "Load" action does NOT invent a third import pipeline: it funnels through a shared `applyImportedBases` core extracted from the two existing import paths (`loadClassicPalette`, `applyGplImport` in `useSavedPalettesActions.ts`), so classic-palette load, `.gpl` import, and Lospec load are three thin callers of one state-reset sequence. A new `lospecSource` field on the Zustand ramps store carries provenance (author/title/url) through undo/redo and the saved-palette payload, defaulting to `null` everywhere except the Lospec path, so it can never leak into a palette that didn't come from Lospec.

**Tech Stack:** React 19 + TS 6 + Zustand (existing store), Vitest + Testing Library (existing), native `fetch` (no new dependency), `window.storage` (localStorage shim, existing).

## Global Constraints

- User-initiated only: the panel fetches nothing until the user opens it or takes an explicit search/filter/page action. No background refresh, no fetch-on-mount.
- Never call the Lospec API on a keystroke. Free-text tag/color-count filters and pagination are explicit-click actions; name search is debounced ~300ms at minimum, still explicit (user typed and paused), never fired by the mere existence of an empty input.
- Throttle: ≥2s between any two outbound Lospec requests (module-level gate), single-flight per exact URL, `AbortController` on superseded requests **and** on panel close/unmount (not just supersession).
- Cache: `window.storage` under a `lospec:` prefix, never `palettes:` (must not count against `SAVED_PALETTE_LIMIT = 100` or appear in Saved Palettes). Catalog pages TTL ~24h, single-palette TTL ~7d, stale-served-on-fetch-failure. Cap cached catalog pages at 20 (LRU evict oldest).
- Attribution: every surfaced result shows name + author and links to `lospec.com/palette-list/{slug}`. A saved palette that originated from a Lospec load keeps that provenance in its stored record. Panel footer carries a "Palette data from Lospec" note. Never surface/mirror `examples[]` artwork images.
- No second import pipeline. Every "replace the working palette with a set of colors" action (classic, gpl, lospec) shares one core sequence (`applyImportedBases`); do not duplicate the tag/setBaseColors/setAiColorNames/reset/hardwareLock/shuffleSeed sequence a third time.
- `lospecSource` defaults to `null` and is only ever set non-null by the Lospec load path; it is cleared by `resetPaletteState` (so every other full-palette-replace path clears it for free) and participates in undo/redo snapshots (`buildSnapshot`/`applySnapshotFields`) so undoing past a Lospec load restores `null` correctly. It is NOT base-indexed, so it does **not** need re-keying in `removeRamp`/`duplicateRamp`/`reorderRamps`.
- API key: read via one accessor function (`getLospecApiKey()` in `lospec.ts`), never scattered `import.meta.env.VITE_LOSPEC_API_KEY` reads, so tests can stub it. Vitest does not load `.env`, so tests get the keyless path unless they stub the accessor.
- Keyless degraded mode is a designed UX state, not an accident: without a key, "Load by slug/URL" and "Search by name" still work (both have public/keyless fallbacks); "Browse/filter the catalog" does not (`/api/v1/palettes` requires auth) and the panel must say so, not silently show empty results.
- This repo's dev sandbox blocks outbound requests to `*.lospec.com`, local live-testing of the network paths is not possible here. Verification for the network paths is: (a) mocked-`fetch` unit tests (the real gate), (b) a one-time manual build+bundle-grep check that the API key reaches the client bundle (Task 11), (c) an eventual real check only possible on the deployed GH Pages site or a machine outside this sandbox. Do not claim a live end-to-end verification that wasn't actually run.

---

## File Map

- Modify `src/store/rampsStore.ts`, add `lospecSource` field/setter, thread through `buildSnapshot`/`applySnapshotFields`.
- Modify `src/hooks/usePaletteState.ts`, passthrough `lospecSource`/`setLospecSource`.
- Modify `src/hooks/usePaletteReset.ts`, clear `lospecSource` in `resetPaletteState`.
- Create `src/lib/lospec.ts`, types, API key accessor, slug/URL parsing, throttle gate, TTL cache, `fetchLospecPalette`, `browseLospecPalettes`, `suggestLospecPalettes`, `debounce`.
- Modify `src/hooks/useSavedPalettesActions.ts`, extract `applyImportedBases` core; add `loadLospecPalette`; extend `SavedPaletteEntry` + save/load payload with `lospecSource`.
- Modify `src/lib/panel-state.ts`, add `lospecOpen` key.
- Create `src/hooks/useLospecBrowser.ts`, panel state bag + actions.
- Create `src/components/panels/LospecBrowserPanel.tsx`, presentational panel (structure now; visual layout pending a mockup, see Task 9).
- Modify `src/App.tsx`, wire the hook, add the `SectionCard` entry.
- Modify `.github/workflows/deploy-web.yml`, `.github/workflows/release.yml`, inject `VITE_LOSPEC_API_KEY` from a new `LOSPEC_API_KEY` repo secret.
- Modify `CHANGELOG.md`, `README.md`, `docs/ARCHITECTURE.md`, document the feature, the env var, and the cache prefix.

Test files: `tests/unit/rampsStore.spec.ts` (extend), `tests/unit/usePaletteReset.spec.tsx` (extend), `tests/unit/lospec.spec.ts` (new), `tests/unit/useSavedPalettesActions.spec.ts` (new), `tests/unit/panel-state.spec.ts` (extend), `tests/unit/useLospecBrowser.spec.ts` (new), `tests/unit/LospecBrowserPanel.spec.tsx` (new).

---

### Task 1: `lospecSource` on the ramps store

**Files:**
- Modify: `src/store/rampsStore.ts`
- Modify: `src/hooks/usePaletteState.ts`
- Test: `tests/unit/rampsStore.spec.ts`

**Interfaces:**
- Produces: `LospecSource = { slug: string; title: string; author: string; url: string } | null`; `store.lospecSource: LospecSource`; `store.setLospecSource: (v: Updater<LospecSource>) => void`; same two names passed through `usePaletteState()`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/rampsStore.spec.ts` (extend the existing `beforeEach` reset object with `lospecSource: null,` and add):

```ts
it('lospecSource defaults to null and round-trips through set/build/apply snapshot', () => {
  expect(useRampsStore.getState().lospecSource).toBeNull();
  const provenance = { slug: 'greyt-bit', title: 'Greyt-bit', author: 'Sam Keddy', url: 'https://lospec.com/palette-list/greyt-bit' };
  useRampsStore.getState().setLospecSource(provenance);
  expect(useRampsStore.getState().lospecSource).toEqual(provenance);
  const snap = useRampsStore.getState().buildSnapshot();
  expect(snap.lospecSource).toEqual(provenance);
  useRampsStore.getState().applySnapshotFields({ ...snap, lospecSource: null });
  expect(useRampsStore.getState().lospecSource).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rampsStore -t lospecSource`
Expected: FAIL, `lospecSource` is `undefined`, `setLospecSource` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/store/rampsStore.ts`:

```ts
// after: harmonyAnchor: number; (interface, ~line 18)
lospecSource: LospecSource;
```

Add near the top of the file (after the `Updater<T>` helper, ~line 11):

```ts
export interface LospecSource {
  slug: string;
  title: string;
  author: string;
  url: string;
}
```

In the setters block of the interface (~line 61, after `setHarmonyAnchor`):

```ts
setLospecSource: (v: Updater<LospecSource>) => void;
```

In the initial state (~line 98, after `harmonyAnchor: 0,`):

```ts
lospecSource: null,
```

In the setters implementation (~line 128, after `setHarmonyAnchor`):

```ts
setLospecSource: (v) => set((s) => ({ lospecSource: resolveUpdater(v, s.lospecSource) })),
```

In `buildSnapshot` (~line 161, after `harmonyAnchor: s.harmonyAnchor,`):

```ts
lospecSource: s.lospecSource,
```

In `applySnapshotFields` (~line 187, after `harmonyAnchor: snap.harmonyAnchor,`):

```ts
lospecSource: snap.lospecSource ?? null,
```

Do NOT touch `reorderRamps`/`permuteRampState`, `lospecSource` is a whole-palette scalar, not base-indexed, so reordering ramps must not touch it (matches `paletteDefaultStyle`'s treatment, not `harmonyAnchor`'s).

In `src/hooks/usePaletteState.ts`, add to the returned object (after `harmonyAnchor: store.harmonyAnchor, setHarmonyAnchor: store.setHarmonyAnchor,`):

```ts
lospecSource: store.lospecSource, setLospecSource: store.setLospecSource,
```

Export the type for downstream consumers, add near the top of `usePaletteState.ts`:

```ts
export type { LospecSource } from '../store/rampsStore';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rampsStore`
Expected: PASS (all existing + new test).

- [ ] **Step 5: Commit**

```bash
git add src/store/rampsStore.ts src/hooks/usePaletteState.ts tests/unit/rampsStore.spec.ts
git commit -m "feat: add lospecSource provenance field to ramps store (issue #133)"
```

---

### Task 2: Clear `lospecSource` in `resetPaletteState`

**Files:**
- Modify: `src/hooks/usePaletteReset.ts`
- Test: `tests/unit/usePaletteReset.spec.tsx`

**Interfaces:**
- Consumes: `store.lospecSource`/`store.setLospecSource` from Task 1.
- Produces: `resetPaletteState()` now also clears `lospecSource` to `null`, same as every other per-palette field it owns.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/usePaletteReset.spec.tsx` (find the existing test that asserts `resetPaletteState` clears the customization layers, extend its setup/assertions):

```ts
it('resetPaletteState clears lospecSource', () => {
  useRampsStore.getState().setLospecSource({ slug: 'x', title: 'X', author: 'A', url: 'https://lospec.com/palette-list/x' });
  const { result } = renderHook(() => usePaletteReset(baseParams));
  act(() => { result.current.resetPaletteState(); });
  expect(useRampsStore.getState().lospecSource).toBeNull();
});
```

(Match whatever `baseParams`/setup helper the existing spec file already defines for `usePaletteReset`'s params, reuse it, don't redefine.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- usePaletteReset -t "clears lospecSource"`
Expected: FAIL, `lospecSource` is still the set value after reset.

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/usePaletteReset.ts`, add `lospecSource` is not read (only the setter is needed), destructure `setLospecSource` from the `usePaletteState()` call (~line 51, add to the destructure alongside `setRampStyleOverrides, setRampStyleScalars,`):

```ts
setRampStyleOverrides, setRampStyleScalars, setLospecSource,
```

In the `resetPaletteState` body (~line 91-92, right after `setRampStyleOverrides({}); setRampStyleScalars({});`):

```ts
setLospecSource(null);
```

Update the doc comment above `resetPaletteState` (~line 56-68) to add `lospecSource` to the list of cleared per-palette state, and note it is intentionally NOT base-indexed (contrast with the #69 style maps).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- usePaletteReset`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePaletteReset.ts tests/unit/usePaletteReset.spec.tsx
git commit -m "fix: resetPaletteState clears lospecSource on every full-palette-replace path (issue #133)"
```

---

### Task 3: `src/lib/lospec.ts`, types, key accessor, slug/URL parsing, single-palette load

**Files:**
- Create: `src/lib/lospec.ts`
- Test: `tests/unit/lospec.spec.ts`

**Interfaces:**
- Produces:
  - `interface LospecPalette { slug: string; title: string; colors: string[]; numberOfColors: number; author: string; url: string }`
  - `getLospecApiKey(): string | null`
  - `parseLospecSlug(input: string): string | null`
  - `fetchLospecPalette(slug: string, signal?: AbortSignal): Promise<LospecPalette>`
  - `class LospecNoKeyError extends Error {}`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lospec.spec.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lospec.spec`
Expected: FAIL, cannot resolve `../../src/lib/lospec`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/lospec.ts`:

```ts
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
// tests can stub it; vitest doesn't load .env, so tests default keyless.
export function getLospecApiKey(): string | null {
  const key = (import.meta as any).env?.VITE_LOSPEC_API_KEY;
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
```

(`throttledFetch` is a forward reference to Task 4, add a temporary local stub `async function throttledFetch(url: string, init: RequestInit = {}) { return fetch(url, init); }` for this task, then Task 4 replaces it with the throttled/cached version. Note this in the commit message.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lospec.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lospec.ts tests/unit/lospec.spec.ts
git commit -m "feat: add Lospec client, slug parsing + single-palette load (issue #133)"
```

---

### Task 4: Throttle gate + TTL cache in `lospec.ts`

**Files:**
- Modify: `src/lib/lospec.ts`
- Test: `tests/unit/lospec.spec.ts`

**Interfaces:**
- Produces: `throttledFetch(url, init?): Promise<Response>` (replaces Task 3's stub), `getLospecRateLimitRemaining(): number | null`, `__resetLospecThrottleForTests(): void` (test-only export), cache helpers used internally by Task 5 (`cacheGet`/`cacheSet`, not exported, Task 5 lives in the same file so no export needed).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/lospec.spec.ts`:

```ts
import { throttledFetch, getLospecRateLimitRemaining, __resetLospecThrottleForTests } from '../../src/lib/lospec';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lospec.spec -t throttledFetch`
Expected: FAIL, `throttledFetch` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/lospec.ts`, remove the Task-3 stub and add (near the top, after the URL helpers):

```ts
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
```

Now add the cache (below `throttledFetch`):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lospec.spec`
Expected: PASS (all `lospec.spec.ts` tests, including Task 3's).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lospec.ts tests/unit/lospec.spec.ts
git commit -m "feat: add throttle gate + TTL cache to Lospec client (issue #133)"
```

---

### Task 5: Browse + suggest endpoints

**Files:**
- Modify: `src/lib/lospec.ts`
- Test: `tests/unit/lospec.spec.ts`

**Interfaces:**
- Consumes: `throttledFetch`, `cacheGet`/`cacheSet`, `getLospecApiKey`, `mapExpandedPalette` (Tasks 3-4).
- Produces: `interface LospecBrowseParams { tag?: string; minColors?: number; maxColors?: number; numberOfColors?: number; sort?: string; limit?: number; offset?: number }`, `interface LospecBrowseResult { palettes: LospecPalette[]; total: number; limit: number; offset: number }`, `browseLospecPalettes(params, signal?): Promise<LospecBrowseResult>` (throws `LospecNoKeyError` if no key), `suggestLospecPalettes(query, signal?): Promise<LospecPalette[]>`, `debounce<A extends unknown[]>(fn, ms): (...args: A) => void`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/lospec.spec.ts`:

```ts
import { browseLospecPalettes, suggestLospecPalettes, debounce, LospecNoKeyError } from '../../src/lib/lospec';

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
```

Add the shared `makeMockStorage()` helper at the top of `tests/unit/lospec.spec.ts` (same shape as the one in `tests/unit/useSavedStylesActions.spec.ts`, copy it, these are separate test files):

```ts
function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
    set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
    delete: async (key: string) => { store.delete(key); return { ok: true }; },
    list: async (prefix: string) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)) }),
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lospec.spec -t "browseLospecPalettes|suggestLospecPalettes|debounce"`
Expected: FAIL, none of these exports exist yet.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/lospec.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lospec.spec`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lospec.ts tests/unit/lospec.spec.ts
git commit -m "feat: add Lospec browse/suggest endpoints + debounce helper (issue #133)"
```

---

### Task 6: `applyImportedBases` core + `loadLospecPalette` + provenance persistence

**Files:**
- Modify: `src/hooks/useSavedPalettesActions.ts`
- Test: `tests/unit/useSavedPalettesActions.spec.ts` (new)

**Interfaces:**
- Consumes: `LospecPalette` (Task 3/5), `LospecSource` (Task 1, re-exported via `usePaletteState`), `subsetGplColors` (existing import).
- Produces: `loadLospecPalette(palette: LospecPalette, mode: 'all' | 'subset'): void` added to the hook's return object; `SavedPaletteEntry` gains `lospecSource: LospecSource | null`; the save payload and `loadPalette`/`refreshSavedPalettes` round-trip it.

This task first characterizes the CURRENT behavior of `loadClassicPalette` and `applyGplImport` (neither has test coverage today), then refactors them to share `applyImportedBases`, confirming the characterization tests still pass unchanged, then adds the new Lospec path and provenance persistence.

- [ ] **Step 1: Write characterization tests for existing behavior (must pass before any refactor)**

Create `tests/unit/useSavedPalettesActions.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedPalettesActions } from '../../src/hooks/useSavedPalettesActions';
import { useRampsStore } from '../../src/store/rampsStore';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
    set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
    delete: async (key: string) => { store.delete(key); return { ok: true }; },
    list: async (prefix: string) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)) }),
  };
}

function setup() {
  const state: any = {
    savedPalettes: [], saveName: '', savedError: '', savedBusy: false,
    confirmDeleteSlug: null, renamingSlug: null, renameDraft: '', renameError: '',
    spriteKey: 'nes', customSprites: {}, gamutPerRamp: {}, advancedOpen: {},
  };
  const params = {
    savedPalettes: state.savedPalettes,
    setSavedPalettes: (v: any[]) => { state.savedPalettes = v; },
    saveName: state.saveName,
    setSaveName: (v: string) => { state.saveName = v; },
    setSavedError: (v: string) => { state.savedError = v; },
    setSavedBusy: (v: boolean) => { state.savedBusy = v; },
    confirmDeleteSlug: state.confirmDeleteSlug,
    setConfirmDeleteSlug: (v: string | null) => { state.confirmDeleteSlug = v; },
    setRenamingSlug: (v: string | null) => { state.renamingSlug = v; },
    renameDraft: state.renameDraft,
    setRenameDraft: (v: string) => { state.renameDraft = v; },
    setRenameError: (v: string) => { state.renameError = v; },
    spriteKey: state.spriteKey,
    setSpriteKey: (v: string) => { state.spriteKey = v; },
    customSprites: state.customSprites,
    setCustomSprites: (fn: any) => { state.customSprites = fn(state.customSprites); },
    gamutPerRamp: state.gamutPerRamp,
    setGamutPerRamp: (v: any) => { state.gamutPerRamp = v; },
    advancedOpen: state.advancedOpen,
    setAdvancedOpen: (v: any) => { state.advancedOpen = v; },
    setV2NoticePending: vi.fn(),
    setExportFeedback: vi.fn(),
    tagNextLabel: vi.fn(),
    resetPaletteState: vi.fn(),
  };
  const hook = renderHook(() => useSavedPalettesActions(params));
  return { hook, params, state };
}

describe('useSavedPalettesActions', () => {
  beforeEach(() => {
    (window as any).storage = makeMockStorage();
    useRampsStore.setState({ baseColors: ['#ff00ff'], aiColorNames: [], hardwareLock: null, shuffleSeed: 5, lospecSource: null } as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it('loadClassicPalette sets baseColors/names, resets, clears hardwareLock and shuffleSeed', () => {
    useRampsStore.setState({ hardwareLock: 'nes', shuffleSeed: 5 } as any);
    const { hook, params } = setup();
    act(() => { hook.result.current.loadClassicPalette({ name: 'NES', baseColors: ['#111111', '#222222'], names: ['A', 'B'] }); });
    expect(useRampsStore.getState().baseColors).toEqual(['#111111', '#222222']);
    expect(useRampsStore.getState().aiColorNames).toEqual(['A', 'B']);
    expect(useRampsStore.getState().hardwareLock).toBeNull();
    expect(useRampsStore.getState().shuffleSeed).toBe(0);
    expect(params.resetPaletteState).toHaveBeenCalled();
    expect(params.setExportFeedback).toHaveBeenCalledWith('Loaded "NES"');
  });

  it('loadClassicPalette leaves lospecSource untouched by itself (resetPaletteState owns clearing it)', () => {
    // resetPaletteState is mocked here, so this test documents the contract:
    // loadClassicPalette does not directly touch lospecSource.
    useRampsStore.setState({ lospecSource: { slug: 'x', title: 'X', author: 'A', url: 'u' } } as any);
    const { hook } = setup();
    act(() => { hook.result.current.loadClassicPalette({ name: 'NES', baseColors: ['#111111'] }); });
    expect(useRampsStore.getState().lospecSource).toEqual({ slug: 'x', title: 'X', author: 'A', url: 'u' });
  });

  it('applyGplImport "all" mode dedupes and caps at 16', () => {
    const { hook, params } = setup();
    act(() => { hook.result.current.setGplImport({ name: 'Test', colors: Array.from({ length: 20 }, (_, i) => `#${(i % 5).toString(16).repeat(6)}`), error: null }); });
    act(() => { hook.result.current.applyGplImport('all'); });
    expect(useRampsStore.getState().baseColors.length).toBeLessThanOrEqual(16);
    expect(params.resetPaletteState).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useSavedPalettesActions.spec`
Expected: PASS, these characterize EXISTING behavior, so they should already pass against the current (pre-refactor) implementation. If any fails, the test is wrong about current behavior; fix the test, not the code, before proceeding (this is the safety net, not new functionality yet).

- [ ] **Step 3: Refactor, extract `applyImportedBases`, add `loadLospecPalette`, thread provenance**

In `src/hooks/useSavedPalettesActions.ts`:

Add the import (near the top, with the other `lib` imports):

```ts
import type { LospecPalette } from '../lib/lospec';
```

Destructure `lospecSource, setLospecSource` from `usePaletteState()` (in the existing destructure block, alongside `rampStyleOverrides, setRampStyleOverrides, rampStyleScalars, setRampStyleScalars,`).

Extend `SavedPaletteEntry`:

```ts
export interface SavedPaletteEntry {
  slug: string;
  name: string;
  savedAt: number;
  baseColors: string[];
  lospecSource: import('../store/rampsStore').LospecSource;
}
```

Add the shared core (place just above `loadClassicPalette`):

```ts
// Shared core of every "replace the working palette with an imported set of
// bases" path (classic / gpl / lospec). Callers compute their own colors,
// display names, and history label; this handles the mechanical state-reset
// sequence exactly once. provenance defaults to null so only the Lospec path
// ever sets it (correct-by-construction, resetPaletteState also clears it,
// this just re-asserts the caller's actual intent immediately after).
const applyImportedBases = (colors: string[], names: string[], label: string, provenance: typeof lospecSource = null) => {
  p.tagNextLabel(label);
  setBaseColors(colors);
  setAiColorNames(names);
  p.resetPaletteState();
  setHardwareLock(null);
  setShuffleSeed(0);
  setLospecSource(provenance);
};
```

Replace the body of `loadClassicPalette` (keep the guard clause and the feedback lines, drop the now-duplicated mechanics):

```ts
const loadClassicPalette = (classic: ClassicPaletteLike) => {
  if (!classic || !Array.isArray(classic.baseColors) || classic.baseColors.length === 0) return;
  applyImportedBases(
    classic.baseColors,
    classic.names || classic.baseColors.map((_, i) => `${classic.name} ${i + 1}`),
    `Load classic: ${classic.name}`,
  );
  p.setExportFeedback(`Loaded "${classic.name}"`);
  setTimeout(() => p.setExportFeedback(''), 2000);
};
```

Replace the body of `applyGplImport` the same way (keep the `chosen` computation exactly as-is):

```ts
const applyGplImport = (mode: 'all' | 'subset') => {
  if (!gplImport || gplImport.error || gplImport.colors.length === 0) return;
  let chosen: string[];
  if (mode === 'subset') {
    chosen = subsetGplColors(gplImport.colors);
  } else {
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const hex of gplImport.colors) {
      const n = hex.toLowerCase();
      if (!seen.has(n)) { seen.add(n); uniq.push(n); }
      if (uniq.length >= 16) break;
    }
    chosen = uniq;
  }
  if (chosen.length === 0) return;
  applyImportedBases(chosen, chosen.map((_, i) => `${gplImport.name} ${i + 1}`), `Import GPL: ${gplImport.name}`);
  setGplImport(null);
  const note = mode === 'subset' ? `Imported ${chosen.length} representatives from ${gplImport.colors.length}` : `Imported ${chosen.length}${gplImport.colors.length > chosen.length ? ` (truncated from ${gplImport.colors.length}, cap is 16)` : ''}`;
  p.setExportFeedback(note);
  setTimeout(() => p.setExportFeedback(''), 3500);
};
```

Add `loadLospecPalette` (place just after `applyGplImport`):

```ts
// Load a palette fetched from Lospec (issue #133). Mirrors applyGplImport's
// two modes exactly (same dedupe/cap-16 'all' branch, same subsetGplColors
// 'subset' branch) since both are "flat imported color list -> bases".
// Unlike gpl/classic, this path DOES carry provenance forward.
export type LospecImportMode = 'all' | 'subset';
const loadLospecPalette = (palette: LospecPalette, mode: LospecImportMode) => {
  if (!palette || !Array.isArray(palette.colors) || palette.colors.length === 0) return;
  let chosen: string[];
  if (mode === 'subset') {
    chosen = subsetGplColors(palette.colors);
  } else {
    const seen = new Set<string>();
    const uniq: string[] = [];
    for (const hex of palette.colors) {
      const n = hex.toLowerCase();
      if (!seen.has(n)) { seen.add(n); uniq.push(n); }
      if (uniq.length >= 16) break;
    }
    chosen = uniq;
  }
  if (chosen.length === 0) return;
  applyImportedBases(
    chosen,
    chosen.map((_, i) => `${palette.title} ${i + 1}`),
    `Load Lospec: ${palette.title}`,
    { slug: palette.slug, title: palette.title, author: palette.author, url: palette.url },
  );
  const note = mode === 'subset' ? `Imported ${chosen.length} representatives from ${palette.colors.length}` : `Imported ${chosen.length}${palette.colors.length > chosen.length ? ` (truncated from ${palette.colors.length}, cap is 16)` : ''}`;
  p.setExportFeedback(`Loaded "${palette.title}" from Lospec, ${note}`);
  setTimeout(() => p.setExportFeedback(''), 3500);
};
```

In `saveCurrentPalette`'s `payload` object, add (after `engineVersion: 2,`):

```ts
lospecSource, // provenance if the current palette originated from a Lospec load; null otherwise
```

In `loadPalette`, add restoration (after the `overrides` restore block, before `setPinEditor(null);`, order doesn't matter relative to other restores, but keep it grouped with the other per-palette-field restores):

```ts
// Restore Lospec provenance (issue #133). Validate full shape; anything
// malformed or absent (including every pre-#133 payload) clears it, same
// as resetPaletteState would.
if (parsed.lospecSource && typeof parsed.lospecSource === 'object'
  && typeof parsed.lospecSource.slug === 'string'
  && typeof parsed.lospecSource.title === 'string'
  && typeof parsed.lospecSource.author === 'string'
  && typeof parsed.lospecSource.url === 'string') {
  setLospecSource(parsed.lospecSource);
} else {
  setLospecSource(null);
}
```

In `refreshSavedPalettes`, add to the pushed entry (after `baseColors: parsed.baseColors,`):

```ts
lospecSource: (parsed.lospecSource && typeof parsed.lospecSource === 'object') ? parsed.lospecSource : null,
```

Add `loadLospecPalette` to the hook's return object (near `loadClassicPalette` in the returned destructure at the bottom of the file).

- [ ] **Step 4: Run characterization tests, then add + run new-feature tests**

Run: `npm test -- useSavedPalettesActions.spec`
Expected: PASS, same characterization tests from Step 1 still pass unchanged (proves the refactor preserved behavior).

Add new tests to the same file:

```ts
  it('loadLospecPalette sets baseColors and lospecSource provenance', () => {
    const { hook } = setup();
    const palette = { slug: 'greyt-bit', title: 'Greyt-bit', colors: ['#574368', '#ffffff'], numberOfColors: 2, author: 'Sam Keddy', url: 'https://lospec.com/palette-list/greyt-bit' };
    act(() => { hook.result.current.loadLospecPalette(palette, 'all'); });
    expect(useRampsStore.getState().baseColors).toEqual(['#574368', '#ffffff']);
    expect(useRampsStore.getState().lospecSource).toEqual({ slug: 'greyt-bit', title: 'Greyt-bit', author: 'Sam Keddy', url: 'https://lospec.com/palette-list/greyt-bit' });
  });

  it('save -> refresh -> load round-trips lospecSource provenance', async () => {
    const { hook, params } = setup();
    const palette = { slug: 'a', title: 'A', colors: ['#111111'], numberOfColors: 1, author: 'Auth', url: 'https://lospec.com/palette-list/a' };
    act(() => { hook.result.current.loadLospecPalette(palette, 'all'); });
    params.saveName = 'My Lospec Save';
    (hook.rerender as any)();
    await act(async () => { await hook.result.current.saveCurrentPalette(); });
    const listed = params.savedPalettes as any[];
    expect(listed[0]?.lospecSource ?? null).not.toBeNull();
    useRampsStore.setState({ lospecSource: null } as any);
    await act(async () => { await hook.result.current.loadPalette(listed[0].slug); });
    expect(useRampsStore.getState().lospecSource).toEqual(palette && { slug: 'a', title: 'A', author: 'Auth', url: 'https://lospec.com/palette-list/a' });
  });

  it('loading a legacy payload (no lospecSource field) clears it to null', async () => {
    const { hook } = setup();
    await (window as any).storage.set('palettes:legacy', JSON.stringify({ name: 'Legacy', baseColors: ['#123456'], savedAt: 1 }));
    useRampsStore.setState({ lospecSource: { slug: 'x', title: 'X', author: 'A', url: 'u' } } as any);
    await act(async () => { await hook.result.current.loadPalette('legacy'); });
    expect(useRampsStore.getState().lospecSource).toBeNull();
  });
```

Run: `npm test -- useSavedPalettesActions.spec`
Expected: PASS (full file).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSavedPalettesActions.ts tests/unit/useSavedPalettesActions.spec.ts
git commit -m "feat: add loadLospecPalette via a shared import core; persist provenance (issue #133)"
```

---

### Task 7: `lospecOpen` panel state

**Files:**
- Modify: `src/lib/panel-state.ts`
- Test: `tests/unit/panel-state.spec.ts`

**Interfaces:**
- Produces: `PanelState.lospecOpen: boolean`, default `false`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/panel-state.spec.ts` (find the existing "defaults" test and extend its expected object; add a dedicated case too):

```ts
it('defaults lospecOpen to false', () => {
  localStorage.removeItem(PANEL_STORAGE_KEY);
  expect(loadPanelState().lospecOpen).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- panel-state.spec -t lospecOpen`
Expected: FAIL, `lospecOpen` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/panel-state.ts`:

```ts
export interface PanelState {
  harmonyOpen: boolean;
  tipsOpen: boolean;
  hwPickerOpen: boolean;
  exportOpen: boolean;
  historyOpen: boolean;
  savedOpen: boolean;
  sbsOpen: boolean;
  pgOpen: boolean;
  rampsOpen: boolean;
  lospecOpen: boolean;
}

export const PANEL_DEFAULTS: PanelState = {
  harmonyOpen: true, tipsOpen: false, hwPickerOpen: false, exportOpen: false,
  historyOpen: false, savedOpen: false, sbsOpen: false, pgOpen: false, rampsOpen: true,
  lospecOpen: false,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- panel-state.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/panel-state.ts tests/unit/panel-state.spec.ts
git commit -m "feat: add lospecOpen panel state key (issue #133)"
```

---

### Task 8: `useLospecBrowser` hook

**Files:**
- Create: `src/hooks/useLospecBrowser.ts`
- Test: `tests/unit/useLospecBrowser.spec.ts`

**Interfaces:**
- Consumes: `browseLospecPalettes`, `suggestLospecPalettes`, `fetchLospecPalette`, `parseLospecSlug`, `getLospecApiKey`, `LospecNoKeyError`, `debounce`, `LospecPalette`, `LospecBrowseParams` (Tasks 3-5).
- Produces:

```ts
export interface UseLospecBrowserResult {
  hasApiKey: boolean;
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
export function useLospecBrowser(): UseLospecBrowserResult;
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/useLospecBrowser.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLospecBrowser } from '../../src/hooks/useLospecBrowser';
import { __resetLospecThrottleForTests } from '../../src/lib/lospec';

describe('useLospecBrowser', () => {
  beforeEach(() => { __resetLospecThrottleForTests(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useLospecBrowser.spec`
Expected: FAIL, module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useLospecBrowser.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import {
  browseLospecPalettes, suggestLospecPalettes, fetchLospecPalette,
  parseLospecSlug, getLospecApiKey, debounce, LospecNoKeyError,
} from '../lib/lospec';
import type { LospecPalette, LospecBrowseParams } from '../lib/lospec';

export function useLospecBrowser() {
  const hasApiKey = getLospecApiKey() !== null;
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
    if (!slug) return null;
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
    hasApiKey, query, setQuery, tag, setTag, minColors, setMinColors,
    maxColors, setMaxColors, sort, setSort, page, results, suggestions, total,
    loading, error, rateLimitLow, runBrowse, nextPage, prevPage, runSuggest,
    loadBySlugOrUrl, cancelPending,
  };
}
```

(`rateLimitLow` wiring to `getLospecRateLimitRemaining()` is intentionally left as a simple post-fetch check, add `if (getLospecRateLimitRemaining() !== null && getLospecRateLimitRemaining()! < 10) setRateLimitLow(true);` inside `browsePage`'s try block, after a successful fetch, importing `getLospecRateLimitRemaining` alongside the other Task 3-5 exports.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useLospecBrowser.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLospecBrowser.ts tests/unit/useLospecBrowser.spec.ts
git commit -m "feat: add useLospecBrowser hook (issue #133)"
```

---

### Task 9: `LospecBrowserPanel` component, structure now, visual mockup before final styling

**This task has a hard prerequisite the plan cannot resolve on paper:** the design spec settled the API/cache/data model but explicitly left the panel's visual layout open. Per standing project convention, visual/layout decisions go through a mockup with the user (Visual Companion) before final JSX is written, do not silently invent a card grid, list, or filter-bar layout. **Before writing this task's JSX:** produce a browser-based mockup of the panel (search bar, tag/color-count/sort filters, result cards showing swatch strip + name + author + license link, pagination, a keyless-degraded banner when `hasApiKey` is false, and the "Palette data from Lospec" footer note), get the user's sign-off on the layout, THEN implement to match. The steps below cover props/structure/behavior, which do not depend on the visual outcome, write and pass these regardless of which layout the mockup lands on.

**Files:**
- Create: `src/components/panels/LospecBrowserPanel.tsx`
- Test: `tests/unit/LospecBrowserPanel.spec.tsx`

**Interfaces:**
- Consumes: `UseLospecBrowserResult` shape (Task 8) minus `cancelPending` (App.tsx owns calling that on unmount/close, see Task 10), plus `onLoad: (palette: LospecPalette, mode: 'all' | 'subset') => void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/LospecBrowserPanel.spec.tsx` (follow the `SavedPalettesPanel.spec.tsx` convention: full `base` props object, `wrap()` helper, `ThemeProvider`):

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { LospecBrowserPanel } from '../../src/components/panels/LospecBrowserPanel';
import { ThemeProvider } from '../../src/contexts';

const theme = { /* same minimal shape as SavedPalettesPanel.spec.tsx's `theme` const */ };

const base = {
  hasApiKey: true,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LospecBrowserPanel.spec`
Expected: FAIL, module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/panels/LospecBrowserPanel.tsx` with a props interface matching `base` above 1:1, and JSX that satisfies the four tests (structure only, the earlier mockup step governs exact visual styling, which is not what the tests check). At minimum: a search input wired to `runSuggest`/`query`, tag/min/max/sort controls wired to their setters + a "Browse" button calling `runBrowse`, a conditional banner when `!hasApiKey`, a conditional error block, a result list mapping `results` to cards (swatch strip from `colors`, `title`, `author`, a link to `url`, "Use all as bases" and "Auto-pick representatives" buttons calling `onLoad(palette, 'all' | 'subset')`), pagination buttons calling `prevPage`/`nextPage` (disabled appropriately from `page`/`total`), and a footer note containing the literal text "Palette data from Lospec".

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LospecBrowserPanel.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/LospecBrowserPanel.tsx tests/unit/LospecBrowserPanel.spec.tsx
git commit -m "feat: add LospecBrowserPanel component (issue #133)"
```

---

### Task 10: Wire into `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Test: `npm test` (full suite, confirm `app-mount-smoke.spec.tsx` still passes; it has no section-count assertions today per inspection, so this should be a clean add)

**Interfaces:**
- Consumes: `useLospecBrowser()` (Task 8), `LospecBrowserPanel` (Task 9), `loadLospecPalette` from `useSavedPalettesActions` (Task 6), `lospecOpen`/`setLospecOpen` from `usePanelLayout` (Task 7's key flows through the same panel-layout hook that already reads `PANEL_DEFAULTS`/`loadPanelState`).

- [ ] **Step 1:** Confirm `usePanelLayout.ts` destructures `PanelState` keys generically (spread from `PANEL_DEFAULTS`/`loadPanelState`) rather than naming each key by hand; if it names them by hand, add `lospecOpen`/`setLospecOpen` there following the exact pattern used for `savedOpen`/`setSavedOpen`.

- [ ] **Step 2:** In `App.tsx`, instantiate the hook near the other panel-scoped hooks (alongside `useSavedPalettesActions`):

```ts
const lospecBrowser = useLospecBrowser();
```

- [ ] **Step 3:** Add a `useEffect` that calls `lospecBrowser.cancelPending()` on unmount, so an in-flight request doesn't outlive the component (the "AbortController must fire on panel-close/unmount, not only supersession" constraint):

```ts
useEffect(() => () => { lospecBrowser.cancelPending(); }, [lospecBrowser]);
```

- [ ] **Step 4:** Add the `SectionCard` entry immediately after the existing Saved Palettes `SectionCard` (~line 1064 in the current file, verify with `grep -n "SavedPalettesPanel" src/App.tsx` since Tier C extractions may have shifted lines since this plan was written):

```tsx
{/* ---------- Lospec Browser (collapsible, issue #133) ---------- */}
<SectionCard
  sectionKey="lospec" accent="#ff6b35" bg={t.cardBgYellow} glow={0.25}
  open={lospecOpen} onToggle={() => setLospecOpen(o => !o)}
  headerTitle={lospecOpen ? 'Collapse the Lospec Browser section' : 'Expand the Lospec Browser section'}
  chevronColor="#a5f3fc"
  icon={<Search size={22} />} title="Lospec Browser"
>
  <LospecBrowserPanel
    {...lospecBrowser}
    onLoad={(palette, mode) => loadLospecPalette(palette, mode)}
  />
</SectionCard>
```

(Confirm `Search` is already imported from `lucide-react` in `App.tsx`'s icon import line, or pick an unused icon already imported there, do not add a new lucide import if an equivalent already exists in the file's icon list.)

- [ ] **Step 5:** Wire `sectionOrder`/`DEFAULT_SECTION_ORDER` (the drag-reorder list) to include the new `"lospec"` `sectionKey`, find where `DEFAULT_SECTION_ORDER` is defined (likely `src/lib/panel-state.ts` or `usePanelLayout.ts`) and append `'lospec'`.

- [ ] **Step 6:** Run the full suite:

Run: `npm test`
Expected: PASS, including `app-mount-smoke.spec.tsx` unchanged.

Run: `npm run build`
Expected: PASS (`tsc --noEmit` + vite build), this is the real type-check gate for everything touched in Tasks 1-10 outside `App.tsx` (which is `@ts-nocheck`; grep is `App.tsx`'s gate, not `tsc`). Grep for the new symbols to confirm no dangling refs: `grep -n "lospecBrowser\|LospecBrowserPanel\|loadLospecPalette\|lospecOpen" src/App.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/hooks/usePanelLayout.ts src/lib/panel-state.ts
git commit -m "feat: wire the Lospec Browser panel into App.tsx (issue #133)"
```

---

### Task 11: Verify the API key actually reaches the built client bundle

This is a verification task, not a code-authoring one, do not assume Vite's `VITE_`-prefix client-env forwarding "just works" in this repo's specific `vite.config.ts` (which defines `import.meta.env.VITE_WEB` manually via `define`, a different mechanism from the built-in `.env` loading). Confirm it directly.

- [ ] **Step 1:** With the local `.env` file's `VITE_LOSPEC_API_KEY` value already present (it is, per repo state), run:

```powershell
npm run build:web
```

- [ ] **Step 2:** Grep the built output for evidence the key was inlined (do NOT print the key value itself in any commit, log, or transcript, grep for a short non-secret marker instead, e.g. confirm the `VITE_LOSPEC_API_KEY` identifier is gone from source and a literal string is present in `dist/assets/*.js`):

```powershell
Select-String -Path dist/assets/*.js -Pattern "VITE_LOSPEC_API_KEY" -Quiet
```

Expected: `False` (the identifier itself should not appear, Vite replaces it with the literal value at build time, it does not ship the env-var name).

- [ ] **Step 3:** Confirm the literal key value IS present (this step touches the secret value locally only, never paste it into a commit message, test file, or this plan document):

```powershell
$key = (Get-Content .env | Select-String "VITE_LOSPEC_API_KEY=(.+)").Matches.Groups[1].Value
Select-String -Path dist/assets/*.js -Pattern ([regex]::Escape($key)) -Quiet
```

Expected: `True`. If `False`, STOP, the env var is not reaching the client bundle, and Task 12's CI wiring would ship a silently keyless build. Investigate `vite.config.ts` before proceeding (likely needs an explicit `envPrefix`/`loadEnv` call, since the config never calls Vite's `loadEnv` helper today).

- [ ] **Step 4:** Clean up the debug build (it is not meant to ship):

```powershell
Remove-Item -Recurse -Force dist
```

- [ ] **Step 5:** No commit for this task (no files change), report the verification result (pass/fail) to the user before proceeding to Task 12.

---

### Task 12: CI/CD, inject the API key at build time

**Files:**
- Modify: `.github/workflows/deploy-web.yml`
- Modify: `.github/workflows/release.yml`

**This task has a manual prerequisite the plan cannot do for you:** a GitHub repo secret named `LOSPEC_API_KEY` must exist (Settings → Secrets and variables → Actions) holding the maintainer's Lospec API key. Adding repo secrets is a permissions/security action outside what an agent should do unprompted, ask the user to add it (or confirm it already exists) before or alongside this task. Until it exists, these workflows simply build keyless (browse degrades, slug-load/search still work), not broken, just not fully functional.

- [ ] **Step 1:** In `.github/workflows/deploy-web.yml`, add `env:` to the "Build web target" step:

```yaml
      - name: Build web target
        env:
          VITE_LOSPEC_API_KEY: ${{ secrets.LOSPEC_API_KEY }}
        run: npm run build:web
```

- [ ] **Step 2:** In `.github/workflows/release.yml`, add the same `env` entry to BOTH `tauri-apps/tauri-action@v0` steps (tag-ref build ~line 121 and branch-dispatch build ~line 138), alongside the existing `GITHUB_TOKEN`/`TAURI_SIGNING_*` entries, `beforeBuildCommand: npm run build` in `src-tauri/tauri.conf.json` runs inside this action's environment, so the var must be set here, not in a separate `npm run build` step (there isn't one; Tauri invokes it internally):

```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          VITE_LOSPEC_API_KEY: ${{ secrets.LOSPEC_API_KEY }}
```

- [ ] **Step 3:** Deliberately do NOT add this to `ci.yml`'s `npm run build` / `npm run build:web` steps, CI/PR builds (including from forks, which don't have secret access) should exercise the keyless degraded path by default; that's a feature of the test matrix, not a gap.

- [ ] **Step 4:** Commit

```bash
git add .github/workflows/deploy-web.yml .github/workflows/release.yml
git commit -m "ci: inject VITE_LOSPEC_API_KEY into web/desktop release builds (issue #133)"
```

---

### Task 13: Docs

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1:** Add an `## [Unreleased]` entry to `CHANGELOG.md` under `### Added`:

```markdown
- In-app Lospec palette browser: search/browse the Lospec catalog by tag, color
  count, and name, then load a result straight into a new set of ramps
  (issue #133). Requires a build-time `VITE_LOSPEC_API_KEY`; without one, the
  browse/filter view is unavailable but loading by slug/URL and searching by
  name still work via Lospec's public endpoints.
```

- [ ] **Step 2:** Add a bullet under README's `## Features` section describing the Lospec browser, and a new `## Environment Variables` section (placed after `## Getting Started`) documenting `VITE_LOSPEC_API_KEY`: what it's for, that it's optional (keyless degrades gracefully), and that it's not a secret in the traditional sense once shipped (identifies the app to Lospec's rate limiter, per the design spec's licensing/key-handling section), but is still supplied via a `.env` file locally and a GitHub Actions secret in CI, never committed.

- [ ] **Step 3:** Update `docs/ARCHITECTURE.md`'s `## Persistence & storage` section (~line 341) to document the `lospec:` cache prefix: TTLs (24h catalog pages, 7d single palette), the 20-page LRU cap, and that it's deliberately excluded from `SAVED_PALETTE_LIMIT` and the Saved Palettes list. Also update the `## Cross-cutting state-maintenance rules` section's rule 1 (~line 225-238) to add `lospecSource` to the list of per-palette state `resetPaletteState` clears, noting (per Task 1/2) that unlike `harmonyAnchor` it is NOT base-indexed and does not participate in rule 3's re-keying.

- [ ] **Step 4:** Commit

```bash
git add CHANGELOG.md README.md docs/ARCHITECTURE.md
git commit -m "docs: document the Lospec browser feature and VITE_LOSPEC_API_KEY (issue #133)"
```

---

## Self-Review Notes

- **Spec coverage:** browse/search (Tasks 5, 8, 9), load-by-slug/URL (Tasks 3, 8, 9), attribution + license link (Task 9's test + mockup requirement), provenance-on-save (Task 6), rate-limit/cache/throttle (Task 4), user-initiated-only (Task 8's `runBrowse`/`runSuggest`/`loadBySlugOrUrl` are all explicit calls, nothing fires on mount, verified by Task 8 Step 1's test), CORS/runtime constraints (no code needed, spec already verified plain `fetch()` works on both runtimes), env var wiring (Tasks 11-12), docs (Task 13). No spec requirement found without a task.
- **No second import pipeline:** verified, `loadLospecPalette` shares `applyImportedBases` with `loadClassicPalette`/`applyGplImport` (Task 6).
- **Placeholder scan:** no TBD/"add validation"/"similar to Task N" phrasing; every step shows real code or an exact command.
- **Type consistency check:** `LospecPalette` (Task 3) is the single shape threaded through Tasks 5, 6, 8, 9 unchanged. `LospecSource` (Task 1) is the single provenance shape threaded through Tasks 1, 2, 6. `loadLospecPalette(palette: LospecPalette, mode: 'all' | 'subset')` signature matches its Task 6 definition, Task 9's test expectation (`onLoad` called with `(paletteObj, 'all')`), and Task 10's App.tsx wiring call.
- **What this plan deliberately defers:** Task 9's final visual styling (needs a user-approved mockup first); adding the `LOSPEC_API_KEY` GitHub secret (user action, flagged in Task 12); any live network verification against real lospec.com/api.lospec.com (sandbox-blocked, flagged in Global Constraints and Task 11).
