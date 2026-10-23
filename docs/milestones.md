# Milestone checklist

Status legend: ✅ done with evidence · ⏳ in progress · ⛔ blocked by an external gate.

## Milestone 1 — Foundation and design system

- ✅ Next.js 16 / React 19 / TypeScript strict / Tailwind 4 scaffold, exact version pins
- ✅ Prisma 7 schema, initial migration (+ raw SQL: pg_trgm, CHECKs, FTS trigger), rollback script
- ✅ Docker Compose: postgres, redis, migrate (one-shot), web, worker with health checks/volumes
- ✅ Idempotent seed: 250 ISO countries (CLDR regions/languages), 7 sectors, 12 fixture outlets,
  168 fixture articles
- ✅ Design tokens + contrast tests, intro (≤1.5 s, skip, reduced-motion bypass, once per session)
- ✅ Navigation shell (desktop rail, mobile view switch), SVG map, accessible country picker
- ✅ CSP nonce proxy + security headers; liveness/readiness endpoints
- ✅ CI workflow (format, lint, typecheck, unit, integration, build, e2e, docker build)
- **Acceptance evidence:** see "M1 report" in the release notes (`docs/release-report.md`)

## Milestone 2 — Reliable ingestion and source governance

- ✅ Curated registry: 27 verified real publisher feeds (seeded PAUSED + UNRATED) + fixtures
- ✅ RSS 2.0 / RSS 1.0 (RDF) / Atom adapter; licensed JSON API adapter (key from env, external gate)
- ✅ BullMQ job schedulers (cron `0 */3 * * *` UTC, idempotent across replicas), per-window job ids
- ✅ SSRF-safe fetch (DNS pinning, private ranges, redirect re-validation, size/time limits),
  conditional HTTP (ETag/If-Modified-Since), robots.txt (RFC 9309), per-host concurrency
- ✅ Retry with jittered backoff, dead-letter queue, circuit breaker (8 failures → ERROR)
- ✅ Validation, HTML sanitisation to text, URL canonicalisation, dedupe, quarantine
- ✅ Auditable country (gazetteer, 20 languages) and sector (rules v1) tagging with stored basis
- ✅ Freshness API/page, worker /metrics, admin API + console, label history, appeals, audit log
- ✅ Terms review enforced before any real fetch (ADR-014)
- **Evidence:** 47 integration tests (fixture feeds ingest once despite retries; changed entries
  upsert; malformed/DTD payloads quarantine; SSRF literal/redirect/rebind/robots blocked; mocked
  clock proves 3 h cadence; failing source isolated; freshness truthful). Live dry-run: 27/27 real
  feeds fetched and parsed through the production path without writing data.

## Milestone 3 — News APIs, search, and country workspace

- ✅ Versioned Zod contracts (docs/api.md), stable error envelope, rate limits, SWR cache headers
- ✅ Keyset cursor pagination (newest/oldest/outlet/relevance) with Previous/Next, page numbers,
  capped totals and an explicit "You are caught up" end; index-driven country pages
- ✅ Postgres FTS (language-stemmed + simple) + trigram typo tolerance + CJK substring fallback;
  relevance explained as textual match only
- ✅ Country sheet: anchored desktop panel / mobile modal bottom sheet (drag handle, close button,
  focus trap, inert background, Escape, focus return), sector navigation, transparent filters,
  coverage notices (no sources, paused, stale, paywalls, language gaps), deep links
- ✅ Search page, settings (local-first), opt-in server sync (GET/PUT/DELETE/export), OIDC sign-in
- **Evidence:** 81 integration tests (filter intersection, search, deterministic order with ties,
  full forward/backward cursor walks, concurrent insert, invalid params, SQL-injection inputs,
  auth boundaries, OIDC with mock IdP); 73 e2e tests incl. keyboard flow, no-JS flows, axe scans
  with zero serious/critical violations on 6 pages.

## Milestone 4 — Interactive globe and polished responsive UX

- ✅ React Three Fiber globe behind `next/dynamic({ ssr: false })`, started only when visible,
  idle and WebGL-capable; render-on-demand (0 frames when idle); disposes resources on unmount
- ✅ ISO boundary picking (UV → lon/lat → geoContains), verified against three.js geometry;
  uncoded areas (Somaliland, N. Cyprus) explained rather than merged
- ✅ Gestures: one-finger/mouse rotate, bounded pinch/wheel zoom, tap-vs-drag, no pan; keyboard
  rotate/zoom/Enter with live announcements; focus returns to the globe or list
- ✅ Adaptive quality (device memory/cores/Save-Data/pointer; DPR ≤ 1.5 on touch; frame-time
  downgrade); software-renderer opt-in; context-loss recovery then 2D fallback; anonymous counters
- ✅ Flat map moved to a static cacheable SVG (works without JS); HTML 478 KB → 167 KB
- **Evidence:** 14 globe e2e tests (click/drag, keyboard, touch tap, context loss, toggle, no-WebGL
  on all engines, software opt-in, axe with globe active); Lighthouse home 71 → 92, TBT 944 →
  214 ms; frame-time profile in docs/performance.md (SwiftShader, emulated devices).
- ⛔ Physical low-end Android / iOS Safari device testing (needs real devices); simulated mobile
  LCP 2.8 s vs 2.5 s target (documented with next steps).

## Milestone 5 — Production hardening, release, and handover

- ✅ Security review with threat model; fixed stored XSS via admin URLs (http(s)-only + `safeHref`),
  robots.txt ReDoS caps, CSP on the map asset ([security-review.md](security-review.md))
- ✅ Licence audit of 256 production packages (no GPL/AGPL; four reviewed exceptions) and data
  sources ([licenses.md](licenses.md)); `npm audit --omit=dev`: 0 vulnerabilities; CI audits
- ✅ Observability: per-request latency logs, `Server-Timing`, token-protected web metrics, worker
  metrics and health, alert table in the runbook
- ✅ Production Compose recipe: Caddy TLS, private network, least-privilege DB role, Redis auth,
  memory limits, log rotation, `shm_size` ([operations.md](operations/runbook.md),
  [deployment-checklist.md](operations/deployment-checklist.md))
- ✅ Backups with checksums; **restore drill passed** (row counts and migration state identical)
- ✅ **Scheduled worker observed** on real feeds (throwaway DB): cron tick → 4 feeds → 193 real
  articles, 0 failures, no duplicate enqueue within the window
- ✅ Query plans at 200 000 articles; search 590 → ~200 ms broad, 518 → 3 ms selective; filtered
  list 48 → 14 ms (ADR-019)
- ✅ Load test (autocannon): found and fixed Postgres `/dev/shm` exhaustion and a cold-cache
  stampede; 107 876 requests, 0 errors ([performance.md](performance.md))
- ✅ Privacy and accessibility audit: axe sweep of every page; fixed 320 px reflow on Settings
  and the white backdrop behind the 2D map ([privacy-accessibility-audit.md](privacy-accessibility-audit.md))
- ✅ Resilience: globe download failure now falls back to the flat map instead of crashing the
  page (error boundary); slow-network e2e (works before scripts load) on all engines
- ✅ Smoke test passes against the Compose stack; release report with screenshots
  ([release-report.md](release-report.md))
- ⛔ External gates: hosting and domain, GitHub remote and hosted CI, OIDC provider, publisher
  terms review before activating real feeds, physical-device and screen-reader testing,
  independent penetration test
