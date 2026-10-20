# CLAUDE CODE MASTER PROMPT

## Mission and operating contract
Act as a principal full-stack architect, senior data engineer, information-retrieval engineer, accessibility specialist, and security-focused product engineer. Build a production-ready, **personal, ad-free, algorithm-free global news explorer**. The product is a finite, user-controlled information utility, not a social feed. Deliver working code, migrations, tests, documentation, and deployable infrastructure. Do not stop at mockups or pseudocode.

**Non-negotiable:** No advertising, affiliate ranking, engagement optimization, autoplay, infinite scroll, opaque personalization, or fabricated news. Explicit user filters and deterministic sorting are allowed. Do not equate a media outlet's general editorial orientation with the factual accuracy or ideology of an individual article. Label uncertain or disputed classifications clearly, with methodology, sources, review date, and appeal/correction workflow.

### Execution protocol
1. Inspect repository, package manager, environment, existing code, and CI before changing files. Preserve working code and user data.
2. Write `docs/architecture.md`, `docs/decisions.md`, `docs/source-policy.md`, and a milestone checklist. Record assumptions; ask only for blocking secrets, paid-resource consent, or irreversibly destructive decisions.
3. Implement milestones sequentially. After each: run formatting, typecheck, lint, unit/integration tests, build, and relevant end-to-end checks; repair failures before continuing.
4. Prefer small, reviewable commits and migration-safe changes. Never claim a test, live feed, or deployment succeeded without evidence.
5. Supply `.env.example`, seed data clearly marked as fixtures, and one-command local development with Docker Compose. No credentials in Git or browser bundles.
6. Where no API key or hosting account exists, implement functional local/demo mode and document precise remaining external gates; never silently substitute fabricated production data.

### Compatibility reference
Consult the official Next.js App Router documentation (https://nextjs.org/docs/app), current Prisma ORM quickstart (https://docs.prisma.io/docs/prisma-orm/quickstart/postgresql), and schema reference (https://docs.prisma.io/docs/orm/reference/prisma-schema-reference) before generating framework-specific configuration.

## 1. Product behavior and information ethics
- Landing experience: optional, short, elegant dark intro (maximum ~1.5 seconds), skip/reduce-motion support, and no forced repeat per session.
- Main stage: interactive globe with country selection; keyboard-accessible country picker and searchable list are equally capable alternatives.
- Country detail: stable, anchored responsive panel (desktop side sheet; mobile bottom sheet/full-screen dialog), with sectors: Politics, Business & Economics, Education, Technology, Agriculture, History & Context, Culture. Allow multi-sector tags.
- Each story card: headline, outlet, publication time and timezone, country relevance, sector tags, source URL, excerpt where licensed, language, source-level editorial orientation label and confidence/provenance, plus a clear distinction between source-level and article-level classifications.
- Source labels may include Left, Center-Left, Center, Center-Right, Right, Liberal, Conservative, Mixed/Varies, Unrated, and Disputed. **Do not put all labels on one false linear scale**: use a directional spectrum field plus separate descriptive ideology tags; liberal/conservative vary by national context.
- Make user-selectable filters for country, region, outlet, sector, language, publication period, source orientation, and keyword. Use deterministic newest-first / oldest-first / outlet-name sorting, plus optional transparent relevance matching for typed searches. Explain sorting in UI.
- Finite pagination (20–30 items per page), explicit Next/Previous, and an intentional “You are caught up” ending. No endless recommendation loops.
- Explicit coverage notices: missing country sources, stale feeds, paywalls, language gaps, and unequal media representation must be visible rather than disguised.
- Personal preferences stay local by default; server-side persistence is opt-in and requires an authenticated user. No behavioral profiles or cross-site tracking.
- Support multilingual metadata and Unicode; do not imply machine translations are original text. Use original publisher links rather than copying full copyrighted articles.

## 2. Recommended architecture and stack
- Frontend: Next.js App Router, React, TypeScript `strict`, Tailwind CSS with CSS-variable design tokens, Motion/Framer Motion for lightweight transitions, accessible headless dialog primitives.
- 3D: React Three Fiber + Three.js **or** Globe.gl behind a dynamically imported client-only component; do not simultaneously run two rendering engines. Use GeoJSON/TopoJSON boundary picking and stable ISO 3166-1 alpha-2 country codes. Use SSR-safe loading skeleton.
- Backend: Next.js Route Handlers for typed read APIs and preference endpoints; separate Node.js/TypeScript ingestion worker service. Use Zod for request, feed, and environment validation.
- Database: PostgreSQL 16+ and Prisma ORM. Use migrations, indices, unique constraints, foreign keys, and transaction-safe upserts. Pin compatible package versions at implementation time; avoid unverified claims about latest releases.
- Jobs: BullMQ + Redis preferred for durable retries, distributed locks, delayed work, observability, and per-source jobs. Node-cron is acceptable only for single-instance development; document that cron inside a serverless web process is unreliable. A scheduler enqueues source fetches every 3 hours; workers consume them independently. Never duplicate scheduling across replicas.
- Search: PostgreSQL full-text search (`tsvector` + GIN), `pg_trgm` for title/outlet fuzzy matching, and language-aware fallbacks. Implement migrations using raw SQL where Prisma schema lacks expression/index support. Consider Meilisearch/OpenSearch only after measuring scale.
- Infrastructure: Docker Compose (web, worker, postgres, redis), health checks, migrations, persistent volumes, CI, and an optional production deployment recipe. The web service and worker must be independently deployable.
- Telemetry: structured logs, source-fetch success rate, freshness age, error counts, job queue depth, latency, and WebGL failure rate **without invasive user tracking**.

### Data flow
`Approved publisher RSS/Atom or licensed API -> scheduled source jobs -> fetch with conditional HTTP/cache and rate limits -> parse/validate -> normalize time, country, language and sectors -> canonicalize URL -> deduplicate -> persist article metadata and attribution -> update searchable fields -> public query API -> globe/country/search UI.`

### Ingestion policy
- Maintain a curated, auditable source registry with publisher ownership, country, primary language, feed URL, allowed usage/license, political classification provenance, and active status.
- Prefer official RSS/Atom and licensed APIs; obey terms, robots rules where relevant, rate limits, attribution and takedown requests. Do not bypass paywalls, anti-bot systems, or access controls.
- Use ETag/If-Modified-Since, timeouts, bounded response size, retry with exponential backoff and jitter, per-host concurrency limits, dead-letter queue, and circuit breakers. Sanitize HTML and prohibit SSRF by validating protocols, resolving hostnames safely, blocking private/loopback/link-local addresses, and revalidating redirects.
- Parse publication timestamp defensively, retain original timestamps, and store UTC normalized timestamps. Reject or quarantine invalid payloads; keep ingestion audit logs.
- Deduplicate by `(outletId, externalId)` where available and canonical URL hash; cross-outlet near-duplicates may be grouped into `StoryCluster` without erasing independent coverage.
- Never infer factuality from political label. Automated classifier output, if added, must be separately marked machine-generated and never presented as verified editorial analysis.
- Every 3 hours means a **scheduled fetch attempt**, not guaranteed new articles. Surface `lastSuccessfulSyncAt`, `lastAttemptAt`, source freshness, and coverage limitations.

## 3. Prisma data model
Use the following as a **baseline** `prisma/schema.prisma` for Prisma ORM 7-style projects, then validate against the installed Prisma version and generate a migration. Prisma 8 may use a newer contract-based workflow: inspect the installed official documentation and translate this data model rather than copying incompatible configuration blindly. Configure the connection URL in `prisma.config.ts` (not in the datasource block) when using Prisma 7. For production, add SQL migrations for case-insensitive normalization and search indexes as needed.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Orientation {
  LEFT
  CENTER_LEFT
  CENTER
  CENTER_RIGHT
  RIGHT
  MIXED
  UNRATED
  DISPUTED
}

enum LabelStatus {
  REVIEWED
  PROVISIONAL
  DISPUTED
  UNRATED
}

enum ArticleStatus {
  PUBLISHED
  QUARANTINED
  REMOVED
}

enum FeedStatus {
  ACTIVE
  PAUSED
  ERROR
}

model Country {
  id        String        @id @default(cuid())
  iso2      String        @unique @db.VarChar(2)
  iso3      String        @unique @db.VarChar(3)
  name      String
  region    String?
  subregion String?
  outlets   MediaOutlet[]
  articles  ArticleCountry[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
}

model MediaOutlet {
  id                String          @id @default(cuid())
  name              String
  slug              String          @unique
  homepageUrl       String
  countryId         String?
  country           Country?        @relation(fields: [countryId], references: [id])
  primaryLanguage   String?
  ownershipNotes    String?
  orientation       Orientation     @default(UNRATED)
  ideologyTags      String[]        @default([])
  labelStatus       LabelStatus     @default(UNRATED)
  labelConfidence   Float?
  labelMethodology  String?
  labelSourceUrl    String?
  labelReviewedAt   DateTime?
  labelContext      String?
  feeds             FeedSource[]
  articles          Article[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  @@index([countryId, orientation])
}

model FeedSource {
  id                    String       @id @default(cuid())
  outletId              String
  outlet                MediaOutlet  @relation(fields: [outletId], references: [id], onDelete: Cascade)
  url                   String       @unique
  kind                  String       // RSS, ATOM, LICENSED_API
  status                FeedStatus   @default(ACTIVE)
  etag                  String?
  lastModifiedHeader    String?
  lastAttemptAt         DateTime?
  lastSuccessfulSyncAt  DateTime?
  lastError             String?
  failureCount          Int          @default(0)
  nextEligibleFetchAt   DateTime?
  licenseNotes          String?
  articles              Article[]
  @@index([status, nextEligibleFetchAt])
}

model Sector {
  id        String          @id @default(cuid())
  slug      String          @unique
  name      String
  articles  ArticleSector[]
  createdAt DateTime        @default(now())
}

model Article {
  id               String          @id @default(cuid())
  outletId         String
  outlet           MediaOutlet     @relation(fields: [outletId], references: [id])
  feedSourceId     String?
  feedSource       FeedSource?     @relation(fields: [feedSourceId], references: [id], onDelete: SetNull)
  externalId       String?
  canonicalUrl     String
  canonicalUrlHash String          @unique @db.VarChar(64)
  title            String
  excerpt          String?         @db.Text
  language         String?
  author           String?
  imageUrl         String?
  publishedAt      DateTime
  firstSeenAt      DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  status           ArticleStatus   @default(PUBLISHED)
  articleLabel     Orientation?
  articleLabelNote String?
  countries        ArticleCountry[]
  sectors          ArticleSector[]
  @@index([publishedAt(sort: Desc), id])
  @@index([outletId, publishedAt(sort: Desc)])
  @@index([status, publishedAt(sort: Desc)])
  @@unique([outletId, externalId])
}

model ArticleCountry {
  articleId String
  countryId String
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  country   Country @relation(fields: [countryId], references: [id], onDelete: Cascade)
  @@id([articleId, countryId])
  @@index([countryId, articleId])
}

model ArticleSector {
  articleId String
  sectorId  String
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  sector    Sector  @relation(fields: [sectorId], references: [id], onDelete: Cascade)
  @@id([articleId, sectorId])
  @@index([sectorId, articleId])
}

model UserPreference {
  id                    String    @id @default(cuid())
  userId                String    @unique // authenticated external identity; do not store anonymous fingerprints
  selectedCountryIso2   String[]  @default([])
  selectedOutletIds     String[]  @default([])
  selectedSectorSlugs   String[]  @default([])
  selectedOrientations  Orientation[] @default([])
  selectedLanguages     String[]  @default([])
  preferredSort         String    @default("newest")
  reducedMotion         Boolean   @default(false)
  globeEnabled          Boolean   @default(true)
  updatedAt             DateTime  @updatedAt
  createdAt             DateTime  @default(now())
}

model IngestionRun {
  id           String    @id @default(cuid())
  feedSourceId String
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
  status       String
  fetchedCount Int       @default(0)
  insertedCount Int      @default(0)
  errorCode    String?
  errorDetail  String?
  @@index([feedSourceId, startedAt(sort: Desc)])
}
```

**Schema requirements:** enforce `0 <= labelConfidence <= 1` via SQL CHECK; ensure ISO codes are normalized; store only necessary personal data; include migration/rollback guidance; use cursor pagination `(publishedAt, id)`; define retention and cleanup for audit logs; create explicit indexes for common country/sector/outlet filters; consider an optional `StoryCluster` and `OutletLabelHistory` in later migrations. Do not claim this schema is complete for every possible production scale without profiling.

## 4. API contracts and search behavior
Implement and document versioned endpoints with Zod validation, stable errors, pagination, cache headers, and rate limits:
- `GET /api/v1/countries` — ISO codes, display names, article counts and freshness.
- `GET /api/v1/countries/:iso2/articles?sector=&outlet=&orientation=&language=&from=&to=&sort=&cursor=&limit=`.
- `GET /api/v1/articles/search?q=&country=&sector=&outlet=&orientation=&language=&from=&to=&sort=&cursor=`.
- `GET /api/v1/outlets` — outlet labels, confidence, sources, status, country and methodology.
- `GET /api/v1/sectors` and `GET /api/v1/health/freshness`.
- Authenticated opt-in `GET/PUT /api/v1/me/preferences`; do not expose public preference writes or infer identity from IP.
- Separate protected worker/admin interfaces for source management and manual re-fetch; authorization enforced server-side, not just hidden UI buttons.

Use safe parameterized queries, query cost limits, and server-side allowlists for sort fields. `q` should match headline, excerpt, and outlet name where supported. For keyword search, explain that textual relevance is not a political/engagement ranking. Search results should support source transparency and user-chosen ordering.

## 5. UX design system and interaction specification
### Tokens
- `--bg: #000000`; `--surface: #090D16`; `--surface-raised: #101827`; `--text: #F8FAFC`; `--muted: #A6B2C3`; `--accent: #1D9BFF`; `--accent-hover: #65BEFF`; `--border: #233044`; `--focus: #8CD1FF`; `--danger: #FF6B75`.
- Use color semantics consistently and verify WCAG AA text contrast (4.5:1 for regular text, 3:1 for large text and key UI boundaries). Avoid glowing text, flashing effects, or neon-on-black body copy.
- Typography: readable system/variable font, 16px+ body, comfortable line-height ~1.55–1.7, bounded reading measure 60–75 characters, explicit information hierarchy.
- Desktop: globe-centered stage, left navigation/filter rail, right anchored country sheet. Mobile: globe or accessible list toggle, bottom sheet with drag handle plus explicit close button, thumb-friendly controls at least 44x44 CSS px.
- Respect safe areas, dynamic viewport units, on-screen keyboard, zoom up to 200%, orientation changes, and screen readers. Use visible focus rings and logical tab order.
- Prevent cognitive overload: progressive disclosure, a short filter summary, reversible choices, obvious reset, finite results, neutral empty states, and no notification badges or urgency tricks.
- Country panel maintains predictable position across country changes (spatial memory), preserves selected tab and scroll only when appropriate, and supports deep-linking to `?country=MM&sector=agriculture`.
- Animations: intro fade/line reveal ≤1.5s; modal open/close 180–260ms; no layout-thrashing animation. Honor `prefers-reduced-motion` by eliminating nonessential motion.
- Label UI: accessible text + tooltip/methodology link, never only color. Include “Unrated” and “Disputed” states; do not automatically color political orientation as morally good/bad.

### Globe and fallback requirements
- Dynamically import the globe with SSR disabled; do not initialize WebGL until visible. Cap device pixel ratio (e.g. `min(devicePixelRatio, 1.5)` mobile), reduce geometry detail and antialiasing, throttle pointer picking, avoid unnecessary continuous render, dispose geometries/materials on unmount, and pause rendering when hidden.
- Adaptive quality based on device memory, reduced motion, frame-time measurements, battery/network hints where available; avoid treating all phones equally.
- Touch: single-finger rotate, pinch zoom with bounded scale, tap country; distinguish tap from drag, prevent gesture conflicts with scroll/sheet.
- WebGL capability check and `webglcontextlost` recovery; if unsupported or repeatedly lost, show performant SVG/2D map and full searchable country list. The entire news workflow must remain usable without 3D or JavaScript-heavy effects.
- Avoid huge globe texture downloads; lazy-load optimized assets with explicit attribution and licenses. Test low-end Android, iOS Safari, desktop Safari/Chrome/Firefox, and keyboard-only operation.

## 6. Security, privacy, accessibility, reliability
- Implement CSP, secure headers, safe external links (`rel="noopener noreferrer"`), input validation, output escaping, feed HTML sanitization, SSRF protection, dependency scanning, secrets management, least-privilege DB/Redis access, and rate limiting.
- No browser-exposed feed API keys; no unlicensed redistribution of full publisher content; document attribution, correction, removal and takedown handling.
- GDPR/CCPA considerations: minimize storage, disclose optional preferences, enable export/delete when accounts are introduced; no cookies except essential functionality without consent requirements review.
- Accessibility target WCAG 2.2 AA, including dialogs, keyboard map alternative, focus trap/return, escape behavior, reduced motion, semantic headings, live-region updates without noise.
- Resilience: stale-while-revalidate read cache, source-level failure isolation, idempotent upserts, graceful queue degradation, bounded jobs, database backup/restore drill, structured error reporting, and SLOs.
- Example SLO targets (validate under load): read API p95 < 500ms cached, LCP < 2.5s on representative mid-range mobile, no main-thread long-task regressions, and 99% of active feeds attempted within their scheduled 3-hour window plus documented tolerance.

## 7. Repository structure
```text
app/                       # App Router pages, layouts, loading/error boundaries
app/api/v1/                # versioned route handlers
components/globe/          # 3D globe, 2D fallback, country picker
components/news/           # country sheet, filters, cards, source labels
components/ui/             # accessible primitives
lib/api/                   # validated query contracts
lib/search/                # deterministic query construction
lib/db/                    # Prisma singleton and repositories
lib/preferences/           # local defaults and optional sync
workers/                   # BullMQ scheduler, processors, adapters
workers/providers/         # RSS, Atom, licensed APIs
prisma/schema.prisma
prisma/migrations/
prisma/seed.ts
tests/unit/
tests/integration/
tests/e2e/
docs/architecture.md
docs/source-policy.md
docs/decisions.md
docs/operations.md
docker-compose.yml
.env.example
.github/workflows/ci.yml
```

## 8. Five sequential, testable milestones
### Milestone 1 — Foundation and design system
**Build:** scaffold Next.js/TypeScript/Tailwind, dependency pinning, Prisma/Postgres/Redis Docker Compose, initial migration, seed countries/sectors and fixture outlets/articles, UI tokens, landing animation, navigation shell, CI and health checks.
**Acceptance:** one-command local boot; migration and seed repeat safely; app builds without TypeScript errors; mobile/desktop shell works; reduced-motion intro bypass works; CI green.

### Milestone 2 — Reliable ingestion and source governance
**Build:** source registry, RSS/Atom adapter, optional licensed API adapter, queue scheduler/worker, 3-hour cadence, conditional HTTP, retry/backoff, validation, sanitization, URL canonicalization, deduplication, country/sector tagging with auditable rules, ingestion metrics, source label provenance, quarantine and admin operations.
**Acceptance:** deterministic fixture feeds ingest once despite retries; changed entries upsert; bad payloads quarantine; SSRF tests block internal hosts/redirects; mocked clock proves 3-hour enqueue cadence; failure of one source does not stop others; freshness status is truthful.

### Milestone 3 — News APIs, search, and country workspace
**Build:** typed API contracts, cursor pagination, SQL full-text/trigram search, filters, country side sheet/mobile bottom sheet, source methodology, finite pages, deep links, empty/loading/error states, opt-in preferences with local-only default.
**Acceptance:** integration tests cover multi-filter intersection, search, deterministic sorting, cursor boundaries, invalid params, auth boundaries, and no duplicates; accessible dialog and keyboard flow verified; country page works with 3D disabled.

### Milestone 4 — Interactive globe and polished responsive UX
**Build:** dynamically imported globe, ISO boundary selection, touch gestures, zoom bounds, anchored panel transitions, adaptive quality, 2D/SVG/list fallback, responsive breakpoints, progressive loading and motion preferences.
**Acceptance:** Playwright desktop/mobile tests cover country click/tap, touch-vs-drag, keyboard alternative, deep links, panel state, fallback after simulated WebGL failure, focus restoration; run Lighthouse and profile representative low-end hardware; document measured FPS/memory and fixes.

### Milestone 5 — Production hardening, release, and handover
**Build:** security review, license/source audit, observability, CI/CD, production Compose or platform deployment recipe, migrations/backup/restore, load tests, privacy/accessibility audit, operations runbook, smoke tests, documented deployment checklist.
**Acceptance:** lint/typecheck/unit/integration/e2e/build pass; zero known critical vulnerabilities; restore drill succeeds; scheduled worker observed; source freshness and provenance visible; mobile/desktop smoke tests pass; external secrets/hosting gates listed explicitly if blocked. Provide release summary, commit hashes, screenshots, limitations, and next actions.

## 9. Mandatory testing matrix
- Unit: orientation taxonomy and labels, URL canonicalization, date normalization, country mapping, sector rules, query parser, cursor generation, preference serialization.
- Integration: Prisma migrations, transactional upsert, queue retry/idempotency, ETag 304 handling, source failures, permission checks, multi-dimensional filtering and SQL injection resistance.
- E2E: welcome skip, search and filters, country navigation, panel accessibility, finite pagination, source attribution links, small screens, reduced motion, WebGL unavailable, slow network/offline states.
- Performance: realistic article counts, mobile bundle analysis, globe frame-time, DB EXPLAIN plans, job throughput and memory limits.
- Editorial quality: randomly sampled outlet labels trace to a cited methodology and review date; disputed/unrated outlets display accurately; no article is mislabeled solely by source orientation.

## 10. Delivery and communication format
At the start, report repo inventory, selected compatible versions, architecture choices, and blocking unknowns. At the end of **each** milestone provide: files changed, commands run, test evidence, known limitations, and next milestone. Continue automatically to the next milestone when gates pass. Do not ask for routine confirmation.

Final deliverables: working source, database migrations, seed scripts, fixture data, worker and scheduler, production-capable UI with fallback, tests, CI, deployment docs, editorial methodology and source registry, README, `.env.example`, and a release readiness report.

**Definition of done:** a user can open the app on desktop/mobile, navigate countries with or without WebGL, search and filter transparently, see source-level bias metadata with provenance, open original news links, and observe real scheduled feed freshness. The system has no ads, algorithmic engagement feed, or infinite scroll, and can be deployed with clear operational and security documentation.

## 11. Decisions Claude Code must not conceal
- Source coverage will be uneven across countries and languages; report it.
- Political bias is context-dependent and disputed; preserve uncertainty and methodology.
- The 3-hour worker requires persistent scheduled execution; do not rely on a sleeping web instance.
- Personalization is explicit preference storage, not behavioral ranking.
- Any use of third-party news APIs, map assets, or article images must pass license and cost review.
- If a deployment credential, paid account, or legally required permission is missing, complete all offline-testable work and clearly identify the external gate instead of claiming production deployment.

**Begin now with repository inspection and Milestone 1.**
