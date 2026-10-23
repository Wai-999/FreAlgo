-- FreAlgo 2.0 → v1 schema, in one transaction (docs/release/rollback.md, "Full database rollback").
-- Only needed to return the schema to its exact v1 shape: v1 code runs on the v2 schema as is
-- (all v2 migrations are additive). Take a backup first and stop web and worker.
-- Removes: event clusters, curated timelines and journeys, exclusions, the alphabetical sort
-- column and trigger, article types and country roles. Articles, tags, sources, labels and
-- their history are kept.
BEGIN;
-- 20261022202201_v2_event_exclusions
DROP TABLE IF EXISTS "EventExclusion";
-- 20261022195158_v2_events_timelines_journeys
DROP TABLE IF EXISTS "JourneyNode";
DROP TABLE IF EXISTS "StoryJourney";
DROP TABLE IF EXISTS "TimelineEntry";
DROP TABLE IF EXISTS "EventArticle";
DROP TABLE IF EXISTS "NewsEvent";
DROP TYPE IF EXISTS "TimelineKind";
-- 20261022192442_v2_sort_and_type_indexes
DROP TRIGGER IF EXISTS "Article_title_sort_trg" ON "Article";
DROP FUNCTION IF EXISTS frealgo_article_title_sort();
DROP INDEX IF EXISTS "Article_articleType_publishedAt_id_idx";
DROP INDEX IF EXISTS "Article_titleSort_id_idx";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "titleSort";
-- 20261021140911_v2_country_roles_article_type
DROP INDEX IF EXISTS "ArticleCountry_countryId_role_publishedAt_articleId_idx";
ALTER TABLE "ArticleCountry" DROP COLUMN IF EXISTS "role";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "articleType",
  DROP COLUMN IF EXISTS "articleTypeBasis",
  DROP COLUMN IF EXISTS "feedCategories",
  DROP COLUMN IF EXISTS "taggedRulesVersion";
DROP TYPE IF EXISTS "CountryRole";
DROP TYPE IF EXISTS "ArticleType";
DELETE FROM "_prisma_migrations" WHERE migration_name IN (
  '20261021140911_v2_country_roles_article_type',
  '20261022192442_v2_sort_and_type_indexes',
  '20261022195158_v2_events_timelines_journeys',
  '20261022202201_v2_event_exclusions'
);
COMMIT;
