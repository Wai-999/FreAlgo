import { expect, test } from './fixtures';

test.describe('source governance pages', () => {
  test('freshness page is truthful about paused, fixture and never-synced sources @cross', async ({
    page,
  }) => {
    await page.goto('/status?intro=0');
    await expect(page.getByRole('heading', { name: 'Feed freshness' })).toBeVisible();
    await expect(page.getByText('0 */3 * * *')).toBeVisible();
    await expect(page.getByText(/Paused: \d+/)).toBeVisible();
    await expect(page.getByText(/Fixture \(not fetched\): \d+/)).toBeVisible();
    expect(await page.getByTestId('freshness-row').count()).toBeGreaterThan(10);
  });

  test('freshness API exposes schedule semantics', async ({ request }) => {
    const body = await (await request.get('/api/v1/health/freshness')).json();
    expect(body.schedule).toMatchObject({ cron: '0 */3 * * *', timezone: 'UTC' });
    expect(body.schedule.meaning).toMatch(/not guaranteed/);
    expect(body.sources[0]).toHaveProperty('lastSuccessfulSyncAt');
  });

  test('registry shows fixture badges and expandable label provenance', async ({ page }) => {
    await page.goto('/sources?intro=0');
    await expect(page.getByText('Fixture: not real news').first()).toBeVisible();
    const label = page.getByTestId('source-label').first();
    await label.locator('summary').click();
    await expect(label.getByText('not', { exact: true }).first()).toBeVisible();
    await expect(label.getByText(/Methodology/)).toBeVisible();
  });

  test('admin console requires an administrator', async ({ page, request }) => {
    await page.goto('/admin?intro=0');
    await expect(page.getByText('Administrator access required')).toBeVisible();
    const api = await request.get('/api/v1/admin/sources');
    expect(api.status()).toBe(401);
  });

  test('local dev sign-in grants the admin console to listed admins', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'desktop flow');
    await page.goto('/account?intro=0');
    await page.getByLabel('Test identity name').fill('local-admin');
    await page.getByRole('button', { name: 'Sign in (development)' }).click();
    await expect(page.getByText('Signed in as')).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin console' })).toBeVisible();
    expect(await page.getByTestId('admin-source').count()).toBeGreaterThan(10);
  });
});

test.describe('label appeal without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('submits through a plain HTML form', async ({ page, isMobile }) => {
    test.skip(isMobile, 'one run is enough');
    await page.goto('/sources/deccan-observer-fixture');
    await page
      .getByLabel('What should change, and why?')
      .fill('E2E test appeal: please re-check the cited methodology for this fixture.');
    await page.getByRole('button', { name: 'Send appeal' }).click();
    await expect(page.getByRole('status')).toContainText('Your appeal was recorded');
  });
});
