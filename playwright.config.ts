import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a production build (`next build && next start`) on port 3100, using the
 * database in DATABASE_URL (seeded with fixtures). Cross-browser projects run the @cross subset.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 14'] }, grep: /@cross/ },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] }, grep: /@cross/ },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] }, grep: /@cross/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/api/v1/health/live`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { E2E: '1', APP_BASE_URL: baseURL },
      },
});
