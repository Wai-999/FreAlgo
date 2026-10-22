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
