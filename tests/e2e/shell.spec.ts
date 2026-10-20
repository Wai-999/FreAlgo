import { expect, test } from './fixtures';

test.describe('application shell', () => {
  test('desktop shows header, country list and map @cross', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop layout');
    await page.goto('/?intro=0');
    await expect(page.getByRole('link', { name: 'FreAlgo home' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
    await expect(page.getByLabel('Find a country')).toBeVisible();
    await expect(page.getByTestId('world-map-svg')).toBeVisible();
  });

  test('mobile shows view switch and an accessible country list @cross', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'mobile layout');
    await page.goto('/?intro=0');
    await expect(page.getByTestId('view-switch')).toBeVisible();
    await page.getByRole('link', { name: 'Country list' }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.getByLabel('Find a country')).toBeVisible();
    // Touch targets are at least 44x44 CSS px.
    const box = await page.getByRole('link', { name: 'Country list' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('deep link selects a country', async ({ page }) => {
    await page.goto('/?country=MM&intro=0');
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Myanmar' }),
    ).toBeVisible();
  });

  test('country picker filters by name and ISO code with keyboard navigation', async ({
    page,
    isMobile,
  }) => {
    await page.goto(isMobile ? '/?view=list&intro=0' : '/?intro=0');
    const input = page.getByLabel('Find a country').first();
    await input.fill('myan');
    await expect(page.getByText('1 of 250 countries match')).toBeVisible();
    await input.press('ArrowDown');
    await expect(page.locator('a[data-country="MM"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/country=MM/);
  });

  test('sets security headers on pages', async ({ request }) => {
    const res = await request.get('/');
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('health endpoints report ready', async ({ request }) => {
    const live = await request.get('/api/v1/health/live');
    expect(live.ok()).toBe(true);
    const ready = await request.get('/api/v1/health');
    expect((await ready.json()).checks.database).toBe('ok');
  });
});

test.describe('intro', () => {
  test('plays once per session and can be skipped', async ({ page }) => {
    await page.goto('/');
    const intro = page.getByTestId('intro');
    await expect(intro).toBeVisible();
    await page.getByRole('button', { name: 'Skip intro' }).click();
    await expect(intro).toBeHidden();
    await page.reload();
    await expect(intro).toBeHidden();
  });

  test('finishes within ~1.5s without interaction', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('intro')).toBeVisible();
    await expect(page.getByTestId('intro')).toBeHidden({ timeout: 2_500 });
  });

  test('is bypassed entirely with prefers-reduced-motion @cross', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'skip');
    await expect(page.getByTestId('intro')).toBeHidden();
    await context.close();
  });

  test('is bypassed when disabled in local preferences', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('frealgo:prefs:v1', JSON.stringify({ showIntro: false })),
    );
    await page.goto('/');
    await expect(page.getByTestId('intro')).toBeHidden();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('map and country list remain usable', async ({ page }) => {
    await page.goto('/?view=list');
    await expect(page.getByTestId('intro')).toBeHidden();
    await page.locator('a[data-country="KE"]').first().click();
    await expect(page).toHaveURL(/country=KE/);
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Kenya' }),
    ).toBeVisible();
    expect(await page.getByTestId('story-card').count()).toBeGreaterThan(0);
  });
});

test.describe('flat map links', () => {
  test('clicking a country in the map opens it (client navigation)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await page.goto('/?intro=0');
    await page.frameLocator('[data-testid="world-map-svg"]').locator('a[data-iso2="KE"]').click();
    await expect(page).toHaveURL(/country=KE/);
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Kenya' }),
    ).toBeVisible();
  });
});

test.describe('flat map without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('map links navigate the whole page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop');
    await page.goto('/');
    await page.frameLocator('[data-testid="world-map-svg"]').locator('a[data-iso2="BR"]').click();
    await expect(page).toHaveURL(/country=BR/);
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Brazil' }),
    ).toBeVisible();
  });
});
