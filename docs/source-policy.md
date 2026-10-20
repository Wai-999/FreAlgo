# Source & editorial policy

## 1. What counts as a source

A source is a `FeedSource`: one official RSS/Atom feed, or a licensed API endpoint, belonging to
a `MediaOutlet`. Every registry entry records:

| Field                                                                         | Meaning                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Publisher name, homepage, country, primary language                           | Identity and default relevance                                      |
| Ownership type and notes                                                      | Private, public-service, state, non-profit, co-operative or unknown |
| Feed URL and kind                                                             | RSS, Atom or licensed API                                           |
| Usage terms (`termsUrl`, `termsReviewedAt`, `licenseNotes`, `excerptAllowed`) | What we may display                                                 |
| Paywall policy                                                                | None, metered, hard or unknown (shown to users)                     |
| Orientation label + provenance                                                | See §3                                                              |
| Status                                                                        | `ACTIVE`, `PAUSED` or `ERROR` (circuit breaker)                     |

The registry lives in `prisma/data/sources.ts` (real publishers) and `prisma/data/fixtures.ts`
(fiction for development). Changes go through code review so the history stays auditable.

## 2. Inclusion and usage rules

1. Only official publisher RSS/Atom feeds or APIs we hold a licence for. No scraping of HTML
   pages, and no bypassing paywalls, logins, bot protection or robots rules.
2. Real feeds are registered **paused**. An operator activates a feed only after reading the
   publisher's terms and recording `termsReviewedAt` and `licenseNotes`, using the admin console or:
   `npm run sources:activate -- --slug <outlet> --reviewer "<name>" --notes "<terms summary>"`.
   The worker refuses to fetch any real feed without a recorded review (ADR-014).
   `npm run sources:dry-run` checks feeds live without storing anything.
3. We store and display only headline, link, publication time, author, language, categories and,
   where `excerptAllowed`, the feed-provided summary as plain text (truncated). We never copy
   full articles, and story links always go to the original publisher.
4. Images are not displayed (ADR-010).
5. Fetching uses a descriptive User-Agent, conditional requests, per-host concurrency limits,
   exponential backoff and a circuit breaker.
6. **Takedown:** on a publisher request, pause the source, set the affected articles to `REMOVED`
   with a reason, and record the action in `AdminAuditLog`. Removed articles disappear from all
   pages and APIs. The target is to complete this within 72 hours.

## 3. Orientation labels

- Labels describe an outlet's **general editorial orientation**, never an article's accuracy or
  ideology. No factuality is inferred from a label.
- `orientation` is a directional spectrum: Left, Center-Left, Center, Center-Right, Right. `MIXED`,
  `UNRATED` and `DISPUTED` are explicit non-positional states.
- Ideology words (liberal, conservative, …) are separate `ideologyTags` with a `labelContext`
  naming the national context.
- Every rated label needs a `labelSourceUrl` (a cited methodology or assessment) and
  `labelMethodology`. A `REVIEWED` label also needs `labelReviewedAt`. The validator in
  `lib/domain/orientation.ts` enforces this, and the editorial-quality test samples it.
- `labelConfidence` (0–1) expresses the strength of the cited evidence. The database rejects
  values outside that range.
- Machine-generated labels set `labelIsMachine` and can never be `REVIEWED`.
- Every change appends to `OutletLabelHistory` (who, when, why).
- Real outlets start `UNRATED`. No third-party rating dataset is bundled, because those datasets
  are copyrighted and require licence review (an external gate).

## 4. Appeals and corrections

- Anyone can file a label appeal from the source registry (`LabelAppeal`). A contact email is
  optional and deleted once the appeal is resolved.
- A maintainer reviews the appeal against the cited methodology. While it is open, the label may
  be set to `DISPUTED`. The outcome and reasoning are recorded in the label history.
- Factual errors in stories are the publisher's responsibility. Publisher updates are picked up on
  the next fetch, when changed headlines or excerpts are upserted.

## 5. Coverage honesty

Coverage is uneven by country and language. The interface always shows:

- countries with **no registered sources**;
- **stale** sources (no successful sync within 2× the fetch interval) and sources in `ERROR`;
- **paywalled** outlets;
- **language gaps**: a country's official languages (Unicode CLDR) compared with the languages its
  registered sources publish in;
- that "every 3 hours" is a scheduled **attempt**, with `lastAttemptAt` and
  `lastSuccessfulSyncAt` for each source.
