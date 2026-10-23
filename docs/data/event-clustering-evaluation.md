# Event clustering: provenance and evaluation (FreAlgo 2.0, M4)

Method version 2 (`lib/events/cluster.ts`, `CLUSTER_METHOD_VERSION = 2`). Version 1 was
evaluated on 2026-10-22; version 2 adds the weak-match rule after a review on live data at the
release on 2026-10-23 (Evaluation 3).

## What an event is, and what it is not

An event is a group of stored reports that the method judged to be about the same thing. It
is built only from each report's **headline** and the **countries its text names** (country role
`SUBJECT`). FreAlgo writes nothing into an event:

- The event is shown under one member's own headline, verbatim and attributed (the member most
  similar to the others; ties go to the earliest). `NewsEvent.titleArticleId` records whose.
- Every report keeps its own headline, outlet, time and link. Membership rows
  (`EventArticle`) store the evidence: similarity score, the distinctive words shared, and the
  report it matched.
- "Shared wording" (`NewsEvent.sharedTerms`) is the words used by at least half of the
  headlines. It is shown as "shared wording, not verified facts".

There is no model, embedding, summary or engagement signal anywhere in the method.

## Method v1

| Step                 | Rule                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Terms                | Headline words, lower-cased, without stopwords (en, pt, es, fr), numbers and words under 3 letters, plus `@XX` for each country the text names. Feed scope and publisher home are **not** used: they say nothing about the event.                                                                                                    |
| Weights              | Smoothed IDF over the same-language, same-kind (real or fixture) reports of the last 7 days.                                                                                                                                                                                                                                         |
| Similarity           | Weighted overlap: weight of shared terms ÷ total weight of the shorter headline (0–1).                                                                                                                                                                                                                                               |
| Pair rule            | similarity ≥ 0.30, at least 2 shared **distinctive** words (in ≤ 10 % of the corpus, or ≤ 3 reports), a **shared name** (a country both texts name, or a word capitalised inside a headline), and the two texts do not name different countries.                                                                                     |
| Weak-match rule (v2) | Below a similarity of 0.40, a pair needs **3** shared distinctive words instead of 2.                                                                                                                                                                                                                                                |
| Join rule            | Oldest first. A report joins an event (same language, latest report ≤ 72 h away) when its best qualifying member passes the pair rule and its mean similarity to all members is ≥ 0.25. Otherwise it may pair with another unclustered report. Reports left alone are retried after new events form, so one run equals several runs. |
| Stability            | Events only grow: never split, merged or re-ordered by size. A report is in at most one event (`EventArticle.articleId` is the primary key). One run at a time (Postgres advisory lock).                                                                                                                                             |
| Schedule             | Worker job `cluster-events`, hourly at :20 UTC (`EVENTS_CRON`); `FEATURE_EVENT_CLUSTERING=false` stops new grouping without a deploy. Manual: `node --import tsx scripts/cluster-events.ts [--dry-run]`.                                                                                                                             |

## Evaluation 1: labelled fictional headlines

`tests/fixtures/events/labelled-headlines.json`: 23 fictional headlines, 5 events (5 + 3 + 3 + 2 +
2 reports), 7 distractors chosen to share generic words with an event ("central bank", "leaders
meet", a second Nepal story, a second Philippines story), and 1 cross-language report. Rarity is
computed together with 240 neutral background headlines, which models a week's corpus.

| Metric (pairwise, cross-language item excluded) | v1 (23 items) | v2 (30 items, with w1–w7) |
| ----------------------------------------------- | ------------- | ------------------------- |
| True pairs found                                | 18 of 18      | 15 of 19                  |
| False pairs                                     | 0             | 0                         |
| Precision                                       | 1.00          | 1.00                      |
| Recall                                          | 1.00          | 0.79                      |

Enforced by `tests/unit/event-clustering.test.ts` (precision must be 1, recall ≥ 0.75; the
three live failure patterns must stay apart). The test
also checks that the cross-language report is never grouped, that the US and Kenya central bank
stories and the two "leaders meet" stories stay apart, that runs are deterministic, and that
every join reports at least 2 shared words.

**Caution:** the thresholds were tuned on this set (first version: recall 0.33; after the
overlap measure and the background corpus: 0.78; after lowering the join threshold to 0.30:
1.00). It is a regression test, not an independent measurement. Evaluation 2 is the
out-of-sample check.

## Evaluation 2: real headlines (copy of production, not modified)

Input: the production backup `frealgo-20261022T023701Z.dump`, restored into a local scratch
database (`frealgo_rehearsal`), migrated and re-tagged. 146 real reports from NPR, BBC News and
Agência Brasil (English 96, Portuguese 50), 141 of them inside the 7-day window. Production was not touched.

Result: **7 events, 16 reports** (2 events with two outlets: NPR + BBC News).

| Event (shown headline)                                                         | Reports | Outlets | Reviewer judgement                                                                                                            |
| ------------------------------------------------------------------------------ | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Man charged with attack on Australia MP to face court                          | 2       | 1       | Correct                                                                                                                       |
| Why is Elon Musk plotting a mega-merger of SpaceX and Tesla?                   | 2       | 1       | Correct                                                                                                                       |
| US citizen Stephen Hubbard freed by Russia as Trump envoy meets Putin          | 3       | 2       | Correct; the third report ("US envoy arrives in Russia ahead of meeting with Putin") is the same visit, a related development |
| Some on DOJ's 20,000 "likely" noncitizen list in Calif. appear to be U.S.-born | 2       | 1       | Correct                                                                                                                       |
| Nigeria confirms an Ebola case in Abuja…                                       | 3       | 2       | Correct                                                                                                                       |
| Clean up begins after French riots but police remain                           | 2       | 1       | Correct                                                                                                                       |
| Missiles hit Kyiv after Russia agrees to US call to resume Ukraine peace talks | 2       | 1       | Borderline: both are about the US peace push in the same day, one is an analysis piece                                        |

**Precision (reviewer judgement): 7 of 7 events have no wrong member; 1 is borderline.**

Reviewed near misses (all pairs with similarity ≥ 0.2 and at least one shared distinctive
word, ~60 pairs):

| Pair                                                                                                                  | Outcome              | Why                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| "Eleitores do DF voltam às urnas…" / "No Amazonas, eleitores vão escolher…"                                           | Correctly kept apart | Different state run-offs; they share only common words. This pair was grouped before the shared-name rule was added.                    |
| "China tells Israel to stop … West Bank settlements" / "Israel frees dozens of Americans … after West Bank detention" | Correctly kept apart | Different events; the pair rule alone would accept them, the 72 h window does not (5 days apart). A known risk for long-running places. |
| "Pope Leo XIV thanks wellwishers…" / "Pope does not need further treatment…"                                          | Missed (true pair)   | 3.4 days apart (outside 72 h), and no shared name ("Pope" opens both headlines).                                                        |
| Australian MP attack: four headlines                                                                                  | Partly missed        | Scores 0.26–0.29, below 0.30; only the two court reports grouped.                                                                       |
| French riots: seven headlines                                                                                         | Partly missed        | Different wording (looting, curfews, blame); only two grouped.                                                                          |

So on real headlines the method is conservative: what it groups is right, and it misses related
reports that use different words. That is the intended trade-off: a wrong grouping misleads
readers, a missed one only shows fewer related reports.

## Evaluation 3: live data at the release (method v1 rejected, v2 adopted)

On 2026-10-23, after FreAlgo 2.0 was deployed, a dry run on production (249 reports; it writes
nothing) was reviewed before any event was stored. Method v1 proposed 24 groupings, and **4 were
wrong**:

| Wrong grouping in v1                                                 | Shared evidence                      | Similarity |
| -------------------------------------------------------------------- | ------------------------------------ | ---------- |
| A shark attack and an unrelated killing                              | "south", "africa" (the country name) | 0.40       |
| Two different Defesa Civil stories (funding vs an emergency decree)  | "defesa", "civil"                    | 0.32       |
| A car rescue joined to the Australian MP attack                      | "australian", "man"                  | 0.33       |
| A Lula campaign rally grouped with a separate electoral-court filing | "campanha", "flávio"                 | 0.31       |

Each rested on two generic words, often a country or an institution, at a similarity just above
0.30. Events and Perspectives were switched off on production within minutes (no event had been
stored), and version 2 added the weak-match rule.

Version 2 on the same reports gives **11 events and 16 decisions, none wrong**. One is
borderline: two category announcements of the same Petrobras award. It leaves three related
groupings undone: French riots (0.38, two words), Haiti gangs (0.36) and one Australian MP
report (0.33).

The labelled set now includes fictional versions of these patterns (items w1–w7). Under v1 they
produce exactly the live errors (w1–w3, w2–w3, w4–w5, w6–w7); under v2 none. Labelled-set
results for v2: **15 of 19 true pairs, 0 false (precision 1.00, recall 0.79)**. The four
misses are one quake report that shares only "earthquake" and the country with the others.

## Data-quality tests

| Test                                  | What it guarantees                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/event-clustering.test.ts` | Labelled evaluation, language and country separation, determinism                                                                                                                                                                                                                                                       |
| `tests/unit/m4-evidence.test.ts`      | Shared-name rule, country conflict, representative headline, slugs, World Pulse bands, date precision, flags, methodology output                                                                                                                                                                                        |
| `tests/integration/events.test.ts`    | Dry run writes nothing; the seed never clusters real reports; real, fixture, language and country separation; idempotent re-runs; advisory lock; withdrawn reports drop out everywhere; curated entries need a web source (database CHECK); Perspectives gaps; connections; World Pulse counts; fixture seed idempotent |
| `tests/e2e/evidence.spec.ts`          | Story Mode sections and original links, timeline labels, Perspectives columns and gaps, API envelopes, journeys without autoplay, World Pulse legend and table, axe and 320 px reflow                                                                                                                                   |

## Known limits (also on `/methodology#events`)

- Reports in different languages are never grouped. Scripts without spaces (Chinese, Japanese,
  Thai, Burmese, Khmer, Lao) are not clustered at all.
- Headlines only: two different events with similar headlines in the same three days can be
  grouped (risk highest for long-running places and recurring topics), and one event worded
  differently by different outlets can stay split.
- Rarity depends on the corpus. With few reports in a language, more words count as distinctive,
  so the shared-name rule matters most for small languages.
- The method never splits or merges events after the fact. A wrong grouping can be removed by
  deleting the membership row; there is no admin screen for this yet (see
  `docs/operations/runbook.md`).

## Representative fixtures

`prisma/data/fixtures.ts` adds three fictional events grouped by the same job during the seed
(fixtures only): the Salween river data portal (5 outlets, including analysis and opinion, every
label state), the Kenya solar mini-grid tender (4 outlets) and a single-outlet Portuguese event,
plus a curated fictional timeline (fact, interpretation, analogy, a future date) and a fictional
Story Journey. Placeholder fixture headlines are lower-case so that identical placeholders never
form fake events.
