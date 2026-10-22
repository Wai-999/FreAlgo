# HTTP API (v1)

All endpoints live under `/api/v1`, return JSON, and share these conventions.

**Errors** use one envelope:
`{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [...], "requestId": "…" } }`.
Error codes: `VALIDATION_ERROR` (400), `INVALID_CURSOR` (400), `INVALID_JSON` (400),
`UNAUTHORIZED` (401), `FORBIDDEN` / `CSRF_REJECTED` (403), `NOT_FOUND` (404),
`TERMS_REVIEW_REQUIRED` (409), `UNSUPPORTED_MEDIA_TYPE` (415), `LABEL_POLICY_VIOLATION` (422),
`RATE_LIMITED` (429, with `Retry-After`), `QUEUE_UNAVAILABLE` (503) and `INTERNAL_ERROR` (500).

**Rate limits** use fixed windows per hashed client key. Responses carry `RateLimit-Limit`,
`RateLimit-Remaining` and `RateLimit-Reset`.

**Caching.** Public reads send
`Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=300`. Personal and admin
endpoints send `no-store`.

**Headers.** Every response carries `X-Request-Id`, `X-Content-Type-Options: nosniff` and a
`default-src 'none'` CSP.

## Public reads

| Endpoint                                                     | Purpose                                                                                                                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /countries`                                             | Every ISO 3166-1 country, including those with zero sources: `articleCount`, `outletCount`, `activeSourceCount`, `latestPublishedAt`, `lastSuccessfulSyncAt`, plus a `coverage` summary              |
| `GET /countries/:iso2/articles`                              | Stories relevant to a country (same parameters as search, minus `country`). Unknown country → 404                                                                                                    |
| `GET /articles/search`                                       | Search and filters across all countries                                                                                                                                                              |
| `GET /outlets?country=`                                      | Outlet registry: source-level label with confidence, provenance, status and feeds                                                                                                                    |
| `GET /sectors`                                               | Sector list                                                                                                                                                                                          |
| `GET /events?cursor=&limit=&country=&minOutlets=`            | Event clusters (FreAlgo 2.0), ordered by latest report, newest first. `minOutlets=2` lists events Perspectives can compare. Invalid cursor → 400 `INVALID_CURSOR`                                    |
| `GET /events/:id` (id or slug)                               | One event: every report with its original URL, outlet label and grouping evidence (`membership.score`, `sharedTerms`, `matchedArticleId`), curated `timeline` and `upcoming` entries, method version |
| `GET /events/:id/perspectives`                               | Columns per outlet with distinct wording and piece types, label counts, coverage `gaps` (in FreAlgo's corpus), `claimsInDispute.assessed=false`                                                      |
| `GET /journeys/:slug`                                        | A curated Story Journey with sourced steps (flag `journeys`, off by default)                                                                                                                         |
| `GET /methodology`                                           | Machine-readable ordering, tagging, label, Discover and grouping rules with versions, and the live feature-flag states                                                                               |
| `GET /health/live` · `GET /health` · `GET /health/freshness` | Liveness, readiness (DB/Redis) and truthful per-source freshness                                                                                                                                     |

### List and search parameters

| Param         | Type                 | Notes                                                                                                                                                              |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `q`           | 1–200 chars          | Matches headline and excerpt (full-text, language-stemmed plus unstemmed), outlet name, and a typo-tolerant headline match. Supports `"phrases"` and `-exclusions` |
| `country`     | ISO alpha-2          | Case-insensitive                                                                                                                                                   |
| `region`      | string               | UN M49 region or subregion name, e.g. `Asia`, `Eastern Africa`                                                                                                     |
| `sector`      | repeatable, ≤7       | `politics`, `business-economics`, `education`, `technology`, `agriculture`, `history-context`, `culture`                                                           |
| `outlet`      | repeatable slug, ≤20 |                                                                                                                                                                    |
| `orientation` | repeatable, ≤8       | `left`, `center-left`, `center`, `center-right`, `right`, `mixed`, `unrated`, `disputed` (outlet-level labels)                                                     |
| `language`    | repeatable, ≤10      | Primary BCP-47 subtag, e.g. `en`                                                                                                                                   |
| `period`      | enum                 | `any`, `24h`, `3d`, `7d`, `30d`, `365d`                                                                                                                            |
| `from`, `to`  | `YYYY-MM-DD`         | UTC days; `to` is inclusive; at most 10 years apart                                                                                                                |
| `sort`        | enum                 | `newest` (default), `oldest`, `outlet`, `relevance` (requires `q`; default when `q` is present)                                                                    |
| `cursor`      | opaque               | From `page.nextCursor` / `page.prevCursor`; bound to the sort order                                                                                                |
| `limit`       | 1–30                 | Default 24                                                                                                                                                         |

Filters across dimensions combine with **AND**. Several values within one dimension match
**ANY** of them.

### List response

```json
{
  "items": [
    {
      "id": "…",
      "title": "…",
      "excerpt": "…or null when the licence does not cover excerpts",
      "url": "https://publisher…",
      "language": "en",
      "author": null,
      "publishedAt": "2026-10-19T02:00:00.000Z",
      "publishedAtRaw": "Mon, 19 Oct 2026 08:30:00 +0630",
      "publishedOffsetMinutes": 390,
      "publishedAtEstimated": false,
      "isFixture": false,
      "outlet": {
        "slug": "…",
        "name": "…",
        "paywall": "NONE",
        "country": { "iso2": "MM", "name": "Myanmar" },
        "label": {
          "level": "source",
          "orientation": "UNRATED",
          "status": "UNRATED",
          "confidence": null,
          "ideologyTags": [],
          "methodology": null,
          "sourceUrl": null,
          "reviewedAt": null,
          "context": null,
          "isMachine": false
        }
      },
      "articleLabel": null,
      "countries": [
        { "iso2": "MM", "name": "Myanmar", "basis": "SOURCE_COUNTRY", "matchedTerm": null }
      ],
      "sectors": [
        {
          "slug": "agriculture",
          "name": "Agriculture",
          "basis": "KEYWORD_RULE",
          "ruleId": "agriculture.kw.v1"
        }
      ],
      "relevance": 0.41
    }
  ],
  "page": {
    "limit": 24,
    "sort": "newest",
    "number": 1,
    "nextCursor": "…",
    "prevCursor": null,
    "total": 132,
    "totalIsCapped": false
  },
  "ordering": { "sort": "newest", "explanation": "Ordered by publication time, newest first." }
}
```

Field notes:

- `articleLabel` is `null` unless a story was reviewed on its own; it is never derived from the
  outlet.
- `relevance` appears only with `sort=relevance` and is a textual-match score only.
- `total` is capped at 1000, with `totalIsCapped` saying so.

## Personal (signed-in, opt-in)

| Endpoint                                                      | Purpose                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `GET /me/preferences`                                         | Stored preferences (`?download=1` returns a JSON export) |
| `PUT /me/preferences`                                         | Replace them. Strict schema, same-origin only            |
| `DELETE /me/preferences`                                      | Erase the server copy                                    |
| `GET /auth/oidc/start` → `GET /auth/oidc/callback`            | OpenID Connect (code + PKCE + state + nonce)             |
| `POST /auth/dev-login` (localhost only) · `POST /auth/logout` | Local test identity; sign out                            |
| `POST /label-appeals`                                         | Public label correction request (form or JSON; 5/hour)   |

## Admin (server-side authorization)

These require `Authorization: Bearer $ADMIN_API_TOKEN` or a session whose user id is in
`ADMIN_USER_IDS`. Cookie-authenticated writes must be same-origin.

| Endpoint                                               | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `GET /admin/sources`                                   | All sources with status and freshness                                 |
| `PATCH /admin/sources/:id`                             | `{status?, termsReviewed?}`. Activation needs a recorded terms review |
| `POST /admin/sources/:id/refetch`                      | Queue a manual fetch, deduplicated per minute                         |
| `POST /admin/sources/:id/reset`                        | Reset the circuit breaker (ERROR → PAUSED)                            |
| `GET /admin/quarantine` · `POST /admin/quarantine/:id` | Review quarantined items                                              |
| `POST /admin/articles/:id/status`                      | Takedown or release with a reason                                     |
| `PATCH /admin/outlets/:id/label`                       | Change a label (policy-validated, history and audit)                  |
| `GET /admin/runs?sourceId=`                            | Ingestion audit log                                                   |
