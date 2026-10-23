# FreAlgo 2.0: final implementation report

Branch `v2/hybrid` (local; not pushed). Production runs v1 (`main`, `161fff1`) at
<https://frealgo.duckdns.org>.

## Release status: NOT DEPLOYED

FreAlgo 2.0 is implemented, tested and rehearsed on a copy of production, but **it is not
deployed**. The specification and the owner's instructions require approval for a production
release, and for pushing the branch. The steps are in `docs/release/rollout-plan.md`; the undo
steps are in `docs/release/rollback.md`.

## 1. Baseline (M1, 2026-10-21)

- v1 live on Oracle Always Free (A1, us-sanjose-1). 4 active feeds (NPR, BBC News ×2, Agência
  Brasil); 31 paused.
- Production Lighthouse (mobile preset): Explore LCP 1.5 s, country sheet 1.7 s, search 1.4 s;
  accessibility 100 (`docs/audit/lighthouse-before/summary.md`).
- Gates: lint, typecheck, 194 unit, 81 integration, 118 e2e tests passing.
- Coverage problem found: country counts mixed "about" with "publisher based here" (for example
  70 United Kingdom stories, of which at most 2 were about the UK).
- Full audit: `docs/audit/baseline.md`.

## 2. What changed

205 files against `main` (13 588 insertions, 1 257 deletions): app 25, components 14, lib 31,
prisma 14, workers 6, scripts 14, tests 25, docs 61, deploy 2.

| Milestone | Commit      | Highlights                                                                                                                                                                                                                       |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | `314d93f`   | Audit and baselines, ADR V2-001, feature flags, v2 design tokens, route-preservation test, CI smoke                                                                                                                              |
| M2        | `2a87f54`   | Country roles (about / feed scope / publisher home), tagging rules v2 (multilingual sectors, article type from publisher evidence), automatic re-tag on deploy, alphabetical sort, source quality dashboard, coverage gap report |
| M3        | `a5c0bbf`   | Five-section navigation, Stories with reading depths and "Why this story?", seeded Discover and daily discovery, My World, preference import                                                                                     |
| M4        | `177f202`   | Event clustering (lexical, deterministic, evaluated), Story Mode, Perspectives, curated timelines, Story Journeys, World Pulse, country connections, five new APIs                                                               |
| M5        | this commit | Performance comparison, recovery and load tests, security re-check, production-like container rehearsal, rollback and rollout plans, pre-deploy backups, feature flags in production Compose, aborted-request fix                |

## 3. Migrations

All additive; each has a reviewed rollback in `prisma/rollbacks/`, plus
`prisma/rollbacks/v2-all.down.sql` (all four, one transaction).

| Migration                                      | Adds                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `20261021140911_v2_country_roles_article_type` | `CountryRole`, `ArticleType` enums; role on country tags (backfilled); article type, basis, publisher categories, rules version          |
| `20261022192442_v2_sort_and_type_indexes`      | `titleSort` column and trigger; alphabetical and type indexes                                                                            |
| `20261022195158_v2_events_timelines_journeys`  | `NewsEvent`, `EventArticle`, `TimelineEntry`, `StoryJourney`, `JourneyNode`, `TimelineKind`; CHECK constraints requiring http(s) sources |
| `20261022202201_v2_event_exclusions`           | `EventExclusion` (operator removes a wrong grouping for good)                                                                            |

Rehearsed on the production backup `frealgo-20261022T023701Z.dump` (checksum verified):

- **Local scripts:** migrate 0.9 s, seed 0.6 s, re-tag 0.7 s, event grouping 0.3 s. The 146
  articles were kept, and "about" links went from 83 to 116.
- **Production-like containers** (Postgres 17 with the real role script, the v2 `migrate`,
  `web` and `worker` images): migrations as owner, then grouping and the web app as the
  least-privilege `frealgo_app` role. All new tables had the right grants, the smoke test
  passed, and the worker registered three schedulers and survived a restart.
- **Rollback:** `v2-all.down.sql` ran in 0.27 s. v1 then served every v1 page and API on the
  rolled-back schema, and migrating forward again gave identical results.
- **v1 on the v2 schema without rollback:** works (20/20 route checks), so the normal rollback
  is to redeploy `main` without touching the database.

## 4. Test results (2026-10-23)

| Gate                                        | Result                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Format, lint, typecheck                     | pass                                                                                                        |
| Unit                                        | 231 / 231                                                                                                   |
| Integration (Postgres, Redis, BullMQ)       | 108 / 108, including crash recovery, restart and a 40-source burst                                          |
| Build                                       | pass; Docker `migrate`, `web` and `worker` images build                                                     |
| End to end (Playwright, 5 browser projects) | 210 passed, 47 skipped by design, 0 failed                                                                  |
| Accessibility                               | axe: 0 serious or critical issues on all v2 pages; Lighthouse accessibility 100                             |
| Performance (same machine, v1 vs v2)        | v1 pages unchanged; new pages Perf 99, LCP 2.17–2.18 s, TBT ≤ 27 ms, CLS 0; Three.js loads only on Explore  |
| API latency (10 connections, local)         | p99 ≤ 18 ms for every read API including events and Perspectives; Story Mode HTML p99 65 ms                 |
| Security                                    | `npm audit --omit=dev`: 0; dev-only `braces` advisory accepted; v2 inputs fuzzed; headers unchanged from v1 |
| Clustering quality                          | Labelled set: 18/18 pairs, 0 false. Production copy: 7 events, 16 reports, none wrong, 1 borderline         |

## 5. Live verification

- **Production (v1) is healthy:** all containers are up and healthy, HTTPS returns 200, and
  crawlers are being served over HTTP/2 (checked over SSH, read-only, 2026-10-23 00:31 UTC).
  Pages send a two-year HSTS header.
- **v2 has not been verified live, because it is not deployed.** The closest evidence is the
  production-like container rehearsal above.
- This development environment's network resets TLS connections to the production host, so the
  post-release Lighthouse run must be done from another machine or through SSH.

## 6. Remaining blockers and risks

**Owner decisions:**

- Approve the production release and the push of `v2/hybrid`.
- Activate Global Voices (terms reviewed, registered paused).
- Merge `perf/explore-lcp` (Explore LCP improvement).

**Content that needs a named editor:**

- Real curated timelines and Story Journeys.
- Knowledge checks and Constructive Developments, which were not built (feature gate).

**Data limits:**

- All real outlets are unrated, so Perspectives cannot show orientation differences yet.
- 44 % of stories name no country.
- Grouping misses reports that use different words and cannot group across languages.

**Not verified:**

- Screen readers and physical devices.
- An independent penetration test.

## 7. Next safe actions

1. Review this report, `docs/release/acceptance.md` and the screenshots in
   `docs/screenshots/v2/`.
2. Approve the push; CI runs on GitHub.
3. Follow the rollout plan:
   - Stage 1: v2 code with the new sections off, for one ingest cycle.
   - Stage 2: reading features.
   - Stage 3: events and Perspectives, after a dry run of the grouping on production data.
4. After a week: decide on Global Voices, `perf/explore-lcp`, and the off-by-default features.
