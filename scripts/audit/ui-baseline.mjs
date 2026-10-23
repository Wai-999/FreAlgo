// UI baseline audit (FreAlgo 2.0, Milestone 1). Read-only: GET requests and page loads only.
//
//   node scripts/audit/ui-baseline.mjs [baseUrl] [label]     e.g. https://frealgo.duckdns.org before
//
// Records, per the upgrade spec §2: route status, horizontal overflow at 360/390/430/768/1280/1440
// px and at 200% zoom (1280 px at 2x zoom = 640 CSS px), keyboard country selection, reduced
// motion, WebGL disabled, and time-to-first-story on a throttled "slow 4G" connection.
// Output: docs/audit/ui-<label>.json and docs/audit/screenshots/<label>-*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const base = (process.argv[2] ?? 'https://frealgo.duckdns.org').replace(/\/$/, '');
const label = process.argv[3] ?? 'before';
const shots = 'docs/audit/screenshots';
mkdirSync(shots, { recursive: true });

const routes = [
  '/',
  '/?intro=0',
  '/?country=US&intro=0',
  '/?view=list&intro=0',
  '/search?q=rice',
  '/sources',
  '/sources/bbc-news',
  '/status',
  '/methodology',
  '/about',
  '/settings',
  '/account',
  '/privacy',
  '/stories',
  '/discover',
  '/perspectives',
  '/my-world',
  '/api/v1/health',
  '/api/v1/countries',
  '/api/v1/health/freshness',
  '/api/v1/sectors',
  '/api/v1/outlets',
];
const widths = [360, 390, 430, 768, 1280, 1440, 640];
const noWebGL = () => {
  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext;
  proto.getContext = function (type, ...args) {
    return /webgl/i.test(type) ? null : original.call(this, type, ...args);
  };
};

const result = {
  base,
  label,
  measuredAt: new Date().toISOString(),
  routes: {},
  overflow: {},
  checks: {},
};
const browser = await chromium.launch();

// 1. Routes (status codes; new v2 routes are expected to 404 in the "before" baseline).
for (const r of routes) {
  const res = await fetch(base + r, { redirect: 'manual' }).catch((e) => ({
    status: `error ${e.message}`,
  }));
  result.routes[r] = res.status;
}

// 2. Overflow + screenshots per width (WebGL disabled for determinism; globe checked separately).
for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 768 ? 800 : 900 },
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(noWebGL);
  const page = await ctx.newPage();
  const perPage = {};
  for (const p of [
    '/?intro=0',
    '/?country=US&intro=0',
    '/search?q=rice',
    '/sources',
    '/status',
    '/settings',
  ]) {
    await page.goto(base + p, { waitUntil: 'load' });
    perPage[p] = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }
  result.overflow[w === 640 ? '1280@200%' : String(w)] = perPage;
  for (const [name, p] of [
    ['home', '/?intro=0'],
    ['country-us', '/?country=US&intro=0'],
  ]) {
    await page.goto(base + p, { waitUntil: 'load' });
    await page.screenshot({ path: `${shots}/${label}-${name}-${w === 640 ? 'zoom200' : w}.png` });
  }
  await ctx.close();
}

// 3. Keyboard: the search box is reachable with Tab; type a name, ArrowDown to the first match,
//    Enter opens the country panel (same flow as tests/e2e/workspace.spec.ts).
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(noWebGL);
  const page = await ctx.newPage();
  await page.goto(base + '/?intro=0', { waitUntil: 'load' });
  let reached = false;
  for (let i = 0; i < 30 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() =>
      (document.activeElement?.getAttribute('placeholder') ?? '').includes('Name or ISO'),
    );
  }
  await page.keyboard.type('kenya', { delay: 80 }); // human speed; instant input races useDeferredValue (baseline defect D2)
  await page.keyboard.press('ArrowDown');
  const linkFocused = await page.evaluate(
    () => document.activeElement?.getAttribute('data-country') === 'KE',
  );
  await page.keyboard.press('Enter');
  const opened = await page
    .locator('[data-testid="country-sheet"] h2', { hasText: 'Kenya' })
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
  result.checks.keyboardCountrySelection = {
    searchReachableByTab: reached,
    arrowDownFocusesMatch: linkFocused,
    sheetOpened: opened,
  };
  await ctx.close();
}

// 4. Reduced motion: the intro must not show at all.
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'load' });
  result.checks.reducedMotionSkipsIntro = !(await page
    .getByTestId('intro')
    .isVisible()
    .catch(() => false));
  await ctx.close();
}

// 5. WebGL disabled: the stage reports the fallback and the country list still works.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(noWebGL);
  const page = await ctx.newPage();
  await page.goto(base + '/?intro=0', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const mode = await page
    .getByTestId('globe-stage')
    .getAttribute('data-mode')
    .catch(() => null);
  await page.screenshot({ path: `${shots}/${label}-webgl-disabled.png` });
  result.checks.webglDisabled = {
    stageMode: mode,
    countryLinks: await page.locator('a[data-country]').count(),
  };
  await ctx.close();
}

// 6. Slow network (CDP: 400 ms RTT, 1.6 Mbps down) + 4x CPU on a phone viewport.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: 200_000,
    uploadThroughput: 90_000,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(base + '/?country=US&intro=0', { waitUntil: 'commit' });
  const firstStory = await page
    .getByTestId('story-card')
    .first()
    .waitFor({ timeout: 60_000 })
    .then(
      () => Date.now() - t0,
      () => null,
    );
  result.checks.slowNetworkPhone = {
    firstStoryVisibleMs: firstStory,
    note: 'Emulated: 400 ms RTT, 1.6 Mbps, 4x CPU',
  };
  await page.screenshot({ path: `${shots}/${label}-slow-network-phone.png` });
  await ctx.close();
}

await browser.close();
writeFileSync(`docs/audit/ui-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ routes: result.routes, checks: result.checks }, null, 1));
const worst = Object.entries(result.overflow).flatMap(([w, m]) =>
  Object.entries(m)
    .filter(([, v]) => v > 0)
    .map(([p, v]) => `${w}px ${p}: +${v}px`),
);
console.log('horizontal overflow:', worst.length ? worst : 'none');
