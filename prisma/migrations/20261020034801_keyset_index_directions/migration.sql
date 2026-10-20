-- DropIndex
DROP INDEX "Article_outletId_publishedAt_idx";

-- DropIndex
DROP INDEX "Article_publishedAt_id_idx";

-- DropIndex
DROP INDEX "Article_status_publishedAt_idx";

-- CreateIndex
CREATE INDEX "Article_publishedAt_id_idx" ON "Article"("publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Article_outletId_publishedAt_id_idx" ON "Article"("outletId", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_id_idx" ON "Article"("status", "publishedAt" DESC, "id" DESC);
