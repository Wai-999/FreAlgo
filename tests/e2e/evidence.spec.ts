import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type Page } from '@playwright/test';
import { expect, settleForAxe, test } from './fixtures';

/**
 * FreAlgo 2.0, M4: events, Story Mode, Perspectives, timelines, journeys, World Pulse and country
 * connections, against the fictional fixture events (prisma/data/fixtures.ts). The e2e server
 * switches on the off-by-default features (playwright.config.ts).
 */
async function salweenSlug(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/events?minOutlets=2&limit=50');
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { items: { slug: string; title: string }[] };
  const ev = body.items.find((e) => e.title.includes('Salween'));
  expect(ev, 'fixture Salween event exists').toBeTruthy();
  return ev!.slug;
}

async function serious(page: Page) {
  await settleForAxe(page);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
}

test.describe('events and Story Mode', () => {
  test('Stories links to events; an event keeps every original report @cross', async ({ page }) => {
    await page.goto('/stories');
    await page.getByTestId('events-strip').getByRole('link', { name: 'All events' }).click();
    await expect(page).toHaveURL(/\/stories\/events$/);
    const card = page.getByTestId('event-card').filter({ hasText: 'Salween' });
    await expect(card).toContainText('5 reports from 5 outlets');
    await card.getByRole('link', { name: 'Story Mode' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Salween');
    for (const name of [
      'What happened?',
      'Where?',
      'Why does it matter?',
      'What do sources report?',
      'What remains uncertain?',
      'Timeline',
      'Next known dates',
    ])
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    const originals = page.getByTestId('headlines').getByRole('link');
    await expect(originals).toHaveCount(5);
    for (const link of await originals.all()) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener noreferrer/);
      await expect(link).toHaveAttribute('href', /^https:\/\/[a-z-]+\.example\//);
    }
    await expect(page.getByTestId('event-reports').getByTestId('story-card')).toHaveCount(5);
    await expect(page.getByTestId('shared-wording')).toContainText('not verified facts');
    await expect(page.getByTestId('uncertainties')).toContainText('does not verify facts');
  });

  test('timeline labels fact, interpretation and analogy, with sources and next dates', async ({
    page,
    request,
  }) => {
    await page.goto(`/stories/${await salweenSlug(request)}`);
    const timeline = page.getByTestId('timeline');
    for (const kind of ['Fact', 'Interpretation', 'Analogy'])
      await expect(timeline.getByText(kind, { exact: true }).first()).toBeVisible();
    await expect(timeline).toContainText('Source:');
    await expect(page.getByTestId('next-dates')).toContainText('technical committee');
    // Each report explains why it was grouped.
    const why = page.getByTestId('why-this-story').first();
    await why.locator('summary').click();
    await expect(why).toContainText('Grouped into this event because its headline shares');
  });

  test('a missing event is a 404, not an invented page', async ({ page }) => {
    const res = await page.goto('/stories/2026-01-01-no-such-event-000000');
    expect(res?.status()).toBe(404);
  });
});

test.describe('Perspectives', () => {
  test('lists comparable events and compares outlets side by side @cross', async ({ page }) => {
    await page.goto('/perspectives');
    const card = page.getByTestId('event-card').filter({ hasText: 'Salween' });
    await card.getByRole('link', { name: 'Compare outlets' }).click();
    const columns = page.getByTestId('perspective-column');
    await expect(columns).toHaveCount(5);
    await expect(columns.first().getByTestId('source-label')).toBeVisible();
    await expect(page.getByTestId('perspective-columns')).toContainText('Opinion');
    await expect(page.getByTestId('perspective-columns')).toContainText('Analysis');
    await expect(page.getByTestId('claims')).toContainText('Not assessed');
    await expect(page.getByTestId('gaps')).toContainText('Thailand');
    await expect(page.getByTestId('label-summary')).toContainText('Disputed: 1');
  });

  test('a single-outlet event is not offered for comparison', async ({ request }) => {
    const body = await (await request.get('/api/v1/events?minOutlets=2&limit=50')).json();
    expect(body.items.every((e: { outlets: number }) => e.outlets >= 2)).toBe(true);
    expect(body.items.some((e: { title: string }) => e.title.includes('Cerrado'))).toBe(false);
  });
});

test.describe('APIs', () => {
  test('events, perspectives, journeys and methodology return evidence, errors use the envelope', async ({
    request,
  }) => {
    const slug = await salweenSlug(request);
    const ev = await (await request.get(`/api/v1/events/${slug}`)).json();
    expect(ev.members).toHaveLength(5);
    expect(ev.members[0].membership.sharedTerms.length).toBeGreaterThanOrEqual(2);
    expect(ev.method.version).toBe(1);
    const p = await (await request.get(`/api/v1/events/${slug}/perspectives`)).json();
    expect(p.columns).toHaveLength(5);
    expect(p.claimsInDispute.assessed).toBe(false);
    expect(p.caveat).toMatch(/not the world/);
    const j = await (await request.get('/api/v1/journeys/fixture-river-and-sun')).json();
    expect(j.steps).toHaveLength(4);
    expect(j.steps.every((s: { evidenceUrl: string }) => /^https:\/\//.test(s.evidenceUrl))).toBe(
      true,
    );
    const m = await (await request.get('/api/v1/methodology')).json();
    expect(m.aiSummaries.enabled).toBe(false);
    const missing = await request.get('/api/v1/events/nope');
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');
    const bad = await request.get('/api/v1/events?cursor=garbage');
    expect(bad.status()).toBe(400);
  });
});

test.describe('journeys, World Pulse and connections (flagged)', () => {
  test('a journey moves only when asked and has a full plain-text list @cross', async ({
    page,
  }) => {
    await page.goto('/discover');
    await page
      .getByTestId('journeys')
      .getByRole('link', { name: /water data and solar power/ })
      .click();
    await expect(page.getByTestId('journey-caveats')).toContainText('fictional');
    await expect(page.getByTestId('journey-list').locator('> li')).toHaveCount(4);
    await page.getByRole('link', { name: 'Go step by step' }).click();
    await expect(page.getByTestId('journey-step')).toContainText('Step 1 of 4');
    await page.getByRole('link', { name: 'Next step' }).click();
    await expect(page.getByTestId('journey-step')).toContainText('Step 2 of 4');
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('journey-step')).toContainText('Step 2 of 4'); // no autoplay
    await page.getByRole('link', { name: 'Skip to the full list' }).click();
    await expect(page.getByTestId('journey-list')).toBeVisible();
    await expect(page.getByTestId('journey-list')).toContainText('Interpretation');
  });

  test('World Pulse has a legend, notes and a full text table', async ({ page }) => {
    await page.goto('/world-pulse');
    await expect(page.getByTestId('pulse-map').locator('svg[role="img"]')).toBeVisible();
    await expect(page.getByTestId('pulse-legend')).toContainText('No reports in FreAlgo');
    await expect(page.getByTestId('pulse-notes')).toContainText('not adjusted for population');
    await expect(
      page.getByTestId('pulse-table').getByRole('link', { name: 'Kenya' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Last 24 hours' }).click();
    await expect(page).toHaveURL(/period=24h/);
  });

  test('country connections name the relationship type and link the events', async ({ page }) => {
    await page.goto('/connections?country=MM');
    const list = page.getByTestId('connections');
    await expect(list).toContainText('Thailand');
    await expect(list).toContainText('relationship: shared event cluster');
    await list
      .getByRole('link', { name: /Salween/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Salween');
  });
});

test.describe('accessibility and reflow of M4 pages', () => {
  const fixed = [
    '/stories/events',
    '/perspectives',
    '/world-pulse',
    '/connections?country=MM',
    '/discover/journeys/fixture-river-and-sun',
    '/discover/journeys/fixture-river-and-sun?step=3',
  ];
  test('no serious or critical axe violations', async ({ page, request }) => {
    test.setTimeout(90_000);
    const slug = await salweenSlug(request);
    for (const path of [...fixed, `/stories/${slug}`, `/perspectives/${slug}`]) {
      await page.goto(path);
      expect(await serious(page), path).toEqual([]);
    }
  });

  test('reflows at 320 CSS px', async ({ browser, request }) => {
    const slug = await salweenSlug(request);
    const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
    const page = await ctx.newPage();
    for (const path of [...fixed, `/stories/${slug}`, `/perspectives/${slug}`]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
});
