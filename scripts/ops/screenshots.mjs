// Release screenshots → docs/screenshots/*.png
// Usage: node scripts/ops/screenshots.mjs [baseUrl]   (production server running, dev DB with fixtures)
// The 3D globe renders with SwiftShader here (no GPU in headless Chromium).
import { mkdirSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const noWebGL = () => {
  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext;
  proto.getContext = function (type, ...args) {
    return /webgl/i.test(type) ? null : original.call(this, type, ...args);
  };
};

async function shot(
  name,
  path,
  { device = desktop, webgl = true, waitGlobe = false, fullPage = false, before } = {},
) {
  const context = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  if (!webgl) await context.addInitScript(noWebGL);
  const page = await context.newPage();
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  if (waitGlobe) {
    await page.waitForSelector('[data-testid="globe-stage"][data-mode="globe"]', {
      timeout: 60_000,
    });
    await page.waitForTimeout(1500);
  }
  if (before) await before(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
  await context.close();
  console.log(`wrote ${out}/${name}.png`);
}

await shot('01-desktop-globe', '/?globe=force&intro=0', { waitGlobe: true });
await shot('02-desktop-country-sheet', '/?country=MM&globe=force&intro=0', { waitGlobe: true });
await shot('03-mobile-country-sheet', '/?country=KE&intro=0', {
  device: devices['Pixel 7'],
  webgl: false,
});
await shot('04-desktop-2d-fallback', '/?intro=0', { webgl: false });
await shot('05-search-filters', '/search?q=rice&intro=0');
await shot('06-source-registry', '/sources?intro=0');
await shot('07-source-detail-provenance', '/sources/irrawaddy-ledger-fixture?intro=0', {
  before: (p) =>
    p
      .locator('details')
      .first()
      .evaluate((d) => (d.open = true))
      .catch(() => {}),
});
await shot('08-status-freshness', '/status?intro=0');
await shot('09-coverage-gap', '/?country=AQ&intro=0', { webgl: false });
await browser.close();
