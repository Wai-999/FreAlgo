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

| Page                                                                                          | Perf             | A11y | Best practices | SEO | LCP                     | TBT                | CLS   |
| --------------------------------------------------------------------------------------------- | ---------------- | ---- | -------------- | --- | ----------------------- | ------------------ | ----- |
| Home, before optimisation                                                                     | 71               | 100  | 96             | 100 | 3.24 s                  | 944 ms             | 0     |
| Home, after Milestone 5 optimisation                                                          | 92               | 100  | 100            | 100 | 2.85 s                  | 214 ms             | 0     |
| Home, after the LCP follow-up                                                                 | **97**           | 100  | 100            | 100 | **2.26 s**              | 148 ms             | 0     |
| Country sheet `/?country=MM&sector=agriculture` (before → after M5 → after the LCP follow-up) | 91 → 95 → **96** | 100  | 96 → 100 → 100 | 100 | 3.26 → 2.8 → **2.34 s** | 134 → 110 → 145 ms | 0.025 |
| Search `/search?q=rice`                                                                       | **99**           | 100  | 100            | 100 | 2.18 s                  | 24 ms              | 0.007 |

These rows are v1 builds (2026-10-20). Four runs of the same build gave home 2.25–2.33 s and
country sheet 2.32–2.34 s; the build before the follow-up, re-measured the same day, gave 2.85 s
and 2.94 s. TBT varies by about ±40 ms between runs. The follow-up was ported to FreAlgo 2.0 on
2026-10-23: see "On FreAlgo 2.0" below for that before/after; its last run is in
`reports/lighthouse/`.

### LCP follow-up: closing the gap

**Why the simulated LCP was 2.8 s.** The LCP element is a small server-rendered caption (home)
or story text (country sheet) that is painted in the first frame. Lighthouse's simulation
(Lantern) estimates LCP from every request that finished, and every script that started running,
before the _observed_ LCP. On a local server the async Next.js chunks arrive within ~20 ms and run
before that first frame is presented (~57 ms), so all of them count, and so does the map iframe.
The estimate is then the time to download every first-load byte over 1.6 Mbit/s, in 150 ms round
trips on parallel connections, plus the React chunk's evaluation at 4× CPU. Hydration work is not
part of it. The lever is therefore **bytes downloaded before the first paint**, not hydration.

**What changed** (gzipped sizes):

1. **Motion removed (−45 KB).** Under Turbopack its "lazy" animation and drag features were in the
   initial chunk anyway. The country sheet now uses CSS animations (`.country-sheet` in
   `app/globals.css`) and a pointer-events drag handle; the exit animation runs before the sheet
   unmounts. The global reduced-motion rules apply, so the in-app motion setting is now honoured
   as well as the OS one.
2. **d3-geo and topojson-client out of the first load (−6 KB).** `GlobeStage` imported two small
   helpers from `lib/geo/globe-math`; device-quality helpers now live in
   `lib/geo/globe-quality.ts`.
3. **Globe controls in the lazy globe chunk.** Keyboard control, hover label, announcements and
   the quality tier moved into `components/globe/globe-view.tsx`, loaded with three.js.
   `React.lazy` replaces `next/dynamic`, whose SSR and preload runtime was in the first load.
4. **Filter fields server-rendered.** Only the `<form>` element (client navigation on submit) is
   a client component (`GetForm`); the fields still work without JavaScript.
5. **One country array for the list and the globe.** The RSC payload serializes a shared object
   once (home HTML 19.4 → 17.7 KB).
6. **Flat map v4 (43 → 18 KB).** Paths use relative commands on an integer 1920×1000 grid
   (`lib/geo/svg-path.ts`). That is half a unit of the old 960×500 one-decimal grid, below a pixel
   at the largest display size (1200 px); screenshots at that size are indistinguishable. The
   encoding itself is lossless and unit-tested. World Pulse draws the same paths on the server
   (`lib/geo/map-paths.ts`), so its viewBox follows the new grid.

On v1, first-load scripts went from 10 requests and 208 KB to 8 requests and 149 KB. The app's own
share went from ~77 KB to ~18 KB; the rest is Next.js and React.

**Considered and not done.**

- _Server-rendering the country list with a small search island._ RSC serializes server-component
  output into the page payload as well as the HTML. The 250 rendered entries would add ~7 KB to
  every Explore response, where the client list's props cost 3.7 KB, so the HTML would grow by
  ~3.7 KB to save ~1 KB of JavaScript. Hydration, the part this would have saved, is not in the
  LCP estimate.
- _`loading="lazy"` on the map iframe._ Chromium still fetched it before the first frame.
- _Mounting the map only after hydration_ (with a `<noscript>` copy). It would leave the critical
  window, but on slow connections the map would no longer work before scripts arrive.

**Margin and budget.** The estimate moves in 150 ms round-trip steps. Replaying saved Lighthouse
artifacts with edited transfer sizes showed that, with today's framework chunks, the Explore page
chunk must stay under ~10 KB and the map under ~20 KB for the current result. A unit test guards
the map size. A new first-load dependency of a few KB can bring back the 2.5 s boundary, so re-run
`scripts/perf/lighthouse.mjs` after adding client code to `/`.

### What changed in Milestone 5 ("before" → "after")

1. **Flat map moved out of the HTML.** The server-rendered SVG map was inlined twice: once as
   markup and once inside the React Server Components payload. It is now a static, immutable
   `/geo/world-map.v1.svg` (now `v4`) in an iframe. Its links use `target="_top"`, so it still works
   without JavaScript. HTML went from 478 KB to 167 KB (112 KB → 20 KB gzipped).
2. **~430 fewer link components to hydrate.** The 177 map links became static SVG links, and
   the 250 country-list links became plain `<a>` elements with one delegated click handler.
3. **Globe deferred to idle.** WebGL starts only when the stage is visible and the main thread
   is idle (`requestIdleCallback`, scheduled at mount rather than after `load`, which would also
   wait for the map iframe). three.js parsing (the 248 KB gzipped lazy chunk) therefore no longer
   competes with first paint or the first interaction.
4. **Smaller main bundle.** Local preference validation is hand-written, so Zod no longer ships
   to browsers; the server still uses Zod. Motion's animation and drag features were code-split
   to load after hydration (later removed entirely, see the LCP follow-up above).

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
that publisher takedowns take effect immediately (see `docs/operations/runbook.md`).

Reproduce:

```bash
DATABASE_URL=$DATABASE_URL_TEST RATE_LIMIT_SCALE=1000 npm run start:standalone   # after seeding synthetic data with --keep
node scripts/perf/load-test.mjs http://127.0.0.1:3000 15 20
```

## FreAlgo 2.0 (M5, 2026-10-23)

Same-machine comparison of v1 and v2 builds: `docs/audit/lighthouse-after/summary.md`. v2 does
not change the cost of the v1 pages; the new pages are text-first (Perf 99, LCP 2.2 s locally,
no Three.js). API reads including the event endpoints have p99 ≤ 18 ms at 10 connections on the
fixture database. Event queries compute counts live from published members (so a removed report
disappears at once); with thousands of events the list query should be re-checked with
`EXPLAIN` and, if needed, served from the stored counts.
