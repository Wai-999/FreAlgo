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
