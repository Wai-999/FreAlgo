# FreAlgo 2.0 baseline audit (Milestone 1)

Measured 2026-10-21 (UTC) on the v1 code at `main` (`161fff1`) and the live site
<https://frealgo.duckdns.org>. Everything below was measured, not assumed. Production was only
read: SQL ran in a read-only transaction, and the browser checks made GET requests and page
loads.

| Artifact                                                                       | What it holds                                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [`coverage-baseline.json`](coverage-baseline.json)                             | Production data snapshot: sources, countries, languages, freshness, duplicates               |
| [`ui-before.json`](ui-before.json) + [`screenshots/before-*.png`](screenshots) | Routes, overflow at 6 widths + 200 % zoom, keyboard, reduced motion, WebGL off, slow network |
| `scripts/audit/ui-baseline.mjs`                                                | Reproduces the UI checks: `node scripts/audit/ui-baseline.mjs <url> <label>`                 |
| `reports/tmp/baseline.sql` → re-runnable via SSH                               | The production coverage query (read-only transaction)                                        |

## 1. Stack and deployment (inventory)

| Area            | Finding                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework       | Next.js 16.4.2 App Router, React 19.3.1, TypeScript 6.0.3 (strict), Tailwind 4.3.3                                                                                             |
| Package manager | npm, exact pins (`.npmrc save-exact`), Node 24.16.0                                                                                                                            |
| Routing         | `app/` with a `(content)` route group; every page server-rendered; URL query = state                                                                                           |
| Globe           | React Three Fiber 9.8.2 + three 0.186.1, one rendering owner (no Globe.gl); static SVG 2D map in an iframe; accessible country list                                            |
| Data            | PostgreSQL 17 + Prisma 7.10.1 (`prisma.config.ts`, client in `generated/prisma`); 3 migrations, each with a reviewed rollback in `prisma/rollbacks/`                           |
| Jobs            | BullMQ 5.81.5 on Redis 8. Cluster-wide schedulers: `ingest-tick` (`0 */3 * * *` UTC), `maintenance-daily` (04:17 UTC); host cron backup 02:37 UTC                              |
| Secrets         | Environment only, validated by `lib/env.ts`; production secrets generated on the server (`deploy/.env.production`, mode 600)                                                   |
| Deployment      | Oracle Cloud Always Free A1 (2 OCPU/12 GB, us-sanjose-1), Docker Compose `deploy/docker-compose.prod.yml`, Caddy with Let's Encrypt, DuckDNS domain (DNS managed by the owner) |
| Metrics         | Token-protected `/api/v1/metrics` (web), worker `:9464/metrics`, structured pino logs without IPs                                                                              |

## 2. Quality gates on the unchanged code

Run at 2026-10-21T13:57Z on `c746f3a` (v1 + this spec file), `bash -c` loop recorded in
`reports/tmp/baseline-gates.txt`:

| Gate                               | Result                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `npm run lint`                     | pass (0 problems)                                                                 |
| `npm run typecheck`                | pass                                                                              |
| `npm test`                         | 20 files, **194 / 194** pass                                                      |
| `npm run test:integration`         | 6 files, **81 / 81** pass (Postgres 17 + Redis, `*_test` DB)                      |
| `npm run build`                    | pass                                                                              |
| `npx playwright test` (5 projects) | **118 passed**, 26 skipped by design, 0 failed, 0 flaky                           |
| `npm run format:check`             | failed only on two files added for v2 (the spec copy and the audit script); fixed |

## 3. Production data baseline (`coverage-baseline.json`, 13:57Z)

| Measure                           | Value                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Articles                          | 91 (fixtures: 0), published 2026-10-14 → 2026-10-21; 0 estimated dates; 0 duplicate content hashes                                      |
| Registry                          | 26 outlets / 27 feeds in 21 publisher countries; **4 active** (NPR, BBC ×2, Agência Brasil), 23 paused pending terms review, 0 in error |
| Ingestion, last 24 h              | 11 SUCCESS, 1 NOT_MODIFIED, 0 failures; last scheduled run 12:00Z                                                                       |
| Languages                         | en 71, pt 20                                                                                                                            |
| Countries with ≥1 _subject_ story | 27 (22 in the last 24 h, 27 in 7 days)                                                                                                  |
| Articles with no subject country  | **42 of 91 (46 %)**                                                                                                                     |
| Articles with no sector           | **52 of 91 (57 %)**                                                                                                                     |

**Publisher country vs subject country (the key finding).** v1 tags every article with its
publisher's home country (`basis = SOURCE_COUNTRY`) and counts those tags as country coverage.

| Country                                       | All tags (shown as the count) | Publisher-country only | Actually about the country |
| --------------------------------------------- | ----------------------------- | ---------------------- | -------------------------- |
| United Kingdom                                | 55                            | 54                     | **1**                      |
| Brazil                                        | 20                            | 20                     | **0**                      |
| United States                                 | 19                            | 17                     | **2**                      |
| France / Australia / Russia / Ukraine / India | 5–6 each                      | 0                      | 5–6 each                   |

The spec's observation "United Kingdom 49" is therefore mostly BBC world news about _other_
countries. A cross-border example from production illustrates both problems:
_"US citizen Stephen Hubbard freed by Russia as Trump envoy meets Putin"_ (BBC) is tagged GB
(publisher) and RU (text match), but **not US**, because "US" is not in the gazetteer as an
unambiguous term.

## 4. UI baseline (`ui-before.json`)

| Check                                                                                       | Result                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Existing routes (13 pages, 5 APIs)                                                          | all 200                                               |
| New v2 routes (`/stories`, `/discover`, `/perspectives`, `/my-world`)                       | 404 (expected before the upgrade)                     |
| Horizontal overflow at 360/390/430/768/1280/1440 px and 1280 px @ 200 % zoom (6 pages each) | none                                                  |
| Keyboard: Tab to country search → type at human speed → ArrowDown → Enter                   | search reachable, match focused, panel opens          |
| Reduced motion                                                                              | intro skipped                                         |
| WebGL disabled                                                                              | stage in `fallback` mode, 250 country links available |
| Slow network (400 ms RTT, 1.6 Mbps, 4× CPU, phone)                                          | first story visible after **1.3 s**                   |

v1 accessibility evidence carries over: axe (WCAG 2.2 AA rules) reports zero serious or critical
issues on every page, and v1 Lighthouse accessibility is 100. See
`docs/privacy-accessibility-audit.md`.

## 5. Known defects and gaps (verified)

| ID     | Severity          | Defect                                                                                                                                                                                     | Evidence                                                       | Planned                                       |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------- |
| D1     | High (integrity)  | Country counts conflate the publisher's home country with the article's subject                                                                                                            | §3 table                                                       | M2                                            |
| D2     | Low               | Country picker: ArrowDown right after _instant_ input (script, paste) loses focus; at human typing speed it works                                                                          | 0 ms typing → `BODY`; 80/150 ms → Kenya                        | M3                                            |
| D3     | Medium            | Subject tagging misses "US"/"U.S." and demonyms ("American", "Russian")                                                                                                                    | cross-border example                                           | M2                                            |
| D4     | Medium            | 46 % of articles have no subject country and 57 % no sector; the rules are English-first and Agência Brasil's domestic stories rarely name "Brasil"                                        | §3                                                             | M2 (feed-scope rule, Portuguese sector rules) |
| D5     | Low (performance) | Header links prefetch every content page's server payload on load (about 7 requests, repeated after navigation)                                                                            | network log during the keyboard check                          | M5                                            |
| ~~D6~~ | —                 | _Refuted on production:_ the v1 "LCP 2.8 s" was a local measurement. Production simulated-mobile LCP is 1.36–1.66 s. The unmerged `perf/explore-lcp` branch still reduces first-load bytes | [`lighthouse-before/summary.md`](lighthouse-before/summary.md) | M5: owner decides on merging                  |

Not verified, so not claimed as defects: physical-device rendering, screen-reader output, and
3D globe behaviour on real GPUs.

## 6. Performance baseline

On the live site, Lighthouse (simulated mobile) measured:

| Page                                              | Performance | Accessibility | LCP    | TBT    | CLS   |
| ------------------------------------------------- | ----------- | ------------- | ------ | ------ | ----- |
| Home (`/`)                                        | 97          | 100           | 1.51 s | 180 ms | 0     |
| Country panel (`/?country=MM&sector=agriculture`) | 99          | 100           | 1.66 s | 106 ms | 0.025 |
| Search                                            | 100         | 100           | 1.36 s | 13 ms  | 0     |

See [`lighthouse-before/summary.md`](lighthouse-before/summary.md) for method and timestamps.
These are better than v1's local measurements in `docs/performance.md`, which ran on an overloaded
machine without production's compression and HTTP/2.
Budgets for v2 (spec §12): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, and no WebGL code on text-only
routes.
