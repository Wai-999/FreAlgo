# Architecture

FreAlgo is a finite, user-controlled news utility. Users choose a country, filters and an ordering
rule. The system never ranks by engagement, never shows ads, and never generates news.

## System overview

```text
                ┌──────────────────────────── Docker Compose / any container host ───────────────┐
 Browser ──────▶│ web (Next.js 16, standalone)          worker (Node 24, bundled)                 │
  - SSR pages   │  ├─ App Router pages (URL = state)     ├─ BullMQ job scheduler (every 3h, UTC)  │
  - 3D globe    │  ├─ /api/v1 route handlers (Zod)       ├─ fetch-source processors               │
    (lazy)      │  ├─ proxy.ts: CSP nonce + headers      ├─ safe fetch (SSRF guard, ETag, limits) │
  - SVG/list    │  └─ Prisma 7 + pg adapter              ├─ parse → validate → normalize → upsert │
    fallback    │                │                       └─ /healthz /metrics (internal port)     │
                │                ▼                                    │                          │
                │        PostgreSQL 17  ◀─────────────────────────────┘                          │
                │   (FTS tsvector + pg_trgm)      Redis 8 (queues, locks, rate limits)            │
                └─────────────────────────────────────────────────────────────────────────────────┘
```

- **web** serves pages and the public read API. It never fetches publisher feeds itself.
- **worker** is the only process that talks to publishers. It is deployed and scaled separately
  from the web app.
- **migrate** is a one-shot job: `prisma migrate deploy` plus the idempotent seed.

## Data flow

```text
Source registry (FeedSource, ACTIVE)
  → scheduler (cron 0 */3 * * * UTC) enqueues fetch:<sourceId>:<window>
  → worker: circuit-breaker check → per-host semaphore → safe fetch
      (http/https only, DNS resolved & private ranges blocked, redirects re-validated,
       timeout, max bytes, ETag/If-Modified-Since)
  → parse RSS 2.0 / RSS 1.0 / Atom (no DTD/entities) → Zod item validation
  → normalize: UTC time + original string + offset, language, sanitize to plain-text excerpt
  → canonicalize URL (strip tracking params) → sha256 hash
  → tag: countries (source country, feed default, text match) & sectors (rules v1), with basis
  → transactional upsert (dedupe by (outletId, externalId) then canonicalUrlHash)
  → IngestionRun audit row, quarantine for rejects, FeedSource freshness fields
  → read API / pages (cursor pagination, deterministic sort) → globe / country sheet / search
```

## Repository layout

| Path                                  | Purpose                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `app/`                                | App Router pages, layouts, error boundaries; `app/api/v1/*` route handlers  |
| `components/globe/`                   | 3D globe (client-only), SVG map, country picker                             |
| `components/news/`                    | Country sheet, filters, story cards, source labels                          |
| `components/ui/`, `components/shell/` | Primitives, icons, header, intro                                            |
| `lib/domain/`                         | Framework-free taxonomy: orientation labels, sectors                        |
| `lib/db/`                             | Prisma singleton and repositories                                           |
| `lib/api/`                            | Zod request contracts, errors, handler wrapper, rate limits                 |
| `lib/search/`                         | Deterministic query construction, cursor codec                              |
| `lib/ingest/`                         | Canonicalization, safe fetch, feed parsing, normalization, tagging, upsert  |
| `lib/preferences/`                    | Local preference schema and the optional sync                               |
| `workers/`                            | Worker entry, scheduler, processors, health server                          |
| `workers/providers/`                  | RSS/Atom and licensed-API adapters                                          |
| `prisma/`                             | Schema, migrations (+ raw SQL), rollbacks, seed, reference and fixture data |
| `tests/`                              | `unit/`, `integration/` (real Postgres/Redis), `e2e/` (Playwright)          |

## Database

See `prisma/schema.prisma`. Key properties:

- **Natural keys and uniqueness.** `Country.iso2/iso3/isoNumeric`, `MediaOutlet.slug`,
  `FeedSource.url`, `Article.canonicalUrlHash`, and `(Article.outletId, externalId)`.
- **CHECK constraints** (raw SQL): label confidence is between 0 and 1, ISO codes are
  upper-case, and the hash is 64 hex characters.
- **Indexes.** Keyset pagination on `(publishedAt DESC, id)`; per-outlet and per-status indexes;
  `(countryId, publishedAt DESC, articleId DESC)` and `(sectorId, …)` on the tag tables
  (ADR-005); GIN on `searchVector`; trigram GIN on `Article.title` and `MediaOutlet.name`.
- **Auditability.** Every country or sector tag stores its `basis` (and the matched term or rule
  id). `OutletLabelHistory` is append-only. `IngestionRun`, `IngestionQuarantine` and
  `AdminAuditLog` are kept for `RETENTION_DAYS` (90 by default), then removed by the maintenance
  job.
- **Personal data.** `UserPreference` (opt-in) holds only explicit choices keyed by an opaque
  user id. `LabelAppeal.contactEmail` is optional and purged on resolution.

## Rendering & state

- Every filter is a URL parameter, so any view can be deep-linked
  (`/?country=MM&sector=agriculture`). Pages render on the server from the URL and work without
  JavaScript. Client components add instant filtering, the globe and dialog behaviour.
- Lists use keyset pagination with explicit Previous/Next and end with "You are caught up".
- Preferences live in `localStorage` (`frealgo:prefs:v1`). A tiny nonce'd head script applies the
  motion and intro settings before first paint.

## Design system

The tokens in `app/globals.css` follow the spec palette. `--border-strong` (#66768F) was added
because `--border` (#233044) is only 1.6:1 on black and too faint for component boundaries.
`tests/unit/design-tokens.test.ts` checks the WCAG AA contrast pairs. Text uses the system font
stack (no web-font requests), a 16px base and 1.6 line height, with a 68ch measure on reading
pages. Orientation is shown with a marker on a five-tick line plus text, never with colour.

## Security

- CSP with a per-request nonce (ADR-009), `frame-ancestors 'none'`, `nosniff`, a strict
  referrer policy, a restrictive Permissions-Policy, and HSTS on https origins.
- External links use `rel="noopener noreferrer"` and `referrerPolicy="no-referrer"`.
- All SQL goes through Prisma or tagged-template `$queryRaw` (parameterized), and sort fields are
  allow-listed.
- Feed fetching is the only outbound network path, and it has SSRF protection (see
  `lib/ingest/safe-fetch.ts`).
- Secrets come from the environment and are validated by `lib/env.ts`. Nothing is exposed with
  `NEXT_PUBLIC_`.

## Observability

- Structured JSON logs (pino) with redaction. No IPs or user identifiers.
- Worker `/metrics` (Prometheus text): fetch outcomes, queue depth, source freshness ages.
- Web `/api/v1/health/live` (liveness), `/api/v1/health` (readiness),
  `/api/v1/health/freshness` (per-source freshness, public).
- Anonymous client counters (e.g. WebGL unavailable or context lost), aggregated per day with no
  identifiers.

## Globe (Milestone 4)

```text
page.tsx (server) ──▶ GlobeStage (client) ──┬─▶ children: server-rendered SVG map (SSR, no-JS, fallback)
                                            └─▶ React.lazy(GlobeView → GlobeCanvas)   ← loaded only when:
                                                  stage visible (IntersectionObserver) ∧ preference on
                                                  ∧ WebGL ok (failIfMajorPerformanceCaveat probe) or user opt-in
```

- **Rendering.** React Three Fiber with `frameloop="demand"`, so an idle globe schedules no
  frames (verified: 0 requestAnimationFrame calls in 2 s idle). One unlit sphere uses a
  CanvasTexture drawn from the Natural Earth vectors, so no raster is downloaded. Selected and
  hovered countries are drawn as line overlays. A thin back-face rim makes the edge readable.
  Texture, geometries and OrbitControls are disposed on unmount.
- **Picking.** R3F raycast → `uv` → lon/lat → bounding-box prefilter → `d3.geoContains`. The UV
  mapping is unit-tested against three.js `SphereGeometry` vertices.
- **Gestures.** One finger or mouse rotates. Pinch or wheel zooms, bounded between 1.35 and
  ~1.35× the fitted distance. There is no pan. A press counts as a tap only if it moves less than
  8 px within 600 ms; multi-touch never selects. `touch-action: none` applies inside the globe
  only.
- **Accessibility.**
  - The globe group is focusable once drawn. Arrow keys rotate (Shift for bigger steps), +/−
    zoom, and Enter opens the centred country. The new centre is announced politely.
  - The searchable country list remains the fully equivalent alternative.
  - Focus returns to the globe or list item that opened a country.
- **Adaptive quality.**
  - The initial tier comes from device memory, cores, Save-Data, connection type and pointer
    coarseness, so phones are not all treated the same.
  - DPR is capped at 1.5 on touch devices.
  - A frame-time monitor downgrades the tier (texture size, DPR, segments) when the median frame
    time stays above 34 ms.
- **Fallback.** WebGL unsupported → flat map with a notice. Software renderer → flat map with a
  "Try the 3D globe anyway" opt-in. Context loss → wait 3 s for a restore. A second loss → flat
  map. Every case sends one anonymous counter (`/api/v1/telemetry/client`).
