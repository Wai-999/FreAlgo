import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** FreAlgo 2.0, M3: navigation, Stories, reading depths, Why, Discover, My World, preferences. */
const PREFS_KEY = 'frealgo:prefs:v1';
const prefs = (patch: Record<string, unknown>) =>
  JSON.stringify({
    version: 1,
    showIntro: false,
    motion: 'system',
    globeEnabled: true,
    preferredSort: 'newest',
    pinnedCountries: [],
    sectors: [],
    orientations: [],
    languages: [],
    outletIds: [],
    syncToAccount: false,
    ...patch,
  });

async function serious(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
}

test.describe('navigation', () => {
  test('primary sections and transparency pages are both reachable @cross', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/stories');
    if (isMobile) {
      await page.locator('header details').filter({ hasText: 'Menu' }).locator('summary').click();
    } else {
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    const primary = page.getByRole('navigation', { name: 'Primary' }).locator('visible=true');
    for (const name of ['Explore', 'Stories', 'Discover', 'My World'])
      await expect(primary.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(primary.getByRole('link', { name: 'Stories' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const transparency = page
      .getByRole('navigation', { name: 'Transparency and settings' })
      .locator('visible=true');
    for (const name of ['Search', 'Sources', 'Freshness', 'Methodology', 'About', 'Settings'])
      await expect(transparency.getByRole('link', { name, exact: true })).toBeVisible();
  });
});

test.describe('Stories', () => {
  test('finite pages end in a caught-up state; scrolling never loads more @cross', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/stories?country=MM&limit=10');
    const cards = page.getByTestId('story-card');
    await expect(cards).toHaveCount(10);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await expect(cards).toHaveCount(10); // no infinite scroll
    for (let i = 0; i < 10; i++) {
      const next = page.getByTestId('pagination').getByRole('link', { name: /Next/ });
      if (!(await next.count())) break;
      const before = page.url();
      await next.click();
      await expect(page).not.toHaveURL(before); // wait for the new page, not just any cursor URL
    }
    await expect(page.getByText('You are caught up.')).toBeVisible();
  });

  test('reading depths change what each card shows; original links are safe', async ({ page }) => {
    await page.goto('/stories?depth=quick&limit=5');
    await expect(page.locator('[data-testid="story-card"][data-depth="quick"]')).toHaveCount(5);
    await expect(page.getByText('Synthetic fixture text').first()).toBeHidden();
    await page
      .getByTestId('reading-depth')
      .getByRole('link', { name: 'Original reporting' })
      .click();
    await expect(page).toHaveURL(/depth=original/);
    const link = page.getByTestId('original-link').first();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener noreferrer/);
    await expect(link).toHaveAttribute('href', /^https:\/\//);
  });

  test('Why this story? explains the country evidence and the order', async ({ page }) => {
    await page.goto('/stories?country=MM&limit=3');
    const why = page.getByTestId('why-this-story').first();
    await why.locator('summary').click();
    await expect(why).toContainText('Myanmar');
    await expect(why).toContainText('Ordered by publication time, newest first.');
    await expect(why).toContainText('Nothing about you');
  });
});

test.describe('Discover', () => {
  test('a seed always gives the same explained pick, with a permalink @cross', async ({ page }) => {
    await page.goto('/discover?seed=123456');
    const result = page.getByTestId('surprise-result');
    await expect(result).toBeVisible();
    const first = await result.locator('p.text-2xl').innerText();
    await expect(page.getByTestId('selection-method')).toContainText('SHA-256');
    await page.reload();
    await expect(result.locator('p.text-2xl')).toHaveText(first);
    await expect(
      page.getByTestId('selection-method').getByRole('link', { name: /Permanent link/ }),
    ).toHaveAttribute('href', /seed=123456/);
    await expect(page.getByTestId('daily-discovery')).toBeVisible();
  });

  test('the API is deterministic too', async ({ request }) => {
    const a = await (await request.get('/api/v1/discover/random?seed=7')).json();
    const b = await (await request.get('/api/v1/discover/random?seed=7')).json();
    expect(a.data?.pick ?? a.pick).toEqual(b.data?.pick ?? b.pick);
  });
});

test.describe('My World', () => {
  test('opens the page for the choices saved in this browser @cross', async ({ page }) => {
    await page.addInitScript(
      ([k, v]) => localStorage.setItem(k!, v!),
      [PREFS_KEY, prefs({ pinnedCountries: ['MM'] })],
    );
    await page.goto('/my-world');
    await expect(page).toHaveURL(/\/my-world\?country=MM/);
    await expect(page.getByRole('heading', { name: 'Myanmar', level: 2 })).toBeVisible();
    await page.getByTestId('why-this-story').first().locator('summary').click();
    await expect(page.getByTestId('why-this-story').first()).toContainText(
      'Myanmar is one of the countries you chose.',
    );
  });

  test('explains how to start when nothing is chosen', async ({ page }) => {
    await page.goto('/my-world');
    await expect(page.getByTestId('my-world-empty')).toBeVisible();
  });

  test('preferences can be imported from a file', async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId('prefs-import').setInputFiles({
      name: 'prefs.json',
      mimeType: 'application/json',
      buffer: Buffer.from(prefs({ pinnedCountries: ['KE'] })),
    });
    await expect(page.getByText('Imported preferences from the file.')).toBeVisible();
    const stored = await page.evaluate((k) => localStorage.getItem(k), PREFS_KEY);
    expect(JSON.parse(stored!).pinnedCountries).toEqual(['KE']);
  });
});

test('keyboard: ArrowDown right after instant typing focuses the first match (defect D2)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'desktop keyboard flow');
  await page.goto('/?intro=0');
  await page.getByLabel('Find a country').focus();
  await page.keyboard.type('kenya'); // no delay: faster than the deferred list re-render
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('a[data-country="KE"]')).toBeFocused();
});

test.describe('accessibility and reflow of v2 pages', () => {
  const pages = ['/stories', '/stories?depth=original', '/discover?seed=1', '/my-world?country=MM'];
  for (const path of pages) {
    test(`no serious or critical axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await serious(page)).toEqual([]);
    });
  }
  test('reflows at 320 CSS px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    const page = await ctx.newPage();
    for (const path of [...pages, '/discover']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
});
