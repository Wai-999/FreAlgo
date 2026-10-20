/** Resolves the integration-test database URL and refuses to touch anything but a *_test DB. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // CI provides variables directly.
  }
}

export function testDatabaseUrl(): string {
  loadDotEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST must be set for integration tests');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against non-test database "${dbName}"`);
  }
  return url;
}
