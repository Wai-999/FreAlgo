-- Rollback for 20261022195158_v2_events_timelines_journeys (FreAlgo 2.0, M4).
-- Removes only the new event, timeline and journey tables; articles and their tags are untouched.
-- Afterwards: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022195158_v2_events_timelines_journeys';
BEGIN;
DROP TABLE IF EXISTS "JourneyNode";
DROP TABLE IF EXISTS "StoryJourney";
DROP TABLE IF EXISTS "TimelineEntry";
DROP TABLE IF EXISTS "EventArticle";
DROP TABLE IF EXISTS "NewsEvent";
DROP TYPE IF EXISTS "TimelineKind";
COMMIT;
