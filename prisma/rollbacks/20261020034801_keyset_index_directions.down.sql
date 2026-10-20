-- Rollback for keyset_index_directions: restore the original index definitions.
DROP INDEX IF EXISTS "Article_publishedAt_id_idx";
DROP INDEX IF EXISTS "Article_outletId_publishedAt_id_idx";
DROP INDEX IF EXISTS "Article_status_publishedAt_id_idx";
CREATE INDEX "Article_publishedAt_id_idx" ON "Article"("publishedAt" DESC, "id");
CREATE INDEX "Article_outletId_publishedAt_idx" ON "Article"("outletId", "publishedAt" DESC);
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt" DESC);
