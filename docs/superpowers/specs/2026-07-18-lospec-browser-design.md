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

Verified 2026-07-18 and 2026-07-20. Initial pass via public docs and
third-party integrations; live verification ran as spaced probes against
lospec.com and api.lospec.com from a GitHub Actions runner (temporary
`lospec-cors-probe` workflow, runs 1-4, removed after each use), because the
dev sandbox's network policy blocks *.lospec.com.

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

### 2. Official developer API (`api.lospec.com`) - VERIFIED 2026-07-20

Full docs: https://api.lospec.com/docs/ (Scalar UI over the OpenAPI 3.1 spec
at `https://api.lospec.com/docs/openapi.json`; the whole spec was captured by
probe runs 3-4, evidence in those Actions logs). The maintainer holds a free
API key (created 2026-07). Facts below are from the OpenAPI spec verbatim.

**Base URL** `https://api.lospec.com`, versioned paths under `/api/v1/`.
**Auth**: `Authorization: Bearer <API key>` on every request (except where
noted). Errors come as `{ "error": { "code", "message", "details" } }` with
codes `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403 (tier-gated),
`NOT_FOUND` 404, `TOO_MANY_REQUESTS` 429 (then check `X-RateLimit-Reset`).

**Endpoints (all GET):**

| Path | Cost | Notes |
| ---- | ---- | ----- |
| `/api/v1/palettes` | 1 | Paginated browse. Params: `tag` (exact), `numberOfColors`, `minColors`, `maxColors`, `sort` (`createdAt`/`downloads`/`likes`/`numberOfColors`/`publishedAt`, `-` prefix = desc, default `-publishedAt`), `limit` (1-100, default 20), `offset`, `format` (`compact` = title+colors only, `expanded` = adds creator + example image URLs) |
| `/api/v1/palettes/{slug}` | 0.01 | Single palette, same `format` param |
| `/api/v1/palettes/suggest/{query}` | (small) | Name search: title-prefix with edit-distance fallback, max 10 results; `format=expanded` adds colors + `userName`. **Also public WITHOUT auth** at `/palettes/suggest/:query` |
| `/api/v1/palettes/daily` | 0.01 | Most recent "daily"-tagged palette |
| `/api/v1/palettes/random` | 0.01 | Random palette |
| `/api/v1/dailytags` (+`/daily`, `/{slug}`) | 1 / 0.01 | Daily art-prompt tags (not needed by this feature) |
| `/api/v1/user`, `/api/v1/usage` | - | Key verification / usage + per-key breakdown (handy for monitoring the embedded key) |
| `/health` | - | No auth |

**Response shapes** (browse): `{ data: [...], meta: { total, limit, offset } }`.
Each palette: `slug`, `title`, `description` (HTML), `colors[]` (6-digit hex,
no `#`), `numberOfColors`, `tags[]`, `hashtag`, `downloads`, `likes`,
`comments`, `featured`, `url`, `publishedAt`/`createdAt`/`updatedAt`, and with
`format=expanded`: `user { name, url }` (attribution!) and `examples[]`
(cdn.lospec.com image URLs, which we do NOT display, per etiquette).

**Rate limits**: one hourly request budget per user, shared across all routes
and keys; **fractional costs** mean the budget is generous (a single-palette
fetch costs 0.01, so the free 500/hr budget is ~500 browse pages or ~50,000
palette loads). Every response carries `X-RateLimit-Limit` / `-Remaining` /
`-Reset` (CORS-exposed, so the client can throttle itself politely).
Official tiers:

| Tier    | Price  | Requests/hour | Max API keys |
| ------- | ------ | ------------- | ------------ |
| Free    | free   | 500           | 1            |
| Imp     | $1/mo  | 2,500         | 3            |
| Goblin  | $5/mo  | 5,000         | 5            |
| Orc     | $10/mo | 10,000        | 10           |
| Cyclops | $20/mo | 25,000        | 20           |
| Dragon  | $50/mo | 50,000        | 50           |

500 req/hr free is far above this feature's user-paced, cached call pattern.

**CORS: verified fully browser-enabled (probe, 2026-07-20).** Every
`api.lospec.com` response carries `access-control-allow-origin: *` and
exposes the rate-limit headers; the `OPTIONS` preflight returns 204 with
`access-control-allow-methods: GET, OPTIONS` and
`access-control-allow-headers: Content-Type, Authorization, Accept`. Since a
Bearer header makes `fetch()` non-simple, that preflight allowance is exactly
what the web build needs: **the keyed API is callable from GH Pages and the
Tauri webview with plain `fetch()`.** No degradation path required.

**Key handling:** the maintainer's key enters the build as a build-time env
var (e.g. `VITE_LOSPEC_API_KEY`), never committed. It is effectively public
once shipped (desktop binary + static site), which Lospec's model tolerates:
the key identifies the app and gives them a throttling handle; it is not a
secret and never per-user. If a third party replays it and exhausts the
shared budget (429), the client degrades to the keyless endpoints: the
documented `lospec.com/palette-list/{slug}.json` for loads and the public
no-auth `/palettes/suggest/:query` for name search. `/api/v1/usage` lets the
maintainer monitor consumption.

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

1. **Load by slug** → `GET /api/v1/palettes/{slug}` (cost 0.01), with the
   keyless documented `{slug}.json` endpoint as the zero-key fallback. Also
   powers a direct "paste a Lospec URL or slug" input, which works even with
   no key at all.
2. **Browse/search** → **cached-catalog-page model, not live search**:
   - A network request fires only on an explicit user action: opening the
     panel, changing page, or applying a tag/color-count filter. **Never per
     keystroke.**
   - Browse = `GET /api/v1/palettes?format=expanded` (findings §2): the
     planned filters map 1:1 onto its params (`tag`, `minColors`/`maxColors`,
     `numberOfColors`, `sort`, `limit`/`offset`), and `expanded` returns the
     creator for attribution.
   - Free-text search filters **already-cached** results client-side; a
     "find by name" action can additionally hit the cheap
     `suggest/{query}` endpoint (max 10 results, debounced ~300 ms; it even
     has a public no-auth variant).
   - The undocumented `/palette-list/load` frontend endpoint is now obsolete
     for our purposes; do not use it. Keep all endpoint knowledge isolated
     inside one client module (`src/lib/lospec.ts`) so churn is a
     one-file fix.
   - Before shipping, open a courtesy contact with Lospec (feedback board)
     describing the integration and confirming the usage pattern is welcome
     at the free tier. They have a track record of supporting exactly this.

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
- **Identification:** every keyed request carries the app's API key in the
  `Authorization: Bearer` header, which is exactly the identification handle
  Lospec designed for. Use the CORS-exposed `X-RateLimit-Remaining` header to
  self-throttle: if the shared budget runs low, pause browse fetches and tell
  the user, rather than hitting 429s.
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
  - `api.lospec.com` (verified 2026-07-20, findings §2): `ACAO: *` on all
    responses AND the preflight allows the `Authorization` header, so the
    keyed API works with plain `fetch()` from both runtimes. No Tauri HTTP
    plugin, no capability change, no degradation path needed. (If Lospec
    ever changes this, the fallback remains: `@tauri-apps/plugin-http` on
    desktop, link-out + paste-slug on web. **Never route through a
    third-party CORS proxy**: that both hammers an intermediary and ships
    user queries to an unrelated service.)

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

1. **Lospec courtesy contact**: confirm the usage pattern is welcome at the
   free tier; may also open the door to a sanctioned catalog snapshot later.
   Channels: the feedback board ("Suggest a Feature") or the site's Contact
   Us page. Draft in the Appendix.

That is the ONLY remaining research item. All API research is complete; the
feature is ready to spec/build once backlog item E's sequencing allows (or
alongside it). At implementation time: wire the maintainer-held API key in as
a build-time env var (e.g. `VITE_LOSPEC_API_KEY`), never committed.

### Resolved 2026-07-20 (GitHub-runner probe of api.lospec.com, runs 3-4)

- ~~Create the free API key~~: done by the maintainer (2026-07).
- ~~Full endpoint docs~~: OpenAPI 3.1 spec captured in full; inventory,
  params, auth (`Authorization: Bearer`), error envelope, request costs, and
  response shapes recorded in findings §2.
- ~~Keyed-endpoint CORS~~: verified browser-friendly (`ACAO: *` + preflight
  allows `Authorization`); web build fully supported, no degradation path.

### Resolved 2026-07-18 (GitHub-runner probe of lospec.com, runs 1-2)

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
