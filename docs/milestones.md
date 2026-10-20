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

- ⏳ Source registry, RSS/Atom adapter, licensed-API adapter interface
- ⏳ BullMQ scheduler (3 h), worker, conditional HTTP, retry/backoff/jitter, DLQ, circuit breaker
- ⏳ SSRF-safe fetch, sanitization, canonicalization, dedupe, auditable country/sector tagging
- ⏳ Ingestion metrics, quarantine, admin operations, label provenance

## Milestone 3 — News APIs, search, and country workspace

- ⏳ Versioned API contracts, cursor pagination, FTS/trigram search, filters
- ⏳ Country side sheet / bottom sheet, finite pages, deep links, empty/error states
- ⏳ Opt-in preference sync (auth), local-only default

## Milestone 4 — Interactive globe and polished responsive UX

- ⏳ Dynamically imported R3F globe, picking, gestures, adaptive quality, WebGL fallback
- ⏳ Playwright coverage, Lighthouse, frame-time profiling

## Milestone 5 — Production hardening, release, and handover

- ⏳ Security/licence/privacy/accessibility audits, load tests, backup/restore drill
- ⏳ Production deployment recipe, runbook, release report
