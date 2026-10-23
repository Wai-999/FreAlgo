-- Rollback for 20261021140911_v2_country_roles_article_type. Take a backup first
-- (docs/operations/runbook.md §4), stop web and worker, then run this and delete the migration row:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261021140911_v2_country_roles_article_type';
-- v1 code ignores the role/type columns, so running v1 against the expanded schema is also safe;
-- this script is only needed to return the schema to its exact v1 shape.
DROP INDEX IF EXISTS "ArticleCountry_countryId_role_publishedAt_articleId_idx";
ALTER TABLE "ArticleCountry" DROP COLUMN IF EXISTS "role";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "articleType",
  DROP COLUMN IF EXISTS "articleTypeBasis",
  DROP COLUMN IF EXISTS "feedCategories",
  DROP COLUMN IF EXISTS "taggedRulesVersion";
DROP TYPE IF EXISTS "CountryRole";
DROP TYPE IF EXISTS "ArticleType";
