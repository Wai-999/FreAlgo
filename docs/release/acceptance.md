# FreAlgo 2.0 acceptance evidence

Test evidence and remaining risks, per milestone. Commands are run from the repository root;
timestamps are UTC.

## M1: Baseline, safety and architecture (commit `314d93f`, 2026-10-21)

| Criterion                                   | Evidence                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Current routes work                         | `tests/e2e/routes.spec.ts`: 12 v1 pages + 8 v1 APIs return 200; production check in `docs/audit/ui-before.json` |
| Lint/typecheck/build/test baseline captured | `docs/audit/baseline.md` §2: lint/typecheck pass, 194 unit, 81 integration, 118 e2e (26 skipped), build pass    |
| Documented architecture decisions           | `docs/architecture/adr-001-hybrid-upgrade.md`, `route-map.md`, `migration-plan.md`                              |
| No production mutation                      | Production reads only: SQL in a read-only transaction; UI audit uses GET requests and page loads                |
| Measurable coverage baseline                | `docs/audit/coverage-baseline.json` (2026-10-21T13:57Z)                                                         |

## M2: Reliable global coverage and provenance (2026-10-22)

| Criterion                                          | Evidence                                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeatable fixture-based ingest                    | `tests/integration/ingestion.test.ts` (24 tests) on local fixture feeds; no network                                                                                                                                               |
| Idempotent reruns                                  | ingestion test "ingests a fixture feed once, even when the job is retried or re-run"; `tests/integration/retag.test.ts` "second run finds nothing to do"                                                                          |
| Source outage does not stop other sources          | ingestion test "a failing source does not affect other sources"                                                                                                                                                                   |
| Correct country assignment on a cross-border story | `tests/unit/tagging.test.ts` (production example: BBC "US citizen … freed by Russia" → US, RU about; GB publisher home only); `tests/integration/articles-api.test.ts` "counts a story under its subject, not its publisher"      |
| Stale/empty states visible                         | `/status` freshness states + source quality table; country panel empty state and publisher-home notice (`data-testid="scope-notice"`)                                                                                             |
| Scheduler tested without production secrets        | `tests/integration/queue.test.ts` (mocked clock, local Redis db 15)                                                                                                                                                               |
| Migrations rehearsed on production data            | 2026-10-22: backup `frealgo-20261022T023701Z.dump` restored locally. `migrate deploy` + seed + re-tag took 2 s. 146 articles re-tagged; subject links 83 → 116. Feed statuses preserved (4 active, 31 paused). Scratch DB dropped |
| Query performance at 200k articles                 | `scripts/perf/explain-plans.ts` after the M2 indexes:<br>• country pages: 2–5 ms<br>• opinion filter: under 1 ms<br>• alphabetical: under 1 ms<br>• search: unchanged from v1 (`reports/explain-plans.json`)                      |

**Effect of country roles on production data (rehearsal):**

- United Kingdom: 70 → about-count ≤ 2;
- Brazil: 50 → 11 about + 39 publisher-home only;
- United States: 30 → 25 about + 19 publisher-home only.

**Gates:**

- format, lint, typecheck: pass;
- unit: 205 / 205;
- integration: 87 / 87, then 89 after the alphabetical and type tests;
- build: pass;
- e2e: 138 passed, 46 skipped by design, 0 failed.

**Remaining risks (M2):**

- 44 % of production stories name no country in their headline or excerpt.
- 49 % have no sector.
- Rules are lexical and miss implicit subjects.
- No current source signals opinion pieces in its feed, so article types stay unknown.
- New sources (Global Voices) need the owner's activation decision.

## M3: Hybrid editorial UX and My World (2026-10-22)

| Criterion                                             | Evidence                                                                                                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360 px-to-desktop layouts with no horizontal overflow | 320 px reflow tests for the new and v1 pages; screenshots at 1440 px and Pixel 7 (`docs/screenshots/v2/`)                                                                                                                        |
| Keyboard and screen-reader flows                      | `tests/e2e/hybrid.spec.ts` navigation and keyboard tests; labelled landmarks; `docs/release/accessibility-report.md`                                                                                                             |
| User filter persistence                               | My World reads choices saved in this browser and opens a URL of explicit choices; preferences import/export/reset in Settings (`hybrid.spec.ts` "My World", "import")                                                            |
| No engagement sorting or infinite scroll              | Sorts are newest, oldest, headline A–Z, outlet A–Z and text relevance (search only); every list has finite pages ending in "You are caught up"; scrolling loads nothing (5 browsers)                                             |
| Original links work                                   | "Original reporting" depth links to `https://` publisher URLs with `target=_blank` and `rel=noopener noreferrer` (`hybrid.spec.ts`)                                                                                              |
| Deterministic Surprise Me                             | Uniform over eligible countries, SHA-256(seed), seed shown, permalink. Same seed gives the same pick on the page and the API (`discover.test.ts`, `hybrid.spec.ts`, near-uniform check over 20 000 seeds in `hybrid-ux.test.ts`) |
| Why am I seeing this?                                 | Every list card; reasons computed only from the filters, the stored tag evidence and the sort (`hybrid-ux.test.ts`)                                                                                                              |
| Welcome animation with skip and reduced motion        | 1.1 s (spec 0.6–1.2 s), Skip button, skipped under reduced motion (`shell.spec.ts`)                                                                                                                                              |

**Gates:**

- format, lint, typecheck: pass;
- unit: 213;
- integration: 92;
- build: pass;
- e2e: 179 passed, 47 skipped by design, 0 failed after one test-scoping fix.

**Feature-gate decisions (spec §1):**

- **Knowledge checks:** not built. They would need editorial questions and answers, and
  generated quizzes risk fabrication.
- **Constructive Developments:** not built. Classifying "progress" automatically would be
  framing without evidence; it needs an editor-curated collection.
- **Perspectives:** off until M4 provides event clusters (now on; see M4).

## M4: Evidence-backed intelligence and discovery (2026-10-22)

| Criterion                                          | Evidence                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No hallucinated labels, relationships or summaries | Events show members' own headlines; FreAlgo writes no titles or summaries. Labels come from the outlet record with provenance. Connections are only "named in the same event". Curated entries need a source (database CHECK, `events.test.ts`). AI summaries flag is locked off (`m4-evidence.test.ts`) |
| Event cluster links to originals                   | Story Mode lists every report with its original `https://` link, `target=_blank`, `rel=noopener noreferrer` (`evidence.spec.ts`); the API returns every member with its URL and grouping evidence                                                                                                        |
| Gaps and unknown ratings handled                   | Perspectives lists unrated and disputed labels, missing labelled orientations, other languages and named countries without a local source, all "in FreAlgo's sources, not the world" (`events.test.ts`, `evidence.spec.ts`)                                                                              |
| 2D / text equivalent exists                        | World Pulse is a server-rendered SVG with legend and a full table; connections and journeys are text lists; Story Mode timeline is an ordered list                                                                                                                                                       |
| User can disable motion and journeys               | No M4 view animates. Journeys open only on request, move one step per click, have a full list view, and are off by operator flag (`FEATURE_JOURNEYS`) by default (`evidence.spec.ts` checks no autoplay)                                                                                                 |
| Clustering quality                                 | Method v2 (after the live review at release): labelled set precision 1.00, recall 0.79 (15/19); production at release 18 decisions, 1 wrong (excluded), 1 borderline (`docs/data/event-clustering-evaluation.md`)                                                                                        |
| Additive migrations with rollbacks                 | `20261022195158_v2_events_timelines_journeys`, `*_v2_event_exclusions`; `prisma/rollbacks/*.down.sql`; no existing table altered except new relations                                                                                                                                                    |

**Gates (2026-10-22):**

- format, lint, typecheck: pass;
- unit: 229 / 229;
- integration: 105 / 105;
- build: pass;
- e2e: 210 passed, 47 skipped by design, 0 failed (5 browser projects). Four older locators were
  made exact because the fixture event headlines contain country names.

**Feature-gate decisions (M4):**

- **Verified common facts / disputed claims:** shown as "not verified" and "not assessed"
  (ADR-023).
- **Journeys, World Pulse, country connections:** built and tested with fixtures, off in
  production until reviewed content and a review of the pages on real data.
- **Trade or historical connections:** not built; there is no licensed dataset in the project.

**Remaining risks (M4):**

- Lexical grouping misses differently worded reports and cannot group across languages.
- Long-running places (for example the West Bank) can produce similar headlines about different
  events within 72 hours.
- With all real outlets unrated, Perspectives cannot show orientation differences yet.
- There is no admin screen for timelines, journeys or exclusions (SQL and script only).

## M5: Performance, security, deployment and handoff (2026-10-23)

| Criterion                                               | Evidence                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance budgets documented with actual measurements | Same-machine v1 vs v2 Lighthouse: v1 pages unchanged; Stories, Discover, Story Mode, Perspectives: Perf 99, LCP 2.17–2.18 s, TBT ≤ 27 ms, CLS 0 (`docs/audit/lighthouse-after/summary.md`). Three.js only on Explore (`scripts/perf/route-js.mjs`). API p99 ≤ 18 ms for all reads (`scripts/perf/load-test.mjs`, local, 10 connections) |
| Accessibility budgets                                   | axe: 0 serious or critical on every v2 page; Lighthouse accessibility 100 (`docs/release/accessibility-report.md` §3a)                                                                                                                                                                                                                  |
| No critical security findings                           | `npm audit --omit=dev`: 0. Dev-only `braces` advisory accepted. v2 inputs fuzzed (404/400 envelopes, nothing reflected); headers unchanged; new tables carry the app role's grants (`docs/security-review.md` #6–10)                                                                                                                    |
| Worker survives restart                                 | `tests/integration/recovery.test.ts`: a job orphaned by a crashed worker is re-run by the restarted worker and ingested once; jobs queued while no worker runs complete; the v2 worker image restarts healthy with three schedulers                                                                                                     |
| Ingestion load                                          | 40 sources burst: 200 articles in 0.8 s, never more than 4 fetches at once, re-run adds nothing (`recovery.test.ts`)                                                                                                                                                                                                                    |
| Failed deploy can roll back                             | Rehearsed on the production copy: v1 runs on the v2 schema (20/20); full schema rollback in 0.27 s, then v1 19/20 (the 20th needs fixtures); forward again identical (`docs/release/rollback.md`)                                                                                                                                       |
| Backups and restore rehearsal                           | Production backup checksum verified, restored, migrated, re-tagged and grouped in about 3 s; production-like container run with the real role script and v2 images; deploys now take a pre-deploy backup                                                                                                                                |
| Production release only after approval                  | Approved by the owner on 2026-10-23 and **deployed** (`docs/release/final-report.md` §5)                                                                                                                                                                                                                                                |

**Gates (2026-10-23):**

- format, lint, typecheck: pass;
- unit: 231 / 231;
- integration: 108 / 108;
- build: pass; Docker `migrate`, `web` and `worker` images build;
- e2e: 210 passed, 47 skipped by design, 0 failed (5 browser projects).

**Fixes made in M5:**

- `FEATURE_*` flags now reach the production containers; before, an operator could not switch
  a feature off without editing Compose.
- Updates via `server-setup.sh` back up the database before migrating.
- A request body abandoned by the client is a 400, not a logged server error.
- The worker logs when the grouping job is skipped by its flag.
- `pull-backups.sh` also verifies pre-deploy backups.

**Corrected during M5:** an apparent "missing HSTS" finding came from this environment's network
resetting TLS to the production host. Checked on the server: pages send a two-year HSTS header.
No change was made.

**Remaining risks (M5):**

- The post-release Lighthouse run on production cannot be done from this environment (TLS to
  the host is reset); run it from another machine after the release.
- The local Explore LCP (2.94 s, the same in v1) is above 2.5 s without Caddy compression; on
  production it is 1.5 s. `perf/explore-lcp` would lower it further.
- No screen-reader or physical-device testing, and no independent penetration test.
