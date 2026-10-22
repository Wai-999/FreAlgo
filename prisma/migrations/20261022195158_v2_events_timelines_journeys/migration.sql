-- CreateEnum
CREATE TYPE "TimelineKind" AS ENUM ('FACT', 'INTERPRETATION', 'ANALOGY');

-- CreateTable
CREATE TABLE "NewsEvent" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleArticleId" TEXT,
    "language" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "methodVersion" INTEGER NOT NULL,
    "sharedTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "outletCount" INTEGER NOT NULL DEFAULT 0,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventArticle" (
    "articleId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sharedTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchedArticleId" TEXT,
    "methodVersion" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventArticle_pkey" PRIMARY KEY ("articleId")
);

-- CreateTable
CREATE TABLE "TimelineEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "datePrecision" TEXT NOT NULL DEFAULT 'DAY',
    "kind" "TimelineKind" NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "curatedBy" TEXT NOT NULL,
    "curatedAt" TIMESTAMP(3) NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryJourney" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "curatedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "caveats" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StoryJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyNode" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "countryId" TEXT,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "kind" "TimelineKind" NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "evidenceUrl" TEXT NOT NULL,
    "evidenceName" TEXT NOT NULL,
    "uncertainty" TEXT,

    CONSTRAINT "JourneyNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsEvent_slug_key" ON "NewsEvent"("slug");

-- CreateIndex
CREATE INDEX "NewsEvent_isFixture_lastAt_id_idx" ON "NewsEvent"("isFixture", "lastAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "NewsEvent_isFixture_outletCount_lastAt_idx" ON "NewsEvent"("isFixture", "outletCount", "lastAt" DESC);

-- CreateIndex
CREATE INDEX "EventArticle_eventId_articleId_idx" ON "EventArticle"("eventId", "articleId");

-- CreateIndex
CREATE INDEX "TimelineEntry_eventId_occurredAt_idx" ON "TimelineEntry"("eventId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryJourney_slug_key" ON "StoryJourney"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyNode_journeyId_position_key" ON "JourneyNode"("journeyId", "position");

-- AddForeignKey
ALTER TABLE "EventArticle" ADD CONSTRAINT "EventArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventArticle" ADD CONSTRAINT "EventArticle_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyNode" ADD CONSTRAINT "JourneyNode_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "StoryJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyNode" ADD CONSTRAINT "JourneyNode_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyNode" ADD CONSTRAINT "JourneyNode_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NewsEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Curated statements must cite a web source; scores stay in range (raw SQL: not expressible in Prisma).
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_source_url_chk" CHECK ("sourceUrl" ~ '^https?://' AND length("sourceName") > 0);
ALTER TABLE "JourneyNode" ADD CONSTRAINT "JourneyNode_evidence_url_chk" CHECK ("evidenceUrl" ~ '^https?://' AND length("evidenceName") > 0);
ALTER TABLE "EventArticle" ADD CONSTRAINT "EventArticle_score_chk" CHECK ("score" >= 0 AND "score" <= 1);
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_precision_chk" CHECK ("datePrecision" IN ('DAY', 'MONTH', 'YEAR'));
