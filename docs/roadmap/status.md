# FreAlgo 2.0 status

Branch `v2/hybrid` (local commits). `main` = production (v1) until the owner approves the rollout.
Legend: ✅ implemented and tested · 🟡 partial · ⏳ planned · ⛔ blocked (external) · ✖ rejected by
the feature gate.

## M1: Baseline, safety and architecture

| Item                                                                                   | State | Evidence                                                                                                      |
| -------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| Repository, deployment and data audit                                                  | ✅    | [`docs/audit/baseline.md`](../audit/baseline.md), [`coverage-baseline.json`](../audit/coverage-baseline.json) |
| UI baseline (6 widths + 200 % zoom, keyboard, reduced motion, WebGL off, slow network) | ✅    | [`ui-before.json`](../audit/ui-before.json), `screenshots/before-*`                                           |
| Performance baseline on production                                                     | ✅    | [`lighthouse-before/summary.md`](../audit/lighthouse-before/summary.md)                                       |
| Architecture decision record                                                           | ✅    | [`adr-001-hybrid-upgrade.md`](../architecture/adr-001-hybrid-upgrade.md)                                      |
| Route map and v1 route-preservation test                                               | ✅    | [`route-map.md`](../architecture/route-map.md), `tests/e2e/routes.spec.ts`                                    |
| Feature flags (env-driven, listed on `/methodology#features`)                          | ✅    | `lib/flags.ts`, `tests/unit/flags.test.ts`                                                                    |
| v2 design tokens (spec palette, AA-verified)                                           | ✅    | `app/globals.css`, `tests/unit/design-tokens.test.ts`                                                         |
| CI smoke step (same script as production)                                              | ✅    | `.github/workflows/ci.yml`                                                                                    |
| Database backup and migration plan                                                     | ✅    | [`migration-plan.md`](../architecture/migration-plan.md)                                                      |
| Docs reorganised into the spec's structure                                             | ✅    | `docs/{audit,architecture,data,operations,release,roadmap}`                                                   |

## M2: Reliable global coverage and provenance

| Item                                                                                   | State                  | Evidence                                                                                          |
| -------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| Country roles: subject / feed scope / publisher home (migration + backfill + rollback) | ✅                     | `prisma/migrations/*v2_country_roles_article_type`, `lib/domain/country-roles.ts`                 |
| Tagging rules v2: text evidence wins, "US" alias (not "us"/"US$"), roles               | ✅                     | `lib/ingest/tagging/countries.ts`, `tests/unit/tagging.test.ts`                                   |
| Multilingual sector rules (en, pt, es, fr)                                             | ✅                     | `lib/ingest/tagging/sectors.ts`                                                                   |
| Article type on publisher evidence only                                                | ✅                     | `lib/ingest/tagging/article-type.ts`                                                              |
| Publisher categories stored; rules version per article; automatic re-tag on deploy     | ✅                     | `scripts/retag-articles.ts`, `tests/integration/retag.test.ts`, Dockerfile migrate step           |
| Country pages show "about" by default, `scope=all` on request, with an explanation     | ✅                     | `components/news/country-workspace.tsx`, articles-api tests                                       |
| Article-type filter, alphabetical sort (keyset), indexes                               | ✅                     | `lib/search/articles.ts`, `prisma/migrations/*v2_sort_and_type_indexes`                           |
| Source quality dashboard + `/api/v1/sources/health`                                    | ✅                     | `lib/db/quality.ts`, `/status#quality`                                                            |
| Coverage gap report                                                                    | ✅                     | [`docs/data/coverage-report.md`](../data/coverage-report.md) (`scripts/audit/coverage-report.ts`) |
| New sources only with verified permission and reachable feeds                          | ✅ (registered paused) | Global Voices (CC BY 3.0, 8 editions, dry-run 8/8); `docs/source-terms-review.md`                 |
| Ingestion runbook, data methodology                                                    | ✅                     | `docs/operations/ingestion-runbook.md`, `docs/data/source-methodology.md` §6–7                    |
| Migration rehearsal on production data                                                 | ✅                     | `docs/release/acceptance.md` (M2)                                                                 |
| Activate Global Voices                                                                 | ⛔ owner decision      | `docs/source-terms-review.md`                                                                     |

## M3: Hybrid editorial UX and My World

| Item                                                                                                                    | State          | Evidence                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| Primary nav Explore · Stories · Discover · Perspectives · My World; transparency pages one click away; no prefetch (D5) | ✅             | `components/shell/site-header.tsx`                               |
| Stories: finite chronological collections, sector collections, filters (type, scope)                                    | ✅             | `app/(content)/stories/page.tsx`                                 |
| Reading depths: Quick overview, Deep context, Original reporting                                                        | ✅             | `components/news/story-card.tsx`, `reading-depth-nav.tsx`        |
| Why am I seeing this? on every list card                                                                                | ✅             | `lib/explore/why.ts`                                             |
| Discover: seeded Surprise Me (page + API), daily discovery + archive                                                    | ✅             | `lib/discover/select.ts`, `/discover`, `/api/v1/discover/random` |
| My World: explicit local choices → shareable URL; import/export/reset                                                   | ✅             | `app/(content)/my-world`, Settings                               |
| Welcome intro 1.1 s with skip and reduced motion                                                                        | ✅             | `app/globals.css`                                                |
| Country picker keyboard race (D2)                                                                                       | ✅ fixed       | `components/globe/country-picker.tsx`                            |
| Knowledge checks, Constructive Developments                                                                             | ✖ feature gate | `docs/release/acceptance.md` (M3)                                |
| Perspectives page                                                                                                       | ✅ in M4       | see M4                                                           |

## M4: Evidence-backed intelligence and discovery

| Item                                                                                                          | State              | Evidence                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Event clustering (lexical, deterministic, join-only), hourly worker job, script with dry run                  | ✅                 | `lib/events/cluster.ts`, `lib/events/job.ts`, `scripts/cluster-events.ts`, `workers/scheduler.ts`                          |
| Evaluation on a labelled set and on a copy of production                                                      | ✅                 | [`docs/data/event-clustering-evaluation.md`](../data/event-clustering-evaluation.md)                                       |
| Story Mode (what happened, where, why it matters, what sources report, uncertain, timeline, next dates)       | ✅                 | `app/(content)/stories/[event]`, `/stories/events`                                                                         |
| Perspective Explorer (side by side, labels with provenance, shared wording, claims not assessed, corpus gaps) | ✅                 | `app/(content)/perspectives`, `lib/events/perspectives.ts`                                                                 |
| Curated, sourced timelines (fact / interpretation / analogy, precision, next known dates)                     | ✅ (fixtures only) | `TimelineEntry` + CHECK constraints                                                                                        |
| Story Journeys (step by step, full list, no autoplay)                                                         | ✅ flag off        | `/discover/journeys/[slug]`, `FEATURE_JOURNEYS`                                                                            |
| World Pulse (raw counts, one hue, legend, table)                                                              | ✅ flag off        | `/world-pulse`, `FEATURE_WORLD_PULSE`                                                                                      |
| Country connections (shared event clusters only)                                                              | ✅ flag off        | `/connections`, `FEATURE_COUNTRY_CONNECTIONS`                                                                              |
| APIs: events, event perspectives, journeys, methodology                                                       | ✅                 | `/api/v1/events`, `/api/v1/events/:id`, `/api/v1/events/:id/perspectives`, `/api/v1/journeys/:slug`, `/api/v1/methodology` |
| Operator correction of a wrong grouping (audited, permanent)                                                  | ✅                 | `scripts/cluster-events.ts --exclude`, `EventExclusion`                                                                    |
| Representative story fixtures                                                                                 | ✅                 | `prisma/data/fixtures.ts` (3 fictional events, timeline, journey)                                                          |
| Migrations (additive) and rollbacks                                                                           | ✅                 | `*_v2_events_timelines_journeys`, `*_v2_event_exclusions`, `prisma/rollbacks/`                                             |
| Real curated timelines and journeys                                                                           | ⛔ needs an editor | none exist; flags stay off                                                                                                 |
| Trade or historical country links                                                                             | ✖ feature gate     | no licensed dataset                                                                                                        |

## M5: Performance, security, deployment and handoff

| Item                                                               | State                                        | Evidence                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Performance measured (same machine, v1 vs v2) and route JavaScript | ✅                                           | `docs/audit/lighthouse-after/summary.md`, `scripts/perf/route-js.mjs`                                       |
| API load test including event endpoints                            | ✅                                           | `scripts/perf/load-test.mjs`, acceptance M5                                                                 |
| Globe tuning                                                       | ⛔ owner decision                            | `perf/explore-lcp` branch, not merged                                                                       |
| Accessibility checks on all v2 pages                               | ✅                                           | `docs/release/accessibility-report.md` §3a                                                                  |
| Worker crash, restart and load tests                               | ✅                                           | `tests/integration/recovery.test.ts`                                                                        |
| Security re-check                                                  | ✅                                           | `docs/security-review.md` #6–10                                                                             |
| Backup and restore rehearsal; production-like container rehearsal  | ✅                                           | acceptance M5, `docs/release/final-report.md` §3                                                            |
| Rollback plan, rehearsed                                           | ✅                                           | `docs/release/rollback.md`, `prisma/rollbacks/v2-all.down.sql`                                              |
| Staged rollout plan                                                | ✅                                           | `docs/release/rollout-plan.md`                                                                              |
| Pre-deploy backups; flags in production Compose                    | ✅                                           | `scripts/ops/server-setup.sh`, `deploy/docker-compose.prod.yml`                                             |
| Runbook, README, decisions, final report                           | ✅                                           | `docs/operations/runbook.md`, `README.md`, `docs/architecture/decisions.md`, `docs/release/final-report.md` |
| Production release                                                 | ⛔ **NOT DEPLOYED**, awaiting owner approval | `docs/release/rollout-plan.md`                                                                              |
