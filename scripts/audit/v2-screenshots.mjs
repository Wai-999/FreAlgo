// FreAlgo 2.0 screenshots (M3+): new sections at desktop and phone sizes.
//   node scripts/audit/v2-screenshots.mjs [baseUrl] [outDir]
// Uses the 2D map (WebGL disabled) for determinism; fixture data is badged in the UI.
import { mkdirSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const out = process.argv[3] ?? 'docs/screenshots/v2';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const phone = devices['Pixel 7'];
const prefs = JSON.stringify({
  version: 1,
  showIntro: false,
  motion: 'system',
  globeEnabled: true,
  preferredSort: 'newest',
  pinnedCountries: ['MM', 'KE'],
  sectors: [],
  orientations: [],
  languages: [],
  outletIds: [],
  syncToAccount: false,
});

async function shot(
  name,
  path,
  { device = desktop, before, withPrefs = false, fullPage = false } = {},
) {
  const ctx = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    const p = HTMLCanvasElement.prototype;
    const o = p.getContext;
    p.getContext = function (t, ...a) {
      return /webgl/i.test(t) ? null : o.call(this, t, ...a);
    };
  });
  if (withPrefs) await ctx.addInitScript((v) => localStorage.setItem('frealgo:prefs:v1', v), prefs);
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  if (before) await before(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
  await ctx.close();
  console.log(`wrote ${out}/${name}.png`);
}

const openWhy = (p) => p.getByTestId('why-this-story').first().locator('summary').click();
await shot('01-stories-deep-why', '/stories?limit=6', { before: openWhy });
await shot('02-stories-quick-phone', '/stories?depth=quick&limit=8', { device: phone });
await shot('03-stories-original', '/stories?depth=original&limit=4');
await shot('04-discover-surprise', '/discover?seed=123456');
await shot('05-discover-phone', '/discover?seed=123456', { device: phone });
await shot('06-my-world', '/my-world', {
  withPrefs: true,
  before: (p) => p.waitForURL(/country=MM/),
});
await shot('07-country-scope-notice', '/?country=MM&intro=0');
await shot('08-nav-phone-menu', '/stories', {
  device: phone,
  before: (p) => p.locator('header details').filter({ hasText: 'Menu' }).locator('summary').click(),
});
await shot('09-status-quality', '/status', {
  before: (p) => p.locator('#quality').scrollIntoViewIfNeeded(),
});
await shot('10-methodology-features', '/methodology', {
  before: (p) => p.locator('#features').scrollIntoViewIfNeeded(),
});
await browser.close();
