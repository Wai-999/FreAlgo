import { testDatabaseUrl } from '../support/test-env';

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SHOW_FIXTURES = 'true';
