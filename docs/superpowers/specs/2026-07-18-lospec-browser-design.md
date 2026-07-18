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

Verified 2026-07-18. Initial pass via public docs and third-party integrations;
follow-up verification ran live probes against lospec.com from a GitHub Actions
runner (8 spaced requests total, temporary `lospec-cors-probe` workflow, removed
after use), because the dev sandbox's network policy blocks lospec.com.

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

**CORS: verified enabled (probe, 2026-07-18).** `GET {slug}.json` with a
browser `Origin` header returns `access-control-allow-origin: *` plus
`access-control-allow-methods: GET, POST`, for GH Pages and arbitrary origins
alike. A plain GET is a CORS "simple request" (no preflight needed), so
browser `fetch()` works from the web build AND from the Tauri webview.
(Note `content-type` is `application/octet-stream`; `res.json()` still parses
it, just don't gate on the MIME type.)

### 2. Official API-key program (`lospec.com/api`)

Lospec runs a proper API program whose landing page (captured by the probe)
states it covers: **"Browse and search the palette library"**, "Fetch daily
art prompt tags", and "Get your account info and subscription tier". So an
official browse/search endpoint EXISTS behind an API key; the full endpoint
docs are linked from that page ("View API Documentation"; key creation
requires logging in, accounts are OAuth-linked). Official rate limits by tier:

| Tier    | Price  | Requests/hour | Max API keys |
| ------- | ------ | ------------- | ------------ |
| Free    | free   | 500           | 1            |
| Imp     | $1/mo  | 2,500         | 3            |
| Goblin  | $5/mo  | 5,000         | 5            |
| Orc     | $10/mo | 10,000        | 10           |
| Cyclops | $20/mo | 25,000        | 20           |
| Dragon  | $50/mo | 50,000        | 50           |

500 req/hr free is far above this feature's user-paced, cached call pattern.

**Caveat:** PIXEL.PAL ships as a distributed desktop binary plus a static
GitHub Pages build. Any API key we embed is effectively public. A key is still
worth registering (it identifies the app and gives Lospec a throttling handle),
but the design must never treat key-based quota as secret or per-user, and a
runaway third party replaying our key could exhaust the shared 500/hr pool
(degrade to the keyless slug endpoint when the quota is hit).

### 3. The site's undocumented frontend browse endpoint (fallback only)

The palette-list browsing on lospec.com is driven by an undocumented frontend
endpoint (`/palette-list/load?colorNumberFilterType=&colorNumber=&page=&tag=&sortingType=`).
Third-party wrappers (e.g. the Aesthetikx Ruby gem) scrape this. Probe results
(2026-07-18):

- Returns proper `application/json`; each entry carries `title`, `slug`,
  `colors[]`, `tags[]`, `user: {name, slug}`, `description`, `numberOfColors`,
  `likes`/`downloads`, and an `examples[]` array, i.e. everything needed for
  an attributed result card (and example imagery we must NOT surface).
- **NO `access-control-allow-origin` header.** Browser `fetch()` cannot call
  it from the web build or from the Tauri webview (webviews enforce CORS like
  any browser; the app's existing GitHub fetch only works because
  api.github.com sends `ACAO: *`). Reaching it would require the Tauri HTTP
  plugin (Rust-side, desktop only), one more reason it is strictly a fallback.

Operational data point: a community scraper (gagath/lospec-palette-scrapper)
found the server slow (~1 s per page) and throttled itself to **1 request per
10 seconds** after parallel fetching visibly strained the site. Live-querying
this endpoint per keystroke is the exact anti-pattern to avoid.

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
   - Use the **official keyed API's browse/search endpoints** (confirmed to
     exist, see findings §2). The undocumented `/palette-list/load` endpoint
     is a desktop-only last resort (no CORS, would need the Tauri HTTP
     plugin); keep all endpoint knowledge isolated inside one client module
     (`src/lib/lospec.ts`) so churn is a one-file fix.
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
- **CORS reality check (both runtimes):** the Tauri webview enforces CORS
  exactly like a browser; `csp: null` does not exempt `fetch()`. So the CORS
  probe results govern desktop AND web equally:
  - `{slug}.json` sends `ACAO: *` (verified): plain `fetch()` works
    everywhere, no new Tauri capability needed.
  - The keyed API's CORS behavior is not yet verified (Open Item). If it
    turns out browser-hostile, desktop can fall back to
    `@tauri-apps/plugin-http` (Rust-side request, bypasses webview CORS,
    needs an `http:default` capability entry + gives `User-Agent` control),
    and the web build degrades gracefully: feature-detect via a single test
    fetch, then show a "browse on lospec.com" link-out + the paste-URL/slug
    import path (which IS CORS-safe) instead. **Never route through a
    third-party CORS proxy**: that both hammers an intermediary and ships
    user queries to an unrelated service.

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

1. **Create the free API key + read the full endpoint docs** (user action:
   log in / OAuth-link an account at `lospec.com/api`, create the key, open
   "View API Documentation"). Needed: exact browse/search endpoint paths,
   query params, auth header format, and whether keyed endpoints send CORS
   headers (decides the web build's path, see Runtime constraints).
2. **Lospec courtesy contact**: outcome may change endpoint choice and
   allowed request rate; may also open the door to a sanctioned catalog
   snapshot later. Channels: the feedback board ("Suggest a Feature") or the
   site's Contact Us page.

### Resolved 2026-07-18 (GitHub-runner probe)

- ~~CORS verification for `{slug}.json`~~: **enabled** (`ACAO: *`), browser
  `fetch()` works from GH Pages and the Tauri webview. The undocumented
  browse endpoint has **no CORS headers** (desktop-plugin-only fallback).
- ~~Official rate-limit numbers~~: published per-tier table captured (free
  tier: 500 requests/hour, 1 key), see findings §2.
- ~~Does an official browse/search endpoint exist?~~: **yes**, per the API
  program's own landing page; details live in the full docs (item 1).

## Appendix: courtesy-contact draft (for Open Item 2)

To post on Lospec's feedback board or Contact Us page, adjust freely:

> Hi! I build PIXEL.PAL, a free/open-source pixel-art palette generator
> (desktop + web: https://github.com/tito13kfm/pixel-pal-app). I'd like to
> add an in-app "Browse Lospec" gallery so users can search your palette
> catalog and load a palette (with author credit and a link back to its
> lospec.com page) instead of hand-copying hex codes.
>
> Plan: use your API with a registered key, fetch only on explicit user
> actions (never per keystroke), cache results locally (~24 h), keep at
> least 2 s between requests, and always show palette name + author +
> link-back. No bulk mirroring of the catalog and no example artwork.
>
> Two questions: (1) is the API's palette browse/search endpoint the right
> way to do this, and is our usage pattern okay at the free key tier?
> (2) Would you be open to a sanctioned catalog snapshot for offline use in
> the future? Happy to adjust to whatever you prefer. Thanks for running
> Lospec!
