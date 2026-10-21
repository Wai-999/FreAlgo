# ADR V2-001: FreAlgo 2.0 as an in-place hybrid upgrade

- Status: accepted (2026-10-21)
- Context documents: `md files/FREALGO_V2_HYBRID_MASTER_UPGRADE.md` (the spec),
  [`docs/audit/baseline.md`](../audit/baseline.md)
- Supersedes: nothing. v1 ADR-001…021 in [`decisions.md`](decisions.md) remain in force unless
  noted below.

## Context

FreAlgo v1 is live and healthy (see the baseline). Its stack already matches the spec's preferred
architecture: Next.js App Router, TypeScript, Tailwind, React Three Fiber, PostgreSQL + Prisma,
and BullMQ + Redis.

The baseline also found one integrity flaw the v2 features would amplify. Country coverage counts
the publisher's home country as if it were the story's subject. In production, 54 of 55 "United
Kingdom" stories are BBC world news about other countries.

## Decision

1. **Upgrade in place; no rewrite.** Keep the stack, routes, URL-as-state model, no-JS path,
   2D/list fallbacks, ingestion safety (SSRF, robots, terms gate) and test suites. Every v1 URL
   keeps working (enforced by `tests/e2e/routes.spec.ts`).
2. **Information architecture.** Primary navigation becomes **Explore · Stories · Discover ·
   Perspectives · My World**. Search, Sources, Freshness, Methodology, About and Settings stay
   one click away in a secondary navigation, not buried.
3. **APIs stay under `/api/v1`.** The spec's `/api/...` endpoints map to `/api/v1/...` (see
   [`route-map.md`](route-map.md)). Same envelopes, Zod contracts, keyset pagination, bounded
   page size, rate limits.
4. **Feature flags for every v2 surface** (`lib/flags.ts`, `FEATURE_<NAME>`, listed publicly on
   the methodology page):
   - Defaults are the intended launch state.
   - Features without reviewed content stay off: Story Journeys (need curated, sourced journeys)
     and World Pulse (needs review of how map shading reads).
   - AI summaries are locked off: not implemented.
5. **Country roles are explicit.** An article–country link records _why_ it exists: the
   publisher's home country, the story's subject (text evidence or curated), or the feed's
   declared scope. Coverage counts, country pages and connections use **subject** links by
   default; publisher-home stories are a separate, labelled view.
6. **Only deterministic, explainable methods.** No machine-learned ranking, embeddings or LLM
   output.
   - Event clusters are lexical (shared distinctive headline terms within a time window); each
     one shows the terms and window that formed it.
   - "Surprise Me" and the daily discovery use a documented seeded uniform choice; the seed is
     visible and shareable.
   - Perspective comparisons show lexical overlap and differences labelled as such, never as
     "verified facts". Disputed claims are "not assessed" unless an editor records them with
     sources.
7. **Content honesty.**
   - Event titles are an outlet's own headline, attributed. Nothing is summarised by a model.
   - Timelines are built only from dated reports or curated entries with source URLs.
   - Journeys require an evidence URL per step.
   - Missing perspectives are reported as gaps _in the ingested corpus_, not in the world.
8. **Personalisation stays explicit and local.** My World uses the existing browser-local
   preferences (export, import, reset), with optional account sync through the existing OIDC
   path. There are no behavioural signals.
9. **Schema changes are additive** (expand → backfill → read), each with a rollback script and a
   rehearsal on a restored copy of a production backup ([`migration-plan.md`](migration-plan.md)).
10. **Rollout.**
    - Work happens on branch `v2/hybrid`, with local commits.
    - `main` remains production.
    - Production deploys only after the owner approves, with a fresh backup first and the
      previous image kept for rollback.

## Consequences

- **Lower counts, but true.** Some country counts drop sharply once publisher-home links are
  separated (UK 55 → 1 at baseline). The UI shows both numbers with labels, so nothing looks
  hidden.
- **Lexical clustering has limits.** It misses cross-language matches and can merge two events
  that share rare words. The UI says so, and every article stays individually listed and linked.
- **Some features ship empty-but-honest.** Journeys, World Pulse and Constructive Developments
  are shipped as implemented-but-off or as empty states until curated content or review exists,
  rather than as fabricated content.
- **Flags add a small amount of branching.** That cost is accepted for safe rollout and
  per-instance control.

## Alternatives rejected

- **Rewrite on a different stack:** no evidence it would help, and it risks the working system.
- **Globe.gl alongside React Three Fiber:** two rendering owners; the spec itself advises against
  it.
- **LLM summaries or embedding clustering:** cost, provenance and hallucination risk without an
  evaluation set. Kept as a locked flag for a future, separately reviewed ADR.
