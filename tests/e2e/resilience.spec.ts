import { expect, test } from './fixtures';

/**
 * Slow-network behaviour. Pages are server-rendered with real links and GET forms, so readers can
 * pick a country and filter before any JavaScript has arrived.
 */
test('slow network: countries and filters work before JavaScript arrives @cross', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'the desktop layout shows the country list next to the map');
  // Hold every script for 8 s: roughly a first visit on a very slow connection.
  await page.route('**/_next/static/**/*.js', async (route) => {
    await new Promise((r) => setTimeout(r, 8_000));
    await route.continue().catch(() => undefined);
  });
  const t0 = Date.now();
  await page.goto('/?intro=0', { waitUntil: 'domcontentloaded' });
  await page.locator('a[data-country="KE"]').click();
  const sheet = page.getByTestId('country-sheet');
  await expect(sheet.getByRole('heading', { name: 'Kenya', exact: true })).toBeVisible();
  // Stories are server-rendered too.
  await expect(sheet.getByTestId('story-card').first()).toBeVisible();
  expect(Date.now() - t0, 'navigated without waiting for scripts').toBeLessThan(8_000);
});
