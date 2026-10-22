# Ingestion runbook (FreAlgo 2.0)

How stories get from publisher feeds into FreAlgo, how to add a source, and how to recover. For
platform operations (deploys, backups, alerts) see [`runbook.md`](runbook.md).

## 1. Pipeline

```text
source registry (prisma/data/sources.ts, seeded PAUSED)
  → owner terms review → deploy/source-activations.json (ACTIVE)
  → scheduler tick every 3 h (BullMQ job scheduler, cluster-wide, idempotent window keys)
  → fetch job per due feed: SSRF-safe fetch, robots.txt, conditional GET (ETag/Last-Modified),
    per-host concurrency, retries with jittered backoff, circuit breaker, dead-letter queue
  → parse (RSS 2, RSS 1/RDF, Atom; XML hardening) → normalise (canonical URL, text-only excerpt,
    dates with original offset) → dedupe (guid, canonical URL hash, content hash)
  → tag (rules v2): countries with roles, sectors per language, article type on evidence
  → PostgreSQL → APIs and pages
```

**Country roles** (ADR V2-001) are what make coverage honest:

| Role             | Comes from                                                          | Counted as the country's coverage?                |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `SUBJECT`        | The headline or excerpt names the country, or an editor tagged it   | yes                                               |
| `FEED_SCOPE`     | The feed is declared as covering one country (`defaultCountryIso2`) | yes, labelled "from a feed covering this country" |
| `PUBLISHER_HOME` | The outlet's home country, when nothing above applies               | no (shown only with `scope=all`)                  |

## 2. Adding a source

1. **Check permission first.** Read the publisher's terms and RSS policy. Record the finding in
   `docs/source-terms-review.md` (groups A/B/C). Never add a source that requires bypassing a
   paywall, bot challenge or robots rule.
2. **Register it** in `prisma/data/sources.ts`:
   - set `countryIso2` (the publisher's home);
   - set `defaultCountryIso2` only for genuinely single-country feeds;
   - set `language` per feed (many feeds mislabel it).
3. **Dry-run:** `npm run sources:dry-run -- --slug <slug>`. This fetches and parses, writes
   nothing, and shows country and sector match rates.
4. **Seed** (`npm run db:seed`, or the migrate job on deploy). The source appears on `/sources`
   as _Paused_.
5. **Activate (owner decision).** Add an entry to `deploy/source-activations.json` with the
   reviewer, date, terms URL and notes, then deploy. The migrate job runs
   `activate-sources --from` idempotently and writes an audit-log entry per feed.

## 3. Tagging rules changes

Bump the rules version in `lib/ingest/tagging/{countries,sectors,article-type}.ts` when rules
change. The combined `TAGGING_RULES_VERSION` changes with it.

On the next deploy, the migrate job runs `scripts/retag-articles.ts`:

- it re-tags stored real articles below the new version, in batches;
- MANUAL tags and fixtures are untouched;
- it is idempotent.

Run it by hand with `npm run db:retag` (add `-- --all` to force).

## 4. Monitoring

- `/status` (and `/api/v1/sources/health`) shows per-source freshness and the **source quality**
  table:
  - enabled vs reachable sources;
  - countries with stories _about_ them (24 h / 7 days);
  - languages;
  - duplicate ratio;
  - untagged shares;
  - newest-story age and time-to-visible percentiles;
  - failed and retried runs.
- Alerts and first responses: `runbook.md` §7.

## 5. Recovery

| Symptom                        | Action                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| One source failing             | Other sources are unaffected (per-source jobs and circuit). Read the error code on `/status`; fix the registry entry or pause it |
| Circuit open (ERROR)           | Admin → reset circuit after fixing the cause; or `sources:activate --slug … --pause`                                             |
| Scheduler stalled              | Restart the worker; job schedulers re-register at boot and the next tick enqueues everything due                                 |
| Wrong tags after a rule change | Fix the rule, bump its version, deploy (re-tag runs automatically)                                                               |
| Publisher takedown request     | Pause the feed; mark stories REMOVED via the admin API; removals never come back on re-fetch                                     |
