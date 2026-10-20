# Performance report

Measured on 2026-10-20 against the production build (`next build`, standalone server) on the
development machine: Apple Silicon, 14 cores, 24 GB RAM. During measurement the machine was
under heavy memory pressure from other applications (swap 6.5 GB of 7 GB in use). Treat absolute
times as conservative.

**Important.** These are emulated results: Lighthouse simulated mobile throttling, and CDP CPU
throttling with phone viewport and touch emulation. They are **not** measurements on physical
low-end phones. Headless Chromium has no GPU here, so every WebGL number below comes from
**SwiftShader (CPU rasterisation)**, which is a worst case for the globe. A real phone GPU
rasterises far faster. Physical-device testing (low-end Android, iOS Safari) remains an open
item; see the release report.

Reproduce:

```bash
npm run build && npm run start:standalone   # or docker compose up
node scripts/perf/lighthouse.mjs http://127.0.0.1:3000
node scripts/perf/profile-globe.mjs http://127.0.0.1:3000
```

## Lighthouse (mobile, simulated slow 4G + 4× CPU)

| Page                                                             | Perf        | A11y | Best practices | SEO | LCP          | TBT          | CLS   |
| ---------------------------------------------------------------- | ----------- | ---- | -------------- | --- | ------------ | ------------ | ----- |
| Home, before optimisation                                        | 71          | 100  | 96             | 100 | 3.24 s       | 944 ms       | 0     |
| Home, after optimisation                                         | **92**      | 100  | 100            | 100 | 2.85 s       | 214 ms       | 0     |
| Country sheet `/?country=MM&sector=agriculture` (before → after) | 91 → **95** | 100  | 96 → 100       | 100 | 3.26 → 2.8 s | 134 → 110 ms | 0.025 |
| Search `/search?q=rice`                                          | **99**      | 100  | 100            | 100 | 2.17 s       | 18 ms        | 0.007 |

**Gap against the SLO.** Simulated mobile LCP is 2.8–2.85 s on the two map pages, against a
< 2.5 s target. The LCP element is a small server-rendered text caption that actually paints in
~80 ms unthrottled (Lighthouse observed trace: TTFB 11 ms + render delay 67 ms). Lighthouse's
simulation attributes the remaining time to main-thread JavaScript under 4× CPU throttling. The
next steps are to ship less client JavaScript on `/`: server-render the country list and hydrate
only its search box, and replace the sheet's Motion transitions with CSS. They are listed in the
release report.

### What changed between "before" and "after"

1. **Flat map moved out of the HTML.** The server-rendered SVG map was inlined twice: once as
   markup and once inside the React Server Components payload. It is now a static, immutable
   `/geo/world-map.v1.svg` (now `v2`) in an iframe. Its links use `target="_top"`, so it still works
   without JavaScript. HTML went from 478 KB to 167 KB (112 KB → 20 KB gzipped).
2. **~430 fewer link components to hydrate.** The 177 map links became static SVG links, and
   the 250 country-list links became plain `<a>` elements with one delegated click handler.
3. **Globe deferred to idle.** WebGL starts only when the stage is visible and the main thread
   is idle (`requestIdleCallback`, scheduled at mount rather than after `load`, which would also
   wait for the map iframe). three.js parsing (the 248 KB gzipped lazy chunk) therefore no longer
   competes with first paint or the first interaction.
4. **Smaller main bundle.** Local preference validation is hand-written, so Zod no longer ships
   to browsers; the server still uses Zod. Motion's animation and drag features are code-split
   and load after hydration.

## Globe frame-time profile (SwiftShader, continuous drag rotation)

| Scenario                            | Globe ready | Median frame      | p95 frame | Worst  | Long tasks (max) | JS heap |
| ----------------------------------- | ----------- | ----------------- | --------- | ------ | ---------------- | ------- |
| Desktop 1440×900 @2×, no throttling | 1.0 s       | 33.3 ms (~30 fps) | 33.4 ms   | 183 ms | 5 (171 ms)       | 20 MB   |
| Phone viewport, 4× CPU slowdown     | 1.3 s       | 16.7 ms (60 fps)  | 16.8 ms   | 33 ms  | 5 (125 ms)       | 22 MB   |
| Phone viewport, 6× CPU slowdown     | 1.2 s       | 16.7 ms (60 fps)  | 16.8 ms   | 33 ms  | 5 (131 ms)       | 21 MB   |

Observations:

- **Desktop is the slow case under SwiftShader** because it renders 2240×1688 pixels on the CPU.
  Phones cap DPR at 1.5 and have a far smaller canvas. The frame monitor downgrades quality when
  the median frame time stays above 34 ms, so a desktop without a GPU settles at ~30 fps rather
  than stuttering.
- **CDP CPU throttling slows the main thread, not SwiftShader** (which runs in the GPU process).
  The phone rows therefore mostly show that our JavaScript per frame is small (one raycast,
  controls update). They do not show phone GPU cost.
- **Idle cost is zero.** With render-on-demand, an idle globe scheduled 0 animation frames in a
  2 s window (verified by instrumenting `requestAnimationFrame`).
- **The remaining long tasks (125–171 ms)** come from parsing the three.js chunk and building the
  2048×1024 texture. Both now run after the page is idle. A further step would be drawing the
  texture in an `OffscreenCanvas` worker.

## Server-side budgets

Load-test results and query plans are in the next section (Milestone 5).

## Milestone 5: query plans and load test at realistic volume

Measured on 2026-10-20 on the same machine (Postgres 17 in Docker Desktop, 14 vCPU, 8 GB VM).

### Data volume

`scripts/perf/explain-plans.ts` runs only against a `*_test` database. It inserts **200 000
synthetic articles** on the reserved `synthetic.invalid` domain, with ~278 000 country tags
(skewed: a few countries hold most stories, the long tail has very few) and ~140 000 sector tags.
It then calls the real query builders with query logging on and runs `EXPLAIN (ANALYZE, BUFFERS)`
on every statement they issue. Synthetic rows are deleted afterwards. Full plans:
`reports/explain-plans.txt`; summary: `reports/explain-plans.json`.

```bash
node --env-file-if-exists=.env --import tsx scripts/perf/explain-plans.ts [articles] [--keep]
```

### EXPLAIN results (slowest single statement per request)

| Scenario                                            | Before M5 fixes | After                                | Access path                                                                   |
| --------------------------------------------------- | --------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Country page, newest (page 1 / page 3 via cursor)   | 9–10 ms         | 5–12 ms                              | `ArticleCountry(countryId, publishedAt DESC, articleId DESC)` index-only scan |
| Country + last 7 days                               | 0.4 ms          | 0.4 ms                               | same index, range-bounded                                                     |
| Country + sector + orientation, oldest              | **48 ms**       | 14 ms                                | country tag bitmap scan; sector checked by id                                 |
| Region (60 countries), newest                       | 3 ms            | 3 ms work (+12 ms parallel start-up) | `Article(status, publishedAt DESC, id DESC)` + semi-join probe                |
| Global newest, no filters                           | 0.4 ms          | 0.4 ms                               | `Article(status, publishedAt DESC, id DESC)`                                  |
| Search, broad (matches 10 % of articles), relevance | **590 ms**      | 166–213 ms                           | BitmapOr over FTS GIN + trigram GIN                                           |
| Search, selective ("hurricanes")                    | **518 ms**      | 0.1–2.8 ms                           | BitmapOr                                                                      |
| Search, typo only ("ceasfire")                      | **443 ms**      | 50–95 ms                             | trigram GIN                                                                   |
| Search in a country                                 | **341 ms**      | 27–36 ms                             | country tag bitmap + recheck                                                  |
| Country summaries (globe/list)                      | 60 ms           | 52–62 ms                             | aggregate over all tags; served from the SWR cache (30 s fresh)               |
| Country coverage, freshness report                  | < 1 ms          | < 1 ms                               | small tables                                                                  |

What was wrong and what changed (`lib/search/articles.ts`):

1. **`ts_rank_cd` on non-matching rows.** It searches for covers even in documents that do not
   match the query, at ~45 µs per row. Trigram-only matches paid this for nothing. The rank is now
   guarded with `searchVector @@ tsq`. This is equivalent for normal queries, and _more_ correct
   for negations: an unguarded rank gave 0.5 to a story that `storm -flood` excludes.
2. **Per-row tsquery construction.** `websearch_to_tsquery` is STABLE, so a bare call in the score
   is re-run for every row. The score now uses a scalar subquery (evaluated once). The `WHERE`
   keeps the inline form so the planner can estimate it from statistics.
3. **OR across a join.** `OR outlet.name ILIKE …` referenced the joined table, which ruled out a
   BitmapOr on `Article`. Outlet names are matched first (tiny table) and become
   `OR outletId IN (…)`, or the branch disappears when no outlet matches (the usual case).
4. **Planner ignores the trigram operator's per-row cost.** For broad terms it still chose a full
   scan that runs `word_similarity` on every row. Text-search statements now run in a
   transaction with `SET LOCAL enable_seqscan = off`; every match branch is index-backed, so
   this only removes the bad option (country-scoped count 329 → 21 ms).
5. **Hidden values in tag filters.** Sector and region filters joined on slug or region name,
   which the planner cannot estimate: it guessed 291 politics tags when there were 20 005, then
   scanned all of them. Slugs and regions are now resolved to ids first.

### Load test (autocannon 8.0.0, 20 connections, 15 s per endpoint)

Server: production build (standalone) against the 200 000-article database, with
`RATE_LIMIT_SCALE=1000` so the test measures latency rather than 429s. autocannon reports
p90/p97.5/p99; p97.5 is shown as an upper bound for p95.

| Endpoint                               | Before fixes: req/s, p97.5 | After: req/s | p50    | p97.5  | p99    | Errors |
| -------------------------------------- | -------------------------- | ------------ | ------ | ------ | ------ | ------ |
| `GET /api/v1/countries` (SWR-cached)   | 2841, 10 ms (**21 × 500**) | 2696         | 6 ms   | 10 ms  | 12 ms  | 0      |
| `GET /api/v1/countries/MM/articles`    | 714, 34 ms                 | 804          | 24 ms  | 30 ms  | 32 ms  | 0      |
| Country + sector + orientation, oldest | 52, 489 ms                 | **590**      | 33 ms  | 40 ms  | 42 ms  | 0      |
| Search, broad term, relevance          | 42, 607 ms                 | 49           | 413 ms | 545 ms | 610 ms | 0      |
| `GET /api/v1/health/freshness`         | 3003, 8 ms                 | 3047         | 6 ms   | 8 ms   | 9 ms   | 0      |
| Explore page HTML (`/?country=KE`)     | 99, 226 ms (**15 × 500**)  | 100          | 193 ms | 218 ms | 318 ms | 0      |

107 876 requests in the final run, all 200. The web process peaked at 739 MB RSS under load
and returned to 294 MB after 20 s idle (lazy GC, no growth).

Findings fixed by the load test:

- **Postgres `/dev/shm` exhaustion** (SQLSTATE 53100, "could not resize shared memory segment").
  Docker gives containers a 64 MB `/dev/shm`, and parallel queries allocate dynamic shared memory
  there. All 36 errors in the first run came from this. Both compose files now set
  `shm_size: 256mb`.
- **Cache stampede on cold start.** Twenty concurrent first requests each ran the country
  summary aggregate. `lib/cache/swr.ts` now shares one in-flight load per key, with unit tests.

Against the SLO (read API p95 < 500 ms, cached): cached and index-served reads are 10–42 ms at
p97.5. **Gap:** a _broad_ relevance search under sustained concurrency (20 parallel clients
issuing a query that matches 10 % of the corpus) reaches p97.5 545 ms. That cost is the
ranking work itself, ~20 000 matches scored per request, and it grows linearly with corpus size.
Next steps if real traffic shows it: rank only the newest N matches (disclosed in the UI), or
move search to a dedicated engine. Article lists are deliberately **not** response-cached, so
that publisher takedowns take effect immediately (see `docs/operations.md`).

Reproduce:

```bash
DATABASE_URL=$DATABASE_URL_TEST RATE_LIMIT_SCALE=1000 npm run start:standalone   # after seeding synthetic data with --keep
node scripts/perf/load-test.mjs http://127.0.0.1:3000 15 20
```
