-- Extensions (Prisma cannot declare these without a preview feature).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Orientation" AS ENUM ('LEFT', 'CENTER_LEFT', 'CENTER', 'CENTER_RIGHT', 'RIGHT', 'MIXED', 'UNRATED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "LabelStatus" AS ENUM ('REVIEWED', 'PROVISIONAL', 'DISPUTED', 'UNRATED');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('PUBLISHED', 'QUARANTINED', 'REMOVED');

-- CreateEnum
CREATE TYPE "FeedStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "FeedKind" AS ENUM ('RSS', 'ATOM', 'LICENSED_API');

-- CreateEnum
CREATE TYPE "PaywallPolicy" AS ENUM ('NONE', 'METERED', 'HARD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('PRIVATE', 'PUBLIC_SERVICE', 'STATE', 'NONPROFIT', 'COOPERATIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CountryTagBasis" AS ENUM ('SOURCE_COUNTRY', 'FEED_DEFAULT', 'TEXT_MATCH', 'MANUAL');

-- CreateEnum
CREATE TYPE "SectorTagBasis" AS ENUM ('FEED_CATEGORY', 'KEYWORD_RULE', 'FEED_DEFAULT', 'MANUAL');

-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'NOT_MODIFIED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "iso2" VARCHAR(2) NOT NULL,
    "iso3" VARCHAR(3) NOT NULL,
    "isoNumeric" VARCHAR(3),
    "name" TEXT NOT NULL,
    "region" TEXT,
    "subregion" TEXT,
    "officialLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaOutlet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "countryId" TEXT,
    "primaryLanguage" TEXT,
    "ownershipType" "OwnershipType" NOT NULL DEFAULT 'UNKNOWN',
    "ownershipNotes" TEXT,
    "paywall" "PaywallPolicy" NOT NULL DEFAULT 'UNKNOWN',
    "orientation" "Orientation" NOT NULL DEFAULT 'UNRATED',
    "ideologyTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labelStatus" "LabelStatus" NOT NULL DEFAULT 'UNRATED',
    "labelConfidence" DOUBLE PRECISION,
    "labelMethodology" TEXT,
    "labelSourceUrl" TEXT,
    "labelReviewedAt" TIMESTAMP(3),
    "labelContext" TEXT,
    "labelIsMachine" BOOLEAN NOT NULL DEFAULT false,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaOutlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedSource" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "name" TEXT,
    "url" TEXT NOT NULL,
    "kind" "FeedKind" NOT NULL DEFAULT 'RSS',
    "status" "FeedStatus" NOT NULL DEFAULT 'PAUSED',
    "language" TEXT,
    "defaultCountryIso2" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultSectorSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fetchIntervalMinutes" INTEGER NOT NULL DEFAULT 180,
    "excerptAllowed" BOOLEAN NOT NULL DEFAULT true,
    "licenseNotes" TEXT,
    "termsUrl" TEXT,
    "termsReviewedAt" TIMESTAMP(3),
    "etag" TEXT,
    "lastModifiedHeader" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastNewItemAt" TIMESTAMP(3),
    "lastHttpStatus" INTEGER,
    "lastError" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "nextEligibleFetchAt" TIMESTAMP(3),
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "feedSourceId" TEXT,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "canonicalUrlHash" VARCHAR(64) NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "language" TEXT,
    "author" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "publishedAtRaw" TEXT,
    "publishedOffsetMinutes" INTEGER,
    "publishedAtEstimated" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" VARCHAR(64),
    "status" "ArticleStatus" NOT NULL DEFAULT 'PUBLISHED',
    "statusReason" TEXT,
    "articleLabel" "Orientation",
    "articleLabelNote" TEXT,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "searchVector" tsvector,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleCountry" (
    "articleId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "basis" "CountryTagBasis" NOT NULL,
    "matchedTerm" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleCountry_pkey" PRIMARY KEY ("articleId","countryId")
);

-- CreateTable
CREATE TABLE "ArticleSector" (
    "articleId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "basis" "SectorTagBasis" NOT NULL,
    "ruleId" TEXT,
    "rulesVersion" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleSector_pkey" PRIMARY KEY ("articleId","sectorId")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedCountryIso2" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedOutletIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedSectorSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedOrientations" "Orientation"[] DEFAULT ARRAY[]::"Orientation"[],
    "selectedLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSort" TEXT NOT NULL DEFAULT 'newest',
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "globeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "feedSourceId" TEXT NOT NULL,
    "jobId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "httpStatus" INTEGER,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "insertedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "quarantinedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorDetail" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionQuarantine" (
    "id" TEXT NOT NULL,
    "feedSourceId" TEXT NOT NULL,
    "runId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "itemExternalId" TEXT,
    "itemUrl" TEXT,
    "payloadExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "IngestionQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutletLabelHistory" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "orientation" "Orientation" NOT NULL,
    "ideologyTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labelStatus" "LabelStatus" NOT NULL,
    "labelConfidence" DOUBLE PRECISION,
    "labelMethodology" TEXT,
    "labelSourceUrl" TEXT,
    "labelReviewedAt" TIMESTAMP(3),
    "labelContext" TEXT,
    "labelIsMachine" BOOLEAN NOT NULL DEFAULT false,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutletLabelHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelAppeal" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contactEmail" TEXT,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LabelAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEventCounter" (
    "day" DATE NOT NULL,
    "event" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientEventCounter_pkey" PRIMARY KEY ("day","event")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso3_key" ON "Country"("iso3");

-- CreateIndex
CREATE UNIQUE INDEX "Country_isoNumeric_key" ON "Country"("isoNumeric");

-- CreateIndex
CREATE INDEX "Country_region_idx" ON "Country"("region");

-- CreateIndex
CREATE UNIQUE INDEX "MediaOutlet_slug_key" ON "MediaOutlet"("slug");

-- CreateIndex
CREATE INDEX "MediaOutlet_countryId_orientation_idx" ON "MediaOutlet"("countryId", "orientation");

-- CreateIndex
CREATE INDEX "MediaOutlet_name_trgm_idx" ON "MediaOutlet" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "FeedSource_url_key" ON "FeedSource"("url");

-- CreateIndex
CREATE INDEX "FeedSource_status_nextEligibleFetchAt_idx" ON "FeedSource"("status", "nextEligibleFetchAt");

-- CreateIndex
CREATE INDEX "FeedSource_outletId_idx" ON "FeedSource"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_slug_key" ON "Sector"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Article_canonicalUrlHash_key" ON "Article"("canonicalUrlHash");

-- CreateIndex
CREATE INDEX "Article_publishedAt_id_idx" ON "Article"("publishedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Article_outletId_publishedAt_idx" ON "Article"("outletId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Article_title_trgm_idx" ON "Article" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Article_outletId_externalId_key" ON "Article"("outletId", "externalId");

-- CreateIndex
CREATE INDEX "ArticleCountry_countryId_publishedAt_articleId_idx" ON "ArticleCountry"("countryId", "publishedAt" DESC, "articleId" DESC);

-- CreateIndex
CREATE INDEX "ArticleSector_sectorId_publishedAt_articleId_idx" ON "ArticleSector"("sectorId", "publishedAt" DESC, "articleId" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "IngestionRun_feedSourceId_startedAt_idx" ON "IngestionRun"("feedSourceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- CreateIndex
CREATE INDEX "IngestionQuarantine_feedSourceId_createdAt_idx" ON "IngestionQuarantine"("feedSourceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionQuarantine_createdAt_idx" ON "IngestionQuarantine"("createdAt");

-- CreateIndex
CREATE INDEX "OutletLabelHistory_outletId_createdAt_idx" ON "OutletLabelHistory"("outletId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LabelAppeal_status_createdAt_idx" ON "LabelAppeal"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "MediaOutlet" ADD CONSTRAINT "MediaOutlet_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedSource" ADD CONSTRAINT "FeedSource_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "MediaOutlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_feedSourceId_fkey" FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCountry" ADD CONSTRAINT "ArticleCountry_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCountry" ADD CONSTRAINT "ArticleCountry_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSector" ADD CONSTRAINT "ArticleSector_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSector" ADD CONSTRAINT "ArticleSector_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_feedSourceId_fkey" FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionQuarantine" ADD CONSTRAINT "IngestionQuarantine_feedSourceId_fkey" FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutletLabelHistory" ADD CONSTRAINT "OutletLabelHistory_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelAppeal" ADD CONSTRAINT "LabelAppeal_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "MediaOutlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL that Prisma Schema cannot express. Kept in the same migration so a fresh
-- `prisma migrate deploy` always produces the complete database.
-- ---------------------------------------------------------------------------

-- Integrity checks ----------------------------------------------------------
ALTER TABLE "MediaOutlet"
  ADD CONSTRAINT "MediaOutlet_labelConfidence_range"
  CHECK ("labelConfidence" IS NULL OR ("labelConfidence" >= 0 AND "labelConfidence" <= 1));

ALTER TABLE "OutletLabelHistory"
  ADD CONSTRAINT "OutletLabelHistory_labelConfidence_range"
  CHECK ("labelConfidence" IS NULL OR ("labelConfidence" >= 0 AND "labelConfidence" <= 1));

-- ISO codes are stored normalized (upper-case letters / three digits).
ALTER TABLE "Country"
  ADD CONSTRAINT "Country_iso2_format" CHECK ("iso2" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "Country_iso3_format" CHECK ("iso3" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Country_isoNumeric_format" CHECK ("isoNumeric" IS NULL OR "isoNumeric" ~ '^[0-9]{3}$');

ALTER TABLE "FeedSource"
  ADD CONSTRAINT "FeedSource_fetchInterval_min" CHECK ("fetchIntervalMinutes" >= 15),
  ADD CONSTRAINT "FeedSource_failureCount_nonneg" CHECK ("failureCount" >= 0);

ALTER TABLE "Article"
  ADD CONSTRAINT "Article_canonicalUrlHash_format" CHECK ("canonicalUrlHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "ClientEventCounter"
  ADD CONSTRAINT "ClientEventCounter_count_nonneg" CHECK ("count" >= 0);

-- Full-text search ------------------------------------------------------------
-- Maps a BCP-47 tag to a built-in text-search configuration; unknown languages fall back to
-- 'simple' (no stemming), which still tokenizes on whitespace/punctuation.
CREATE OR REPLACE FUNCTION frealgo_ts_config(lang text) RETURNS regconfig
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE lower(split_part(coalesce(lang, ''), '-', 1))
    WHEN 'ar' THEN 'arabic'::regconfig
    WHEN 'hy' THEN 'armenian'::regconfig
    WHEN 'eu' THEN 'basque'::regconfig
    WHEN 'ca' THEN 'catalan'::regconfig
    WHEN 'da' THEN 'danish'::regconfig
    WHEN 'nl' THEN 'dutch'::regconfig
    WHEN 'en' THEN 'english'::regconfig
    WHEN 'fi' THEN 'finnish'::regconfig
    WHEN 'fr' THEN 'french'::regconfig
    WHEN 'de' THEN 'german'::regconfig
    WHEN 'el' THEN 'greek'::regconfig
    WHEN 'hi' THEN 'hindi'::regconfig
    WHEN 'hu' THEN 'hungarian'::regconfig
    WHEN 'id' THEN 'indonesian'::regconfig
    WHEN 'ga' THEN 'irish'::regconfig
    WHEN 'it' THEN 'italian'::regconfig
    WHEN 'lt' THEN 'lithuanian'::regconfig
    WHEN 'ne' THEN 'nepali'::regconfig
    WHEN 'no' THEN 'norwegian'::regconfig
    WHEN 'nb' THEN 'norwegian'::regconfig
    WHEN 'nn' THEN 'norwegian'::regconfig
    WHEN 'pt' THEN 'portuguese'::regconfig
    WHEN 'ro' THEN 'romanian'::regconfig
    WHEN 'ru' THEN 'russian'::regconfig
    WHEN 'sr' THEN 'serbian'::regconfig
    WHEN 'es' THEN 'spanish'::regconfig
    WHEN 'sv' THEN 'swedish'::regconfig
    WHEN 'ta' THEN 'tamil'::regconfig
    WHEN 'tr' THEN 'turkish'::regconfig
    WHEN 'yi' THEN 'yiddish'::regconfig
    ELSE 'simple'::regconfig
  END
$$;

-- Weighted vector: headline (A) above excerpt (B). Both a language-stemmed and an unstemmed
-- ('simple') vector are stored so exact-word queries work in every language.
CREATE OR REPLACE FUNCTION frealgo_article_search_vector() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cfg regconfig := frealgo_ts_config(NEW."language");
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."excerpt", '')), 'B') ||
    CASE WHEN cfg = 'simple'::regconfig THEN ''::tsvector ELSE
      setweight(to_tsvector(cfg, coalesce(NEW."title", '')), 'A') ||
      setweight(to_tsvector(cfg, coalesce(NEW."excerpt", '')), 'B')
    END;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Article_search_vector_trg"
  BEFORE INSERT OR UPDATE OF "title", "excerpt", "language" ON "Article"
  FOR EACH ROW EXECUTE FUNCTION frealgo_article_search_vector();
