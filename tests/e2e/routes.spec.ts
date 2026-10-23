import { expect, test } from './fixtures';

/**
 * Route preservation (FreAlgo 2.0, M1): every public URL that existed in v1 must keep working.
 * See docs/architecture/route-map.md. Runs once (desktop Chromium); it checks the server, not
 * the browser engine.
 */
const v1Pages: [path: string, h1: RegExp][] = [
  ['/?intro=0', /Explore news by country/],
  ['/?country=US&intro=0', /Explore news by country/],
  ['/?view=list&intro=0', /Explore news by country/],
  ['/search?q=rice', /Search/],
  ['/sources', /Source registry/],
  ['/sources/irrawaddy-ledger-fixture', /Irrawaddy Ledger/],
  ['/status', /Feed freshness/],
  ['/methodology', /Methodology/],
  ['/about', /About FreAlgo/],
  ['/privacy', /Privacy/],
  ['/settings', /Settings/],
  ['/account', /Account/],
];
const v1Api = [
  '/api/v1/health/live',
  '/api/v1/health',
  '/api/v1/health/freshness',
  '/api/v1/countries',
  '/api/v1/countries/MM/articles?limit=1',
  '/api/v1/articles/search?q=rice&limit=1',
  '/api/v1/outlets',
  '/api/v1/sectors',
];

test.describe('v1 routes are preserved', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'server check');

  for (const [path, h1] of v1Pages) {
    test(`page ${path}`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1').first()).toHaveText(h1);
    });
  }

  for (const path of v1Api) {
    test(`api ${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/json');
    });
  }
});
