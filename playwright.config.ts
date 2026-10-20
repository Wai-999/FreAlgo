import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a production build (`next build && next start`) on port 3100, using the
 * database in DATABASE_URL (seeded with fixtures). Cross-browser projects run the @cross subset.
 */
// Headless Chromium has no GPU. Only the globe spec enables SwiftShader WebGL (see
// tests/e2e/globe.spec.ts); everywhere else WebGL is unavailable, which exercises the 2D fallback
// and keeps the suite fast.
export const CHROMIUM_WEBGL = [
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
];
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Two workers keep memory use moderate (each worker runs a full browser).
  workers: 2,
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
        command: 'sh scripts/start-standalone.sh',
        url: `${baseURL}/api/v1/health/live`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { E2E: '1', APP_BASE_URL: baseURL, PORT: String(PORT), HOSTNAME: '127.0.0.1' },
      },
});
