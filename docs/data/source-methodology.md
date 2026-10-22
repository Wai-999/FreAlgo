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
- since FreAlgo 2.0, stories count only for the countries they are **about** (see §6), and the
  number of stories merely published from a country is shown separately;
- the measured **source quality** table on `/status#quality`.

## 6. Country roles and tags (FreAlgo 2.0, rules v2)

Each article–country link records its **basis** (how it was produced) and its **role** (what it
means). Text evidence wins over assumptions.

| Role                                             | Basis                  | Rule                                                                                                                                                                                                                            | Counted as coverage                    |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| About this country (`SUBJECT`)                   | `TEXT_MATCH`, `MANUAL` | The headline or excerpt names the country (case-sensitive, word boundaries; ambiguous names need a corroborating term; at most 5). The matched term and rules version are stored. Upper-case "US" counts, "us" and "US$" do not | yes                                    |
| From a feed covering this country (`FEED_SCOPE`) | `FEED_DEFAULT`         | The feed is declared as covering one country (national feeds only)                                                                                                                                                              | yes, labelled as an assumption         |
| Publisher based here (`PUBLISHER_HOME`)          | `SOURCE_COUNTRY`       | The outlet's home country, only when nothing above applies                                                                                                                                                                      | **no**; shown on request (`scope=all`) |

A BBC (UK-based) story about Russia is therefore Russia coverage, not UK coverage.

The distinction matters in practice. At the v2 baseline (2026-10-21), 54 of the 55 stories counted
for the United Kingdom were BBC world news about other countries.

**Article type** (news, opinion or analysis) is assigned only on publisher evidence: a category, a
URL section such as `/opinion/` or `/commentisfree/`, or a headline prefix such as "Opinion:".
Otherwise it is unknown, and no badge is shown.

**Sectors** come from feed sections, publisher categories and keyword rules. Keyword rules exist
for English, Portuguese, Spanish and French.

When any rule changes, its version is bumped and stored stories are re-tagged on the next deploy
(`scripts/retag-articles.ts`).

## 7. Political classification rules

- Labels describe **outlets, never articles**. An article is never given its publisher's
  orientation; article-level labels exist only when an editor records one with a note.
- Every label carries:
  - status (unrated, provisional, reviewed or disputed);
  - methodology;
  - source URL;
  - review date;
  - context;
  - change history.

  Real outlets stay **Unrated** until a licensed or documented assessment exists. FreAlgo does
  not invent ratings.

- The left–right spectrum is shown with a text label and a position marker, never by colour
  alone. It is not presented as universal: the label's context field explains local politics
  where relevant.
- Perspective comparisons show who reported what, side by side. Gaps mean "not in the ingested
  corpus", not "does not exist".
