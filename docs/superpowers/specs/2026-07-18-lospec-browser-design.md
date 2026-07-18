# Lospec Browser (issue #133): Research + Design Spec

**Date:** 2026-07-18
**Status:** Research complete; design proposed. Implementation sequenced **after or
alongside backlog item E** ("Fix My Palette"), per the issue: E owns the shared
import layer this feature feeds into.
**Scope:** In-app browse/search of the Lospec palette catalog with one-click
"Load → re-ramp". This doc answers issue #133's open questions: how to build the
outbound calls without hammering lospec.com, and how to surface community
palettes without misappropriating their content (attribution/licensing).

## Motivation

The current path from "I like a Lospec palette" to "it's in PIXEL.PAL" is: leave
the app, search lospec.com, hand-copy hex codes, come back, paste. Issue #133
closes that gap with a searchable in-app gallery. This is additive to backlog
item E: E plans to *import* a Lospec-format palette (file/paste); #133 adds
*discovery* in front of the same import path. Per `FEATURE-BACKLOG.md` ("do NOT
build B separately"), this spec does not invent a second import pipeline: the
"Load" action terminates in E's import layer.

## Research findings: the Lospec API landscape

Verified 2026-07-18 (via public docs and third-party integrations; lospec.com
itself is Cloudflare-fronted and was not directly reachable from the research
environment, see Open Items).

### 1. Documented palette API (fetch-by-slug only)

Lospec's long-standing documented API (`lospec.com/palettes/api`):

```
GET https://lospec.com/palette-list/{slug}.json
→ { "name": "Greyt-bit", "author": "Sam Keddy", "colors": ["574368", ...] }
404 → { "error": "file not found" }
```

Sibling formats exist at the same path: `.hex` (newline-separated hex),
`.gpl`, `.csv`, `.png`. **There is no documented search or browse endpoint in
this API.** It only resolves a known slug.

### 2. Newer API-key program (`lospec.com/api`)

Lospec now runs a proper API program: free API keys, higher rate limits for
Patreon supporters, covering palettes and daily tags. Recent additions include
palette-**name suggestions** (used by the Lospec-endorsed Aseprite importer for
typo recovery). Exact endpoint inventory and rate-limit numbers require an
account to view.

**Caveat:** PIXEL.PAL ships as a distributed desktop binary plus a static
GitHub Pages build. Any API key we embed is effectively public. A key is still
worth registering (it identifies the app and gives Lospec a throttling handle),
but the design must never treat key-based quota as secret or per-user.

### 3. Browse/search: only via the site's undocumented frontend endpoint

The palette-list browsing on lospec.com is driven by an undocumented frontend
endpoint (`/palette-list/load?...` with page/tag/color-count/sorting params).
Third-party wrappers (e.g. the Aesthetikx Ruby gem) scrape this because no
official equivalent exists. Operational data point: a community scraper
(gagath/lospec-palette-scrapper) found the server slow (~1 s per page) and
throttled itself to **1 request per 10 seconds** after parallel fetching
visibly strained the site. Live-querying this endpoint per keystroke is the
exact anti-pattern to avoid.

### 4. Community precedent: what Lospec welcomes

The Aseprite "Lospec Palette Importer" extension (fetch-by-slug, stores author
name + palette URL in the exported `.gpl`, name-suggestion fallback) earned a
friendly feature article on lospec.com. The welcomed integration shape is:
documented endpoints, single-palette granularity, attribution, link-back.

### 5. Licensing / content etiquette

Raw color values are not copyrightable, but palette names, authorship, tags,
and example imagery are Lospec community content. Requirements for this
feature:

- Every surfaced palette shows **name + author**, and links back to its
  `lospec.com/palette-list/{slug}` page (drives traffic to Lospec rather than
  replacing it).
- Provenance survives a save: a palette loaded from Lospec keeps its author +
  source URL in the saved-palette record.
- **Never** scrape or mirror example artwork images.
- **No bulk catalog mirroring** into a redistributed asset (bundled snapshot in
  the app/repo) without asking Lospec first.
- A "Palette data from Lospec" note in the panel footer.

## Design

### API strategy

Two call classes, different endpoints, different politeness budgets:

1. **Load by slug** → the **documented** `{slug}.json` endpoint. Cheap, stable,
   community-blessed. Also powers a direct "paste a Lospec URL or slug" input,
   which works even if browsing is unavailable (CORS, endpoint churn).
2. **Browse/search** → **cached-catalog-page model, not live search**:
   - A network request fires only on an explicit user action: opening the
     panel, changing page, or applying a tag/color-count filter. **Never per
     keystroke.**
   - Text search filters **already-cached** results client-side.
   - Prefer official API-key endpoints if a browse equivalent exists there
     (Open Item); the undocumented `/palette-list/load` endpoint is the
     fallback, isolated inside one client module (`src/lib/lospec.ts`) so
     endpoint churn is a one-file fix.
   - Before shipping, open a courtesy contact with Lospec (feedback board)
     describing the integration and asking for the sanctioned browse endpoint
     and limits. They have a track record of supporting exactly this.

### Rate-limit + cache design

Copy the proven TTL pattern from `src/lib/tauri-bridge.ts:42-68`
(`fetchLatestRelease`: TTL cache + stale-on-failure fallback, built for
GitHub's 60 req/hr limit):

- **Cache store:** `window.storage` shim (localStorage-backed) under a new
  `lospec:` key prefix, deliberately NOT `palettes:`, so cached results never
  appear in Saved Palettes and never count against `SAVED_PALETTE_LIMIT = 100`.
  Only an explicit user "Save" copies a loaded palette into `palettes:{slug}`.
- **TTLs:** catalog pages ~24 h; per-palette `{slug}.json` ~7 d (palettes are
  effectively immutable once published). Stale cache served on fetch failure.
- **Throttle:** a minimum interval of **≥2 s between any two outbound Lospec
  requests** (module-level gate in `lospec.ts`), single-flight per resource,
  `AbortController` on superseded requests, **no parallel page prefetching**.
  Informed by the 1 req/10 s scraper precedent; we can be somewhat tighter
  because our request pattern is user-paced and page-granular, not a crawl.
- **Identification:** send the API key (if registered). Note: browser `fetch`
  cannot override `User-Agent`; identification via key/header is only fully
  controllable if the Tauri HTTP plugin path is used.
- **Cache size:** cap cached catalog pages (e.g. last ~20 pages, LRU) so the
  `lospec:` prefix cannot grow unbounded in localStorage.

### Runtime constraints

- **User-initiated only** (issue requirement): the panel fetches nothing until
  the user clicks "Browse Lospec". No background refresh, no fetch-on-startup.
  This matches the app's "offline-feeling" posture: today only the updater
  talks to the network, and only on desktop.
- **Desktop (Tauri):** `tauri.conf.json` has `csp: null`, so browser `fetch`
  to lospec.com works with no new capability (same as the GitHub fetch in
  `tauri-bridge.ts`). If we later want header control (`User-Agent`), switch to
  `@tauri-apps/plugin-http` + an `http:default` capability entry.
- **Web build (GH Pages): CORS is unverified** (Open Item; could not be
  tested from the research environment). If lospec.com does not send
  `Access-Control-Allow-Origin`, the web build must degrade gracefully:
  feature-detect via a single test fetch, then show a "browse on lospec.com"
  link-out + the paste-URL/slug import path instead. **Never route through a
  third-party CORS proxy**: that both hammers an intermediary and ships user
  queries to an unrelated service.

### Import path (reuse, don't reinvent)

- Apply shape: `loadClassicPalette` in `src/hooks/useSavedPalettesActions.ts:530`
  already takes `{ name, baseColors, names? }`; a Lospec palette maps onto it
  directly (author/URL added to the record for provenance).
- Big palettes: `subsetGplColors` (`src/lib/palette-import.ts:196`) reduces an
  N-color Lospec palette to ~5 representative bases for re-ramping; offer the
  same "all vs. subset" choice as `applyGplImport`
  (`useSavedPalettesActions.ts:571`).
- When E lands its generic hex-list import layer, the Lospec "Load" action
  should be (or become) a thin adapter over it.

### Future file map (conventions per existing panels/hooks)

- `src/components/panels/LospecBrowserPanel.tsx`: presentational, props-only.
- `src/hooks/useLospecBrowser.ts`: state bag; actions hook alongside if it
  grows (`useSavedPalettes` / `useSavedPalettesActions` split pattern).
- `src/lib/lospec.ts`: the ONLY module that knows Lospec URLs (client,
  throttle gate, TTL cache, response types).
- `src/lib/panel-state.ts`: new `lospecOpen` key + default.
- New small utilities needed (none exist today): a debounce helper (~300 ms,
  for any input that does end up triggering a request) and a `.hex` parser
  (trivial; also wanted by E).

## Out of scope (explicitly)

- Building item E's repair/diagnose operations (separate spec).
- Bundling a catalog snapshot in the repo/app (needs Lospec's blessing first).
- Uploading/submitting palettes to Lospec.
- Offline-first catalog sync.

## Open items (blockers to resolve before implementation)

1. **Official API endpoint inventory + rate-limit numbers**: register an API
   key (free) and read `lospec.com/api` docs from an unblocked network. If an
   official browse/search endpoint exists, the undocumented-endpoint fallback
   may be deletable before it's ever written.
2. **CORS verification** for `{slug}.json` and the browse endpoint from a
   browser origin (decides the web build's degradation path).
3. **Lospec courtesy contact**: outcome may change endpoint choice and
   allowed request rate; may also open the door to a sanctioned catalog
   snapshot later.
