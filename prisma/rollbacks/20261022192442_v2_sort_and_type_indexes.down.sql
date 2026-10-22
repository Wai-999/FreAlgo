-- Rollback for 20261022192442_v2_sort_and_type_indexes (take a backup first; see docs/operations/runbook.md §4), then:
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022192442_v2_sort_and_type_indexes';
DROP TRIGGER IF EXISTS "Article_title_sort_trg" ON "Article";
DROP FUNCTION IF EXISTS frealgo_article_title_sort();
DROP INDEX IF EXISTS "Article_articleType_publishedAt_id_idx";
DROP INDEX IF EXISTS "Article_titleSort_id_idx";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "titleSort";
