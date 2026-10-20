import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from '../support/test-env';

/** Recreates the test schema from migrations once per run (exercises `migrate deploy`). */
export default async function setup() {
  const url = testDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
