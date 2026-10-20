# Architecture decision records

Each entry: context → decision → consequences. Newest last. Versions were checked against the npm
registry and Docker Hub on 2026-10-19.

## ADR-001 Pinned toolchain

**Context.** The spec asks for current, mutually compatible, exactly pinned versions without
unverified claims about "latest".

**Decision.** Everything is pinned exactly (`.npmrc save-exact=true`, lockfile committed):

| Area              | Version                                                   | Why not the newest tag                                                                                                |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Node.js           | 24.x (24.22.0 in Docker, `engines >=24 <25`)              | LTS line                                                                                                              |
| Next.js           | 16.4.2                                                    | —                                                                                                                     |
| React / React DOM | 19.3.1                                                    | React Three Fiber 9.8.2 requires `<19.4`                                                                              |
| TypeScript        | 6.0.3                                                     | 7.0.2 (native port) is outside `typescript-eslint`'s supported range (`<6.1.0`)                                       |
| Prisma ORM        | 7.10.1 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | `prisma@latest` currently points to 8.0.0-rc.23, a release candidate with a new contract-based workflow               |
| PostgreSQL        | 17.11 (alpine)                                            | Spec needs 16+; 17 is mature                                                                                          |
| Redis             | 8.10.2 (alpine)                                           | Valkey 8 is a drop-in alternative if Redis licensing matters                                                          |
| BullMQ            | 5.81.5 (ships ioredis 5.11.1)                             | 6.x (Jul 2026) adds multi-backend support; 5.x is the maintained line with the well-known API                         |
| Zod               | 4.6.7                                                     | —                                                                                                                     |
| Tailwind CSS      | 4.3.3                                                     | —                                                                                                                     |
| ESLint            | 10.13.0 + eslint-config-next 16.4.2                       | Next docs state 16.4+ supports ESLint 10; three plugins still declare `^9` peers (npm prints a peer override warning) |
| Vitest            | 4.1.12                                                    | 5.0 is a fresh major; 4.x is the maintained line                                                                      |
| Playwright        | 1.64.1                                                    | —                                                                                                                     |
| three / R3F       | 0.186.1 / 9.8.2                                           | —                                                                                                                     |

**Consequences.** Upgrades go through Dependabot PRs (grouped minor/patch), never implicit.

## ADR-002 Single package, two deployables

**Decision.** One npm package with shared `lib/`. The web app builds to Next.js `standalone`; the
worker is bundled by esbuild into `dist/worker/index.mjs`. One Dockerfile has `web`, `worker`
and `migrate` targets.

**Consequences.** Shared domain code (taxonomy, canonicalization, DB access) has a single source of
truth. Web and worker images deploy, scale and restart independently. A monorepo can come later if
the codebases diverge.

## ADR-003 Prisma 7 with raw-SQL migration additions

**Decision.** Prisma schema + `prisma migrate`. Objects Prisma cannot express are appended to the
same migration as raw SQL: `pg_trgm`, CHECK constraints (label confidence 0..1, ISO formats, hash
format), and the full-text trigger. `prisma migrate diff` against the live DB is empty, so no drift.
Rollback scripts live in `prisma/rollbacks/` (Prisma has no automatic down migrations).

## ADR-004 Full-text search via trigger-maintained tsvector

**Context.** Articles arrive in many languages.

**Decision.** `Article.searchVector` is maintained by a `BEFORE INSERT/UPDATE` trigger. It
concatenates an unstemmed `simple` vector, so exact words work in every language, with a
language-stemmed vector when the article's BCP-47 language maps to a built-in Postgres config
(29 languages). The headline is weighted A, the excerpt B. Trigram GIN indexes on article titles
and outlet names cover fuzzy and partial matches, including scripts without word spacing.

**Consequences.** Meilisearch/OpenSearch are deferred until measurements justify them.

## ADR-005 Denormalized `publishedAt` on tag tables

**Decision.** `ArticleCountry` and `ArticleSector` carry a copy of `Article.publishedAt`, indexed
`(countryId, publishedAt DESC, articleId DESC)`. Country pages are served by an ordered index scan
instead of a sort of every article in the country.

**Consequences.** Ingestion writes the copy in the same transaction. A publisher changing a
timestamp updates all three rows.

## ADR-006 URL is the UI state

**Decision.** Country, sector, filters, sort and cursor live in the URL
(`/?country=MM&sector=agriculture`). Pages are server-rendered from it, and client components
enhance navigation. Explore, search and the country sheet work without JavaScript. Root-level
`loading.tsx` is deliberately absent: a page-level Suspense boundary would stream content that
only JavaScript can reveal.

## ADR-007 One 3D engine: React Three Fiber + Three.js

**Decision.** R3F (not Globe.gl) behind `next/dynamic({ ssr: false })`. The globe texture is drawn
from the same Natural Earth vectors, so no texture download is needed. Picking intersects the ray
with the sphere analytically, converts to lon/lat and runs a point-in-polygon lookup, which is
deterministic and unit-testable. The server-rendered SVG map is both the SSR skeleton and the
WebGL fallback.

## ADR-008 Real sources start paused; fixtures are explicit

**Decision.** Fixture outlets use `.example` domains, "(Fixture)" names and `isFixture=true`, and
are badged in the UI. Real publisher feeds are registered `PAUSED` until an operator records a
terms review. Nothing fabricated is presented as real news. Fixture feeds are never "synced", and
the status page says so.

## ADR-009 CSP: script nonces, inline styles allowed

**Decision.** `proxy.ts` issues a per-request nonce: `script-src 'self' 'nonce-…'
'strict-dynamic'`. `style-src` keeps `'unsafe-inline'` because React SSR emits `style` attributes,
which nonces cannot cover. Script injection, the main XSS risk, stays blocked. The cost is that
every page renders dynamically, which these data-driven pages do anyway.

## ADR-010 No article images

**Decision.** Article images are not rendered. Image rights are not covered by RSS terms, and
hot-linking leaks reader IPs to publishers. `imageUrl` is stored for a future licensed mode only.

## ADR-011 Scheduling with BullMQ job schedulers

**Decision.** One repeatable "enqueue-due-sources" scheduler (`upsertJobScheduler`, cron
`0 */3 * * *` UTC) is idempotent across replicas because it is keyed in Redis. It enqueues one
`fetch-source` job per due source, with the job id `fetch:<sourceId>:<windowStart>` so retries or a
second scheduler cannot duplicate work within a window. Cron inside the web process is never used.

## ADR-012 Authentication: optional, minimal

**Decision.** Anonymous use needs no account. Server-side preference sync needs a session: an
HMAC-signed HttpOnly cookie issued after OpenID Connect sign-in (`OIDC_*`, an external gate) or,
for localhost only, a password-less dev login. Admin access requires a session user listed in
`ADMIN_USER_IDS` or a bearer `ADMIN_API_TOKEN`. Both are checked server-side.

## ADR-013 robots.txt: exact product-token groups, transient failures retry

**Context.** A live dry-run against 28 real feeds surfaced two bugs. (1) Substring group matching
let short agent names in a publisher's robots.txt capture our crawler and wrongly block a feed.
(2) A momentary network error fetching robots.txt was treated as "disallowed", which opened the
circuit and cached the result for 24 hours.

**Decision.** Groups are matched by exact, case-insensitive product token (RFC 9309 §2.2.1), with
fallback to `*`. "Unreachable" (5xx/network) raises the retryable `ROBOTS_UNREACHABLE` and is
cached for 10 minutes only. "Disallowed" stays a non-retryable `ROBOTS_DISALLOWED`.

## ADR-014 Terms review is enforced in code, not just policy

**Decision.** A real (non-fixture) feed cannot be activated, manually re-fetched or processed by
the worker until `termsReviewedAt` is recorded. This is checked in the admin service and again in
`runSource` as defence in depth. Activation goes through the admin console or
`npm run sources:activate` (both audit-logged).

## ADR-015 Job outcome semantics and the dead-letter queue

**Decision.**

- A transient error with attempts remaining throws `RetryableJobError`, and BullMQ retries it with
  jittered exponential backoff. Only the final attempt counts toward the source's circuit breaker.
- Any final failure throws `UnrecoverableError`, so the job is marked failed and copied to
  `frealgo-ingest-dlq`.
- The failure is always recorded on `IngestionRun` and `FeedSource` first, so freshness reporting
  never depends on queue state.

## ADR-016 Publisher-friendly User-Agent

**Context.** One publisher's CDN drops connections whose User-Agent contains a code-hosting URL.

**Decision.** The default UA is `FreAlgoFeedReader/0.1 (personal non-commercial reader)`. Operators
may append their own contact URL. We never spoof browser UAs.

## ADR-017 Country sheet without a portal

**Decision.** The sheet is a custom component, not a portal-based dialog library. Portals render
only after hydration, which would break the no-JavaScript path. On mobile it gets dialog semantics
(`role=dialog`, `aria-modal`, focus trap, inert background, Escape, focus return). On desktop it
stays a non-modal `region` so the map remains usable. Only the title row is fixed: notices,
sectors, filters and stories scroll together so nothing is pushed off-screen on short viewports.
Sector switching uses links with `aria-current`, not an ARIA tabs widget, because each sector is
its own URL.

## ADR-018 Relevance is textual only

**Decision.** `sort=relevance` ranks by `ts_rank_cd` over headline (A) and excerpt (B), plus
0.3 × trigram word similarity on the headline and a small bonus when the outlet name matches. The
score is rounded to 6 decimal places so keyset cursors are exact. No popularity, recency boost,
engagement or political signal is involved, and the UI and API say so.

## ADR-019 Steering text-search plans (Milestone 5)

**Context.** At 200 000 articles, broad and selective searches took 340–590 ms. The planner chose
full scans: it cannot estimate values hidden behind joins or InitPlans, it ignores the per-row
cost of pg_trgm's `<%`, and `ts_rank_cd` is expensive on rows that do not match.

**Decision.**

- Resolve outlet-name, sector and region filters to ids in small queries first.
- Keep the tsquery inline in `WHERE` (estimable), and evaluate it once (InitPlan) for scoring.
- Guard `ts_rank_cd` with `@@`.
- Run the two text-search statements in a transaction with `SET LOCAL enable_seqscan = off`.
  Every match branch is index-backed, so this only removes the bad option, and only for those
  statements.

**Consequences.** Selective search runs in ~3 ms and broad search in ~200 ms. Ranking semantics
are unchanged, except that negated terms no longer leak a rank. If a future Postgres version or
extension makes the planner cost-aware for trigram operators, drop the `SET LOCAL`. Re-run
`scripts/perf/explain-plans.ts` after any change to `lib/search/articles.ts`.

## ADR-020 No response cache for article lists

**Decision.** Only aggregate, non-editorial reads (country summaries, sectors, outlet registry)
use the in-process SWR cache, with single-flight cold loads. Article lists and search hit the
database on every request.

**Why.** Takedowns and story removals must disappear from every page and API immediately. A
per-instance cache would delay them by up to its TTL on other instances. The measured uncached
latency meets the budget except for broad search under sustained concurrency (see
`docs/performance.md`). A shared Redis cache with explicit invalidation is the next step if
traffic requires it.

## ADR-021 Versioned immutable static assets

**Decision.** Static map assets carry a version in the file name (`world-map.v2.svg`) and are
served `immutable` for a week. Any change to the generated output bumps the version: an in-place
change would leave cached browsers on the old file. v2 declares `color-scheme: dark`, because
browsers paint an opaque white backdrop behind an iframe whose color scheme differs from the
page's.
