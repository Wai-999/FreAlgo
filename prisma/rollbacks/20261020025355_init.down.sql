-- Rollback for 20261020025355_init. Prisma Migrate has no automatic down migrations;
-- run manually ONLY after taking a backup (see docs/operations/runbook.md#rollback).
-- This drops every FreAlgo object and data. Then delete the matching row from
-- "_prisma_migrations" so `prisma migrate deploy` can re-apply it.
DROP TABLE IF EXISTS "ArticleCountry", "ArticleSector", "Article", "IngestionQuarantine",
  "IngestionRun", "FeedSource", "OutletLabelHistory", "LabelAppeal", "MediaOutlet", "Sector",
  "Country", "UserPreference", "AdminAuditLog", "ClientEventCounter" CASCADE;
DROP FUNCTION IF EXISTS frealgo_article_search_vector();
DROP FUNCTION IF EXISTS frealgo_ts_config(text);
DROP TYPE IF EXISTS "Orientation", "LabelStatus", "ArticleStatus", "FeedStatus", "FeedKind",
  "PaywallPolicy", "OwnershipType", "CountryTagBasis", "SectorTagBasis", "IngestionRunStatus",
  "AppealStatus";
