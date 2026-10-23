// Which JavaScript each route loads, and whether any of it is the 3D engine (Three.js).
//   node scripts/perf/route-js.mjs [baseUrl]   (production build must be running)
// Spec §12: WebGL libraries must not load on text-only routes.
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const browser = await chromium.launch();
const events = await (await fetch(`${base}/api/v1/events?minOutlets=2&limit=1`)).json();
const slug = events.items?.[0]?.slug;
const routes = [
  '/?intro=0',
  '/stories',
  '/discover',
  '/my-world?country=MM',
  '/search?q=rice',
  '/methodology',
  ...(slug ? [`/stories/${slug}`, `/perspectives/${slug}`] : []),
];
const rows = [];
for (const path of routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const scripts = [];
  page.on('response', async (r) => {
    if (r.request().resourceType() !== 'script') return;
    const body = await r.body().catch(() => Buffer.alloc(0));
    scripts.push({ bytes: body.length, three: /WebGLRenderer|THREE\.WebGL/.test(body.toString()) });
  });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  rows.push({
    route: path,
    scripts: scripts.length,
    jsKB: Math.round(scripts.reduce((n, s) => n + s.bytes, 0) / 1024),
    threeJsLoaded: scripts.some((s) => s.three),
  });
  await ctx.close();
}
await browser.close();
console.table(rows);
