import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { expect, settleForAxe, test } from './fixtures';

/**
 * Release accessibility sweep (Milestone 5): every remaining public page, the welcome intro,
 * a no-coverage country, and the admin console. Complements the per-feature scans in
 * workspace.spec.ts. Runs on desktop and mobile Chromium.
 */
async function seriousViolations(page: Page): Promise<string[]> {
  await settleForAxe(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target.join(' ')})`);
}

test.describe('accessibility sweep (axe, WCAG 2.2 AA rules)', () => {
  for (const path of [
    '/', // welcome intro
    '/?intro=0', // explore with the 2D map and country list
    '/?country=AQ&intro=0', // a country with no sources: coverage-gap notice
    '/?country=MM&outlet=irrawaddy-ledger-fixture&intro=0', // outlet filter applied
    '/search?q=zzzz-no-match&intro=0', // empty results state
    '/sources/irrawaddy-ledger-fixture?intro=0',
    '/about?intro=0',
    '/privacy?intro=0',
    '/account?intro=0',
  ]) {
    test(`no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      // The welcome intro is decorative (aria-hidden) and fades for 1.5 s; contrast is checked
      // on the settled page, not on frames mid-fade.
      if (path === '/') await expect(page.getByTestId('intro')).toBeHidden({ timeout: 5_000 });
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test('no serious or critical violations in the admin console', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop operator flow');
    await page.goto('/account?intro=0');
    await page.getByLabel('Test identity name').fill('local-admin');
    await page.getByRole('button', { name: 'Sign in (development)' }).click();
    await expect(page.getByText('Signed in as')).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin console' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('layout and structure', () => {
  const pages = [
    '/?intro=0',
    '/?country=MM&intro=0',
    '/search?q=rice&intro=0',
    '/sources?intro=0',
    '/sources/irrawaddy-ledger-fixture?intro=0',
    '/status?intro=0',
    '/settings?intro=0',
    '/methodology?intro=0',
    '/about?intro=0',
    '/privacy?intro=0',
  ];

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
    const page = await context.newPage();
    for (const path of pages) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });

  test('every page has exactly one h1 and a main landmark', async ({ page }) => {
    for (const path of pages) {
      await page.goto(path);
      expect(await page.locator('h1').count(), `h1 count on ${path}`).toBe(1);
      expect(await page.getByRole('main').count(), `main landmark on ${path}`).toBe(1);
    }
  });
});
