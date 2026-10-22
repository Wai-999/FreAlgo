-- Rollback for 20261022202201_v2_event_exclusions (FreAlgo 2.0, M4). Removes only the exclusion list.
-- Afterwards: DELETE FROM "_prisma_migrations" WHERE migration_name = '20261022202201_v2_event_exclusions';
DROP TABLE IF EXISTS "EventExclusion";
