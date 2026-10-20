import { testDatabaseUrl } from '../support/test-env';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SHOW_FIXTURES = 'true';
// Keep test output readable; set TEST_LOG_LEVEL=info to see request logs while debugging.
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
