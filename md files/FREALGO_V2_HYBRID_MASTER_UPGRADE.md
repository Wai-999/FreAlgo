# FreAlgo 2.0 — Purpose-Driven Hybrid Master Upgrade Package

> **Audience:** Claude Code acting as principal architect, full-stack engineer, data engineer, editorial-integrity specialist, UX designer, security engineer, and QA lead.  
> **Target:** Existing FreAlgo application at `https://frealgo.duckdns.org/`.  
> **Instruction:** This is an **in-place, incremental upgrade**, not authorization to rewrite or redeploy without inspection.  
> **Status:** Specification and execution instructions; not a claim that features have been implemented.

## 0. Executive command for Claude Code

Inspect the repository, deployment configuration, and running application before changing code. Read this entire document, produce a concise evidence-based baseline and architecture decision record, then execute the milestone plan in order. Keep the current working features operational. Make implementation decisions autonomously when reversible and low-risk; request approval for credentials, paid services, destructive migrations, production cutovers, and other irreversible actions. Do not claim completion without tests and evidence. If external access is blocked, continue with locally testable work and report the exact blocker.

## 1. Product constitution — non-negotiable

**Mission:** A personal, independent, ad-free, algorithm-free global news platform that helps people discover reporting across countries, sectors, languages, and political perspectives, then understand the historical and geographic relationships between stories.

**North star:** Information freedom and comprehension outrank engagement, clicks, retention, or time-on-site. Delight comes from curiosity, beautiful geography, and meaningful discovery—not manipulation.

1. **No ads, sponsored ranking, paid placement, dark patterns, infinite scrolling, autoplay, engagement-driven recommendations, streaks, addictive notifications, or behavioral profiling.**
2. **Transparent ordering:** default newest-first; optional oldest-first, alphabetical, outlet, country, sector, and deterministic discovery. Never silently rank by engagement or ideology. Explain exactly why each article appears.
3. **Political diversity without false equivalence:** report what sources actually say; do not invent ideological balance, equate unsupported claims with established facts, or assign an article its publisher's political orientation by default.
4. **Source-first integrity:** link original reporting, preserve attribution, distinguish reporting from commentary, mark uncertain metadata, and label AI-derived summaries.
5. **Global inclusion:** measure coverage gaps; prioritize underserved regions and local-language sources rather than over-indexing on English-language outlets.
6. **User autonomy:** explicit choices for countries, sectors, languages, sources, perspectives, reading depth, and motion. Local-first preferences where feasible.
7. **Calm, accessible UX:** keyboard and screen-reader support, reduced-motion options, readable contrast, finite pages, predictable navigation, and graceful low-end-device operation.
8. **Every feature must demonstrably improve at least one of:** access, comprehension, transparency, exploration, or accessibility—and must not harm the others.

**Feature rejection gate:** For each proposed feature, answer: (a) why does it serve the mission? (b) can the user disable it? (c) what evidence supports its content? (d) how does it perform on mobile? (e) does it create engagement manipulation? Reject or redesign failures.

## 2. Current public-site baseline and verification

At specification time the public HTML at `https://frealgo.duckdns.org/` exposes navigation for Explore, Search, Sources, Freshness, Methodology, About, and Settings; a country map/list switch; a search field; and **21 of 250 countries/territories with registered sources**. Sample visible counts: United Kingdom 49, United States 12, Brazil 10, Myanmar 2; Japan and Germany 0; Thailand no sources. These are **page observations, not a database audit**. Do not hard-code them or assume they remain current. The public crawler does not verify actual 3D rendering, animation, mobile interactions, authentication, or backend implementation.

**Mandatory initial audit:**
- Identify framework/version, package manager, routing, source tree, actual globe library, deployment and domain setup, existing DB schema, scheduled jobs, queues, secrets handling, and operational metrics.
- Inspect current routes and preserve all existing public URLs or provide tested redirects.
- Run existing test/build/lint/typecheck suites and capture results.
- Verify ingestion by source, country, publication language, last successful fetch, error rate, and article freshness; distinguish **publisher headquarters**, **article's subject country**, **event location**, and **country of publication**.
- Check mobile at 360/390/430 px; tablet 768 px; desktop 1280/1440 px; 200% zoom; keyboard; reduced-motion; WebGL disabled; slow network; and device memory pressure.
- Record before/after screenshots, performance budgets, and known defects. Do not describe untested visuals as verified defects.

Deliver `docs/audit/baseline.md`, `docs/architecture/adr-001-hybrid-upgrade.md`, and `docs/audit/coverage-baseline.json` with measurement timestamps and methods.

## 3. Target information architecture

Primary navigation: **Explore | Stories | Discover | Perspectives | My World**. Preserve and link existing **Search, Sources, Freshness, Methodology, About, Settings** rather than burying transparency pages. Deep-linkable route state; browser back/forward must work.

### Explore — geographic entry
- Prominent interactive globe on capable desktop devices; immediately accessible story panel and country search.
- Tap/click/keyboard-select country to open a spatially consistent side panel (desktop) or bottom sheet (mobile), with country summary, fresh articles, sectors, source diversity, and links to original reports.
- Toggle **Globe / Accessible 2D Map / Country List**. Country list always works even if 3D fails.
- **World Pulse:** visually encode measured article activity or verified event locations, not 'importance' or fabricated real-time events. Provide legend, timestamp, counts, and normalization notes; avoid implying absence of coverage means absence of events.
- **Country connections:** edges represent evidenced shared event clusters, trade relationships backed by datasets, or explicitly sourced historical links; clearly label relationship type and date.

### Stories — calm reading
- Paginated finite story collections; stable chronological sorting; cards with title, publisher, publication time, topic, geographic relevance, language, provenance, and clear source link.
- Three reading depths: **Quick Overview**, **Deep Context**, **Original Reporting**. Summaries require linked source excerpts/attribution and confidence/limitations. Never present model output as independently verified reporting.
- **Story Mode:** What happened? Where? Why does it matter? What do sources report? What remains uncertain? What are the next known dates? Each claim has source traceability.
- Cluster related articles into events while preserving every individual article, original headline, date, and outlet.

### Discover — fun through curiosity
- **Surprise Me:** explicit button selecting from eligible countries/stories using a documented uniform or seeded method, with optional region/language/sector constraints. No covert engagement weighting. Explain selection method.
- **Daily World Discovery:** one dated, editor-defined or deterministic discovery, with source citations and archive. Do not manufacture a new 'daily' feature when no qualifying story exists.
- **World Story Journeys:** optional guided sequence of geographically connected, evidenced story nodes. Example themes: supply chains, migration, climate, agriculture, scientific cooperation. Each step explains connection, sources, and uncertainty. Pause/skip, plain-text alternative, and reduced motion.
- **Historical Context Timeline:** only sourced, dated events; distinguish historical facts, interpretations, and speculative analogies. Link primary or reliable secondary sources.
- Optional short 'What did you learn?' knowledge checks with explanations; no streaks, leaderboards, or pressure loops.
- **Constructive Developments** category: source-backed progress, not artificially upbeat framing or concealment of difficult news.

### Perspectives — transparent comparison
- Compare actual reporting on the same event from multiple publishers and, where evidenced, ideological orientations.
- Distinguish **outlet-level orientation**, **article-specific framing**, **news vs opinion**, **country-specific political vocabulary**, and **unknown/disputed**.
- Bias labels must include methodology, rater/provider, geography, evidence URL, assessment date, and caveats. Never invent ratings or apply a universal left/right axis uncritically.
- Display coverage gaps: missing sources/perspectives in **the ingested corpus**, not proof that perspectives do not exist.
- Side-by-side cards: verified common facts, different emphases, claims in dispute, citations, and publication times. Never hallucinate quotations or agreement.

### My World — explicit personalization
- User-selected countries, sectors, languages, outlets, source exclusions, reading density, motion, and preferred sort.
- Anonymous local storage by default; optional account sync only if already present or explicitly approved. No behavior-derived ranking.
- **Why am I seeing this?** per article: selected country/topic/source filters, sort rule, source match, and relevant timestamp.
- Provide export/reset of preferences; no opaque tracking.

## 4. Visual system and UX psychology

Palette tokens (adjust only if contrast tests require):

```css
:root {
  --bg: #05070b;
  --surface: #10151f;
  --surface-raised: #172130;
  --text: #f5f7fa;
  --text-muted: #a6b0c0;
  --accent: #00b8ff;
  --border: #243044;
  --focus: #77d7ff;
  --danger: #ff7373;
  --success: #5ee0aa;
}
```

- Dark, minimalist, editorial—not neon overload. Use electric blue sparingly for focus, selected map entities, and primary actions.
- Typography: Geist or Inter with robust Myanmar and multilingual fallback; support right-to-left text and locale-aware dates.
- Progressive disclosure: first show country, story title, timestamp, source; reveal deeper layers on request.
- Consistent spatial memory: desktop country drawer stays on the same side; mobile bottom sheet with clear drag handle, back behavior, and focus restoration.
- Welcome intro: subtle optional 0.6–1.2s animation on first visit; skip control; never delay usable content; respect `prefers-reduced-motion`; avoid flashing and excessive camera movement.
- Minimum 44×44 CSS-pixel touch targets; clear focus ring; meaningful headings and landmarks; readable line length; avoid overlays covering globe controls.
- Never encode ideology or importance using color alone. Provide textual labels and legends.
- Use motion to explain geography/relationships, not to prolong sessions. Disable animation for reduced-motion and provide manual navigation.
- Skeletons should not hide failures: show explicit empty, stale, offline, error, and retry states.

## 5. Reference architecture — adapt to actual repository

Preferred stack **only if compatible with existing project**: Next.js App Router + TypeScript + Tailwind CSS; React Three Fiber/Three.js or existing globe library; Motion/Framer Motion; PostgreSQL + Prisma; BullMQ + Redis for reliable workers, or node-cron only for single-instance deployments with explicit locking and restart behavior.

```text
Publisher RSS/Atom/APIs → source registry → fetch workers → validation & sanitization
    → normalization → language & geography tagging → deduplication → event clustering
    → provenance & editorial labels → PostgreSQL → typed query/search API
    → Explore / Stories / Discover / Perspectives / My World
                                   ↘ diagnostics, source health, coverage metrics
```

- Keep scheduled jobs out of serverless request handlers. Every three hours, enqueue source fetches with idempotency keys, retries/backoff, per-domain rate limits, timeouts, conditional GET (ETag/Last-Modified), and distributed locks when needed.
- Track last attempt, last success, article publication time, source lag, failure reason, and partial failures. Display **data freshness**, not just job runtime.
- No arbitrary web scraping of copyrighted full text. Respect publisher terms, robots restrictions where applicable, attribution, and licenses. Store only permitted metadata/excerpts; link to original.
- Prevent SSRF: validated allowlisted source hosts, DNS/IP revalidation, reject private/link-local/metadata IPs and redirects to blocked destinations; bound response size and decompression.
- Sanitize HTML, normalize canonical URLs, detect duplicates using URL normalization and content fingerprints, preserve original-language titles.
- Search: start with PostgreSQL full-text + trigram indexes; assess multilingual support, especially Burmese and scripts without whitespace; add dedicated search service only if evidence requires it.
- LLM features are optional and behind explicit feature flags; enforce citations, schema-validated outputs, evaluation datasets, caching, cost caps, and graceful non-AI fallback.
- Use public data responsibly: no claim of fact-checking merely because multiple publishers repeat a claim.

## 6. Data model — Prisma reference blueprint

The following is a **conceptual Prisma 6/7-adaptable baseline**, not an instruction to overwrite the existing schema. Inspect installed Prisma version, datasource configuration, naming, migration history, and generated client path first. For Prisma versions requiring datasource URL configuration outside `schema.prisma`, follow the installed version's supported configuration. Map onto existing tables through additive migrations.

```prisma
model Country {
  id          String   @id @default(cuid())
  iso2        String   @unique @db.VarChar(2)
  iso3        String?  @unique @db.VarChar(3)
  name        String
  region      String?
  subjectTags ArticleCountry[]
  homeOutlets MediaOutlet[]
  journeyNodes JourneyNode[]
}

model MediaOutlet {
  id           String   @id @default(cuid())
  name         String
  website      String   @unique
  homeCountryId String?
  homeCountry   Country? @relation(fields: [homeCountryId], references: [id])
  languageCode  String?
  outletType    String?  // publisher, broadcaster, wire, etc.
  active        Boolean  @default(true)
  feeds         FeedSource[]
  articles      Article[]
  biasRatings   OutletBiasRating[]
}

model FeedSource {
  id             String    @id @default(cuid())
  outletId       String
  outlet         MediaOutlet @relation(fields: [outletId], references: [id])
  url            String    @unique
  format         String    // rss, atom, licensed_api
  enabled        Boolean   @default(true)
  lastAttemptAt  DateTime?
  lastSuccessAt  DateTime?
  lastError      String?
  etag           String?
  lastModified   String?
  articles       Article[]
}

model Sector {
  id       String @id @default(cuid())
  slug     String @unique
  name     String
  articles ArticleSector[]
}

model Article {
  id            String   @id @default(cuid())
  outletId      String
  outlet        MediaOutlet @relation(fields: [outletId], references: [id])
  feedId        String?
  feed          FeedSource? @relation(fields: [feedId], references: [id])
  canonicalUrl  String   @unique
  title         String
  excerpt       String?  @db.Text
  languageCode  String?
  publishedAt   DateTime?
  fetchedAt     DateTime @default(now())
  contentHash   String?
  articleType   String? // news, opinion, analysis, unknown
  countries     ArticleCountry[]
  sectors       ArticleSector[]
  eventLinks    EventArticle[]
  @@index([publishedAt])
  @@index([outletId, publishedAt])
}

model ArticleCountry {
  articleId String
  countryId String
  role      String // subject, event_location, publisher_context
  evidence  String?
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  country   Country @relation(fields: [countryId], references: [id])
  @@id([articleId, countryId, role])
  @@index([countryId, role])
}

model ArticleSector {
  articleId String
  sectorId  String
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  sector    Sector  @relation(fields: [sectorId], references: [id])
  @@id([articleId, sectorId])
}

model OutletBiasRating {
  id           String   @id @default(cuid())
  outletId     String
  outlet       MediaOutlet @relation(fields: [outletId], references: [id])
  axis         String // political orientation, not credibility
  label        String // e.g. center-left; unknown/disputed supported
  jurisdiction String?
  assessor     String
  methodologyUrl String?
  evidenceUrl  String?
  assessedAt   DateTime?
  notes        String? @db.Text
  @@index([outletId, axis])
}

model NewsEvent {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  summary     String?  @db.Text
  startAt     DateTime?
  updatedAt   DateTime @updatedAt
  articles    EventArticle[]
  journeyNodes JourneyNode[]
}

model EventArticle {
  eventId    String
  articleId  String
  event      NewsEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  article    Article   @relation(fields: [articleId], references: [id], onDelete: Cascade)
  @@id([eventId, articleId])
}

model StoryJourney {
  id          String @id @default(cuid())
  slug        String @unique
  title       String
  description String? @db.Text
  nodes       JourneyNode[]
}

model JourneyNode {
  id          String @id @default(cuid())
  journeyId   String
  journey     StoryJourney @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  position    Int
  countryId   String
  country     Country @relation(fields: [countryId], references: [id])
  eventId     String?
  event       NewsEvent? @relation(fields: [eventId], references: [id])
  explanation String @db.Text
  evidenceUrl String?
  @@unique([journeyId, position])
}

model UserPreference {
  id            String   @id @default(cuid())
  userId        String?  @unique // null for optional anonymous server profiles; prefer local-only
  selectedIso2  String[]
  sectorSlugs   String[]
  outletIds     String[]
  languages     String[]
  sortMode      String   @default("newest")
  reduceMotion  Boolean  @default(false)
  updatedAt     DateTime @updatedAt
}
```

**Migration notes:** For an existing `User` model, add a proper FK rather than a free-form `userId`; if preferences are browser-local, do not create server records unnecessarily. Add source assessment audit trails, claims/evidence tables, historical timeline events, and localization only when corresponding features are implemented. Preserve original records and run migration dry-runs/backups. No invented source ratings or historical links.

## 7. API and contract requirements

Use typed, validated contracts (Zod or equivalent), strict pagination, stable sort keys, bounded page size, caching, and explicit error envelopes.

Proposed endpoints/routes (adapt to existing routes):
- `GET /api/countries?withCoverage=true` — country coverage, counts, last refresh.
- `GET /api/articles?country=MM&sector=agriculture&sort=newest&cursor=...` — provenance-preserving results.
- `GET /api/events/:id` — event cluster and underlying articles.
- `GET /api/events/:id/perspectives` — assessed source viewpoints and missing-coverage caveat.
- `GET /api/journeys/:slug` — sourced country sequence.
- `GET /api/discover/random?seed=...` — documented selection and eligible pool.
- `GET /api/sources/health` — public-safe source freshness without leaking secrets.
- `GET /api/methodology` — ranking, classification, selection, and sourcing explanations.

Validate user input and permissions. Keep administration endpoints authenticated and protected. Never expose API keys, credentials, private source endpoints, or internal exception traces.

## 8. Globe engineering and fallbacks

- Use current globe implementation if sound; do not stack Globe.gl and React Three Fiber unnecessarily. Select one rendering ownership model.
- Lazy-load globe, suspend rendering when offscreen or tab hidden, cap device pixel ratio (e.g. 1–1.5 on constrained devices), limit textures and geometry, avoid unnecessary postprocessing and particle effects.
- Use `requestAnimationFrame` only while interaction/animation is active; throttle pointer updates; clean up GPU buffers and event listeners.
- Support WebGL context loss/recovery; render accessible 2D map or country list if WebGL unavailable.
- Disable auto-rotation by default or stop immediately on user interaction; motion optional.
- Country popup/drawer must work with keyboard and touch, and preserve current filters/deep link.
- Avoid heatmap colors that imply subjective importance; document the metric and denominator.

## 9. Internationalization, accessibility, and content ethics

- Store Unicode text without destructive transliteration; handle Burmese typography, fonts, tokenization, and line breaking carefully.
- Display original headline language and optional clearly labeled translations; never silently overwrite originals.
- WCAG 2.2 AA target: landmarks, semantic labels, contrast, focus management, modal trapping/restoration, touch targets, and no keyboard traps.
- Provide a text equivalent for every globe-only interaction and animation.
- Do not present 'left/center/right' as universal or objective; explain local political context and disagreements.
- Prevent misinformation laundering: sourced claims, clear uncertainty, distinguish commentary from facts, and no fabricated citations.
- Comply with licensing; excerpts only where permitted. Do not scrape/paywall-bypass copyrighted articles.

## 10. Security, privacy, and operations

- Secrets in server-side environment only; `.env.example` contains placeholders. Rotate any exposed secrets.
- SSRF-resistant fetching, request limits, XML parser hardening, HTML sanitization, content security policy, dependency scanning, and rate limits.
- Minimum collection of analytics; no third-party behavioral trackers. Prefer aggregate privacy-preserving operational metrics.
- Structured logs with request/job correlation IDs and redaction; alerts for feed failures, queue lag, stale content, DB errors, and deployment regressions.
- PostgreSQL backups with documented restore test, migration rollback/forward plan, health/readiness endpoints, and worker deployment independent from web runtime.
- Explicit cost/resource budget; do not provision paid infrastructure without approval.
- Respect existing DuckDNS/domain/TLS arrangement; do not assume access to DNS credentials.

## 11. Five sequential, independently testable milestones

### M1 — Baseline, safety, and architecture
**Implement:** repo audit, baseline metrics, design tokens, route map, feature flags, CI smoke tests, DB backup and migration plan, mobile/accessibility baseline. Preserve existing functionality.
**Acceptance:** current routes work; lint/typecheck/build/test baseline captured; documented architecture decisions; no production mutation; measurable coverage baseline.
**Artifacts:** `docs/audit/*`, `docs/architecture/*`, `docs/roadmap/status.md`.

### M2 — Reliable global coverage and provenance
**Implement:** source registry, health diagnostics, scheduled three-hour fetches, normalized articles, source-country vs subject-country separation, deduplication, multilingual tagging, sector tagging, pagination, coverage metrics, safe retries. Add sources only with verified permissions and actual reachable feeds.
**Acceptance:** repeatable fixture-based ingest; idempotent reruns; source outage does not stop other sources; correct country assignment on cross-border story; stale/empty states visible; scheduler tested without requiring production secrets.
**Artifacts:** migrations, worker tests, ingestion runbook, source registry and gap report.

### M3 — Hybrid editorial UX and My World
**Implement:** responsive Explore/Stories/Discover/Perspectives/My World navigation, refined cards, country drawer, Quick/Deep/Original modes, finite pages, advanced filters, deterministic Surprise Me, explicit preferences, Why Am I Seeing This?, polished welcome animation with skip/reduced-motion.
**Acceptance:** 360px-to-desktop layouts with no horizontal overflow; keyboard and screen-reader flows; user filter persistence; no engagement sorting or infinite scroll; original links work; mobile smoke tests.
**Artifacts:** screenshots, interaction tests, accessibility report.

### M4 — Evidence-backed intelligence and discovery
**Implement:** event clustering, multi-outlet Perspective Explorer, sourced timelines, Story Journeys, optional World Pulse and country connection overlays. Use feature flags and fixtures when external datasets are unavailable.
**Acceptance:** no hallucinated labels, relationships, or summaries; event cluster links to originals; gaps/unknown ratings handled; 2D/text equivalent exists; user can disable motion and journeys.
**Artifacts:** provenance/evaluation report, data quality tests, representative story fixtures.

### M5 — Performance, security, deployment, and handoff
**Implement:** globe performance tuning, accessibility remediation, ingestion load/recovery tests, security checks, backups/restore rehearsal, deployment runbook, staged rollout, production smoke verification and rollback plan.
**Acceptance:** performance and accessibility budgets documented with actual measurements; no critical security findings; worker survives restart; failed deploy can roll back; production release only after approval if needed.
**Artifacts:** `docs/release/acceptance.md`, `docs/release/rollback.md`, `docs/operations/runbook.md`, final implementation summary.

## 12. Performance and quality gates

Targets are **budgets to measure, not promises**:
- Web Vitals on representative mobile: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75 where measurable.
- Avoid loading WebGL libraries on text-only routes; progressively load 3D after useful content.
- Accessible country selection and news reading remain available on slow devices and without JavaScript/WebGL where technically feasible.
- Feed updates scheduled every 3 hours; report actual per-source lag, retries, and time-to-visible separately.
- Test with Playwright (desktop/mobile), unit tests for classifiers/filters, integration tests for worker/database, axe accessibility, and a repeatable security checklist.
- Maintain a source quality dashboard: enabled sources, reachable feeds, countries with qualifying stories in last 24h/7d, language distribution, duplicate ratio, freshness percentiles, and classification uncertainty.

## 13. Anti-goals and scope control

**Do not:** redesign from scratch without justification; introduce ad tech; add addictive mechanics; add untraceable AI summaries; invent political bias labels; infer geographic relationships from mere co-mentions without evidence; scrape copyrighted full articles indiscriminately; replace current routes unnecessarily; purchase hosting; ship breaking migrations; or report untested milestones as complete.

**Scope hierarchy:** trustworthy global coverage → transparent discovery and user choice → comprehension → optional delightful interaction. If resources are limited, cut animations before cutting provenance or accessibility.

## 14. Execution protocol for Claude Code

For each milestone:
1. Inspect existing implementation and enumerate impacted files.
2. Write a short plan, risks, tests, and rollback approach.
3. Implement smallest reversible vertical slices behind flags when appropriate.
4. Run format, lint, typecheck, unit/integration/e2e, accessibility, and build checks relevant to the slice.
5. Record results and unresolved issues with exact commands, timestamps, and links to logs/screenshots.
6. Commit with descriptive messages if repository permissions allow; do not force push or rewrite history.
7. Proceed to next milestone only after exit criteria pass, or clearly mark external blockers and continue independent work.

At the end produce:
- `docs/roadmap/status.md`: implemented vs planned vs blocked, per milestone.
- `docs/architecture/decisions.md`: rationale and tradeoffs.
- `docs/data/source-methodology.md`: source provenance and political classification rules.
- `docs/operations/runbook.md`: 3-hour sync, recovery, monitoring, and backups.
- `docs/release/acceptance.md`: test evidence and remaining risks.
- `README.md`: setup, environment variables, local development, deployment, and feature flags.

**Final report format:** baseline → changed files → migration details → test results → live verification → remaining blockers → next safe actions. If production access is absent, say **NOT DEPLOYED** rather than implying release.

## 15. First command to execute

> Read `FREALGO_V2_HYBRID_MASTER_UPGRADE.md` fully. Inspect the current repository and deployment without making destructive changes. Establish the baseline, compare it to the product constitution, then implement M1 through M5 sequentially, preserving all existing working routes and functionality. Do not add engagement algorithms or advertisements. Do not fabricate source coverage, political classifications, or AI summaries. Run and document tests after every milestone. Seek approval only for genuinely external or irreversible actions; otherwise proceed autonomously until the implementation is complete or a specific blocker is proven.

---

**End of master upgrade package.**
