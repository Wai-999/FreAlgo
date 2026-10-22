-- CreateEnum
CREATE TYPE "CountryRole" AS ENUM ('SUBJECT', 'PUBLISHER_HOME', 'FEED_SCOPE');

-- CreateEnum
CREATE TYPE "ArticleType" AS ENUM ('NEWS', 'OPINION', 'ANALYSIS', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "articleType" "ArticleType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "articleTypeBasis" TEXT,
ADD COLUMN     "feedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "taggedRulesVersion" INTEGER;

-- AlterTable
ALTER TABLE "ArticleCountry" ADD COLUMN     "role" "CountryRole" NOT NULL DEFAULT 'SUBJECT';

-- CreateIndex
CREATE INDEX "ArticleCountry_countryId_role_publishedAt_articleId_idx" ON "ArticleCountry"("countryId", "role", "publishedAt" DESC, "articleId" DESC);

-- Backfill (FreAlgo 2.0, ADR V2-001): map each existing tag's basis to its role.
-- Text matches and manual tags are about the country; publisher-country tags only say where the
-- outlet is based; feed-default tags are the feed's declared scope. Idempotent.
UPDATE "ArticleCountry" SET "role" = 'PUBLISHER_HOME' WHERE "basis" = 'SOURCE_COUNTRY' AND "role" <> 'PUBLISHER_HOME';
UPDATE "ArticleCountry" SET "role" = 'FEED_SCOPE' WHERE "basis" = 'FEED_DEFAULT' AND "role" <> 'FEED_SCOPE';
-- Country tags, sectors and article types of real (non-fixture) articles are then recomputed with
-- the v2 rules by scripts/retag-articles.ts (run by the migrate job; taggedRulesVersion IS NULL).
