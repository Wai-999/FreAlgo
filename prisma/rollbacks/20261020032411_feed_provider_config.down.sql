-- Rollback for feed_provider_config (additive; safe to drop).
ALTER TABLE "FeedSource" DROP COLUMN IF EXISTS "providerConfig";
