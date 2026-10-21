# Database migration and backup plan (FreAlgo 2.0)

## Principles

1. **Additive only.** New tables, nullable columns, or columns with defaults, plus new indexes.
   No renames or drops in v2. Old readers keep working during a rolling deploy.
2. **Expand → backfill → read.**
   - Each schema change ships with an idempotent backfill.
   - Code reads the new fields only after the backfill has run.
   - Backfills run inside the `migrate` job, so a deploy that fails midway leaves the old schema
     readable.
3. **A rollback script for every migration** in `prisma/rollbacks/<name>.down.sql`, reviewed in
   the same commit.
4. **Rehearse on production data before production.**
   - Pull the latest nightly backup (`scripts/ops/pull-backups.sh`).
   - Restore it into a scratch database (`scripts/ops/restore.sh <file> frealgo_rehearsal`).
   - Run `prisma migrate deploy` and the backfill against it.
   - Compare row counts and spot-check the new fields.
   - Record the result in `docs/release/acceptance.md`.

## Before every production deploy

1. Take a fresh backup on the server:

   ```bash
   sudo env COMPOSE=… sh scripts/ops/backup.sh /var/backups/frealgo
   ```

   This is in addition to the 02:37 UTC nightly run.

2. Copy it off the server: `scripts/ops/pull-backups.sh <ip>`.
3. Note the currently running image IDs (`docker compose images`) for rollback.
4. Deploy (`scripts/ops/deploy-remote.sh`), then run the smoke test.

## Planned schema changes

| Milestone | Change                                                                                                                                  | Backfill                                                                                                                                                                | Rollback            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| M2        | `ArticleCountry.role` (enum `SUBJECT`, `PUBLISHER_HOME`, `FEED_SCOPE`) with index `(countryId, role, publishedAt DESC, articleId DESC)` | `SOURCE_COUNTRY` → `PUBLISHER_HOME`, `FEED_DEFAULT` → `FEED_SCOPE`, everything else → `SUBJECT`. Re-tag stored articles with the improved gazetteer (US/U.S., demonyms) | drop column + index |
| M2        | `Article.articleType` (enum `NEWS`, `OPINION`, `ANALYSIS`, `UNKNOWN`, default `UNKNOWN`) + `articleTypeBasis`                           | from feed categories and URL paths (`/opinion/`, `commentisfree`, …)                                                                                                    | drop columns        |
| M4        | `NewsEvent`, `EventArticle` (cluster method, score, shared terms, time window)                                                          | clustering job over existing articles                                                                                                                                   | drop tables         |
| M4        | `TimelineEntry` (curated, requires `sourceUrl`)                                                                                         | none (curated)                                                                                                                                                          | drop table          |
| M4        | `StoryJourney`, `JourneyNode` (requires `evidenceUrl` per node)                                                                         | none (curated)                                                                                                                                                          | drop tables         |

Bias ratings stay on `MediaOutlet` plus `OutletLabelHistory` (v1 already records provenance and
history). A separate `OutletBiasRating` table is only added if a licensed multi-assessor dataset
is adopted.

## Recovery

| Failure                    | Response                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration fails mid-deploy | `migrate` exits non-zero; `web` and `worker` do not start (Compose dependency). Fix forward, or restore the pre-deploy backup                                          |
| Bad data after deploy      | Stop `worker` → run the rollback SQL → delete the migration row from `_prisma_migrations` → redeploy the previous image → smoke test (`docs/operations/runbook.md` §4) |
| Total loss                 | Restore the latest backup into a new database and point `DATABASE_URL` at it; the worker re-fetches the last 3-hour window automatically                               |
