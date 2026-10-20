import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

const sheet = (page: Page) => page.getByTestId('country-sheet');

test.describe('country workspace', () => {
  test('keyboard: pick a country, focus moves to the sheet, Escape closes and restores focus @cross', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop keyboard flow');
    await page.goto('/?intro=0');
    const input = page.getByLabel('Find a country');
    await input.fill('kenya');
    await input.press('ArrowDown');
    await expect(page.locator('a[data-country="KE"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/country=KE/);
    await expect(sheet(page).getByRole('heading', { name: 'Kenya' })).toBeFocused();
    await expect(sheet(page)).toHaveAttribute('data-mode', 'panel');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/country=/);
    await expect(page.locator('a[data-country="KE"]')).toBeFocused();
  });

  test('deep link opens a country on a sector', async ({ page }) => {
    await page.goto('/?country=MM&sector=agriculture&intro=0');
    await expect(sheet(page).getByRole('heading', { name: 'Myanmar' })).toBeVisible();
    await expect(
      page.getByTestId('sector-nav').getByRole('link', { name: 'Agriculture' }),
    ).toHaveAttribute('aria-current', 'page');
    const cards = page.getByTestId('story-card');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all())
      await expect(card.getByText('Agriculture', { exact: true })).toBeVisible();
  });

  test('switching countries keeps the sector (spatial memory) and the panel position', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop panel');
    await page.goto('/?country=MM&sector=politics&intro=0');
    const before = await sheet(page).boundingBox();
    await page.locator('a[data-country="KE"]').click();
    await expect(page).toHaveURL(/country=KE/);
    await expect(page).toHaveURL(/sector=politics/);
    await expect(sheet(page).getByRole('heading', { name: 'Kenya' })).toBeVisible();
    const after = await sheet(page).boundingBox();
    expect(Math.round(after!.x)).toBe(Math.round(before!.x));
    expect(Math.round(after!.width)).toBe(Math.round(before!.width));
  });

  test('finite pagination: Next/Previous, no duplicates, and an explicit end', async ({ page }) => {
    await page.goto('/?country=KE&limit=5&intro=0');
    const titles = async () => page.getByTestId('story-card').locator('h3').allInnerTexts();
    const p1 = await titles();
    expect(p1).toHaveLength(5);
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
    const p2 = await titles();
    expect(p2.some((t) => p1.includes(t))).toBe(false);
    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page.getByText(/Page 1 of/)).toBeVisible();
    expect(await titles()).toEqual(p1);
    // Walk to the end: an intentional "caught up" state, no infinite loading.
    for (let n = 2; n < 12; n++) {
      const next = page.getByRole('link', { name: 'Next' });
      if ((await next.count()) === 0) break;
      await next.click();
      await expect(page.getByText(new RegExp(`Page ${n} of`))).toBeVisible();
    }
    await expect(page.getByTestId('caught-up')).toBeVisible();
  });

  test('story links open the original publisher safely', async ({ page }) => {
    await page.goto('/?country=KE&intro=0');
    const link = page.getByTestId('story-card').first().locator('h3 a');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('rel', /noreferrer/);
    expect(await link.getAttribute('href')).toMatch(/^https:\/\/.+\.example\//);
  });

  test('filters apply transparently and can be reset', async ({ page }) => {
    await page.goto('/?country=US&intro=0');
    await page.getByTestId('filters-panel').locator('summary').click();
    await page.getByTestId('filter-form').getByLabel('Center-Right').check();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/orientation=center-right/);
    await expect(page.getByTestId('filters-panel').locator('summary')).toContainText(
      'Center-Right',
    );
    for (const card of await page.getByTestId('story-card').all())
      await expect(card).toContainText('Prairie Standard');
    // The panel keeps its open/closed state across client navigation; make sure it is open.
    await page
      .getByTestId('filters-panel')
      .evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await page.getByRole('link', { name: 'Reset filters' }).click();
    await expect(page).not.toHaveURL(/orientation=/);
  });

  test('mobile: bottom sheet is a modal dialog with a close button @cross', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/?country=KE&intro=0');
    await expect(sheet(page)).toHaveAttribute('role', 'dialog');
    await expect(sheet(page)).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('sheet-handle')).toBeVisible();
    const close = page.getByTestId('sheet-close');
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(sheet(page)).toHaveCount(0);
  });

  test('invalid link parameters are ignored with a notice instead of an error', async ({
    page,
  }) => {
    await page.goto('/?country=KE&sort=popularity&orientation=liberal&intro=0');
    await expect(sheet(page).getByRole('status').filter({ hasText: 'ignored' })).toBeVisible();
    expect(await page.getByTestId('story-card').count()).toBeGreaterThan(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('country sheet, sector links and pagination work as plain HTML', async ({ page }) => {
    await page.goto('/?country=KE&limit=5');
    await expect(sheet(page).getByRole('heading', { name: 'Kenya' })).toBeVisible();
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page.getByText(/Page 2 of/)).toBeVisible();
    await page
      .getByTestId('sector-nav')
      .getByRole('link', { name: 'Culture', exact: true })
      .click();
    await expect(page).toHaveURL(/sector=culture/);
    await expect(page).not.toHaveURL(/cursor=/);
  });

  test('search form works without JavaScript', async ({ page, isMobile }) => {
    test.skip(isMobile, 'one run is enough');
    await page.goto('/search');
    await page.locator('aside').getByLabel('Keywords').fill('irrigation');
    await page.locator('aside').getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/q=irrigation/);
    await expect(page.getByTestId('ordering-note')).toContainText('Text relevance');
    expect(await page.getByTestId('story-card').count()).toBeGreaterThan(0);
  });
});

test.describe('search', () => {
  test('explains relevance and supports user-chosen order', async ({ page }) => {
    await page.goto('/search?q=harvest&intro=0');
    await expect(page.getByText(/never popularity, engagement or political lean/)).toBeVisible();
    await expect(page.getByTestId('ordering-note')).toContainText('Text relevance');
    await page.goto('/search?q=harvest&sort=oldest');
    await expect(page.getByTestId('ordering-note')).toContainText('Oldest first');
  });
});

test.describe('settings (local by default)', () => {
  test('default order and pinned countries persist in this browser only', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop');
    await page.goto('/settings?intro=0');
    await page.getByLabel('Oldest first').check();
    await page.getByLabel('Country to pin').selectOption('KE');
    await page.getByRole('button', { name: 'Pin' }).click();
    await expect(page.getByRole('button', { name: 'Unpin Kenya' })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('frealgo:prefs:v1'));
    expect(JSON.parse(stored!)).toMatchObject({ preferredSort: 'oldest', pinnedCountries: ['KE'] });
    await page.goto('/?country=KE');
    await expect(page).toHaveURL(/sort=oldest/);
    await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible();
  });
});

test.describe('accessibility (axe, WCAG 2.2 AA rules)', () => {
  for (const path of [
    '/?country=MM&sector=agriculture&intro=0',
    '/search?q=rice&intro=0',
    '/sources?intro=0',
    '/status?intro=0',
    '/settings?intro=0',
    '/methodology?intro=0',
  ]) {
    test(`no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      // Best-effort settle: under a loaded CI host "networkidle" may never be reached for 500 ms.
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target.join(' ')})`),
      ).toEqual([]);
    });
  }
});
