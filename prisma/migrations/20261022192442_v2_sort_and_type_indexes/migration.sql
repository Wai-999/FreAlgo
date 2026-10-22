-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "titleSort" TEXT;

-- CreateIndex
CREATE INDEX "Article_titleSort_id_idx" ON "Article"("titleSort", "id");

-- CreateIndex
CREATE INDEX "Article_articleType_publishedAt_id_idx" ON "Article"("articleType", "publishedAt" DESC, "id" DESC);

-- Keep titleSort in step with title for every writer (app, seed, admin, SQL), like the search
-- vector trigger in the init migration. Backfill existing rows once.
CREATE OR REPLACE FUNCTION frealgo_article_title_sort() RETURNS trigger AS $$
BEGIN
  NEW."titleSort" := lower(left(NEW.title, 200));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Article_title_sort_trg"
  BEFORE INSERT OR UPDATE OF title ON "Article"
  FOR EACH ROW EXECUTE FUNCTION frealgo_article_title_sort();

UPDATE "Article" SET "titleSort" = lower(left(title, 200)) WHERE "titleSort" IS DISTINCT FROM lower(left(title, 200));
