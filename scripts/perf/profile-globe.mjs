// Globe performance profile (Milestone 4). Measures, per scenario:
//   time to globe ready, frame times during continuous rotation (median/p95/worst),
//   long tasks, JS heap, transferred JS (initial page vs. lazily loaded globe), WebGL renderer.
//
// Usage: node scripts/perf/profile-globe.mjs [baseUrl]   (production server must be running)
// Results are EMULATED (CDP CPU throttling + viewport/touch emulation on this machine), not
// measurements from physical low-end phones. The renderer string is reported so readers can
// tell GPU from software rendering.
import { chromium, devices } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const scenarios = [
  {
    name: 'desktop 1440x900, no throttling',
    device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    cpu: 1,
  },
  {
    name: 'mid-range phone (Pixel 7 viewport, 4x CPU slowdown)',
    device: devices['Pixel 7'],
    cpu: 4,
  },
  { name: 'low-end phone (Pixel 7 viewport, 6x CPU slowdown)', device: devices['Pixel 7'], cpu: 6 },
];

const percentile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function run(browser, sc) {
  const context = await browser.newContext({ ...sc.device });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: sc.cpu });
  const bytes = { initial: 0, lazy: 0 };
  let phase = 'initial';
  cdp.on('Network.loadingFinished', (e) => {
    bytes[phase] += e.encodedDataLength;
  });
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  });

  const t0 = Date.now();
  await page.goto(`${base}/?globe=force&intro=0`, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  phase = 'lazy';
  await page.waitForSelector('[data-testid="globe-stage"][data-mode="globe"]', { timeout: 60_000 });
  const readyMs = Date.now() - t0;
  await page.waitForTimeout(500);

  const renderer = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="globe-canvas"]');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });

  // Continuous drag rotation for ~3s while recording rAF deltas.
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      if (window.__recording) requestAnimationFrame(tick);
    };
    window.__recording = true;
    requestAnimationFrame(tick);
  });
  const box = await page.getByTestId('globe').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 120, cy);
  await page.mouse.down();
  const steps = 180;
  for (let i = 0; i < steps; i++) {
    const x = cx - 120 + 240 * Math.sin((i / steps) * Math.PI * 2) * 0.5 + (i % 2);
    await page.mouse.move(x + i, cy + 30 * Math.sin(i / 10));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const result = await page.evaluate(() => {
    window.__recording = false;
    return {
      frames: window.__frames.slice(2),
      longTasks: window.__longTasks,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });
  await context.close();
  const f = result.frames.filter((x) => x > 0 && x < 1000);
  return {
    scenario: sc.name,
    renderer,
    loadMs,
    globeReadyMs: readyMs,
    frames: f.length,
    medianFrameMs: +percentile(f, 50).toFixed(1),
    p95FrameMs: +percentile(f, 95).toFixed(1),
    worstFrameMs: +Math.max(...f).toFixed(1),
    approxFps: +(1000 / percentile(f, 50)).toFixed(0),
    longTasks: result.longTasks.length,
    longestTaskMs: result.longTasks.length ? Math.round(Math.max(...result.longTasks)) : 0,
    heapMB: result.heapMB,
    initialTransferKB: Math.round(bytes.initial / 1024),
    lazyGlobeTransferKB: Math.round(bytes.lazy / 1024),
  };
}

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const results = [];
for (const sc of scenarios) results.push(await run(browser, sc));
await browser.close();
console.table(results);
mkdirSync('reports', { recursive: true });
writeFileSync(
  'reports/globe-profile.json',
  JSON.stringify({ measuredAt: new Date().toISOString(), base, results }, null, 2),
);
console.log('Wrote reports/globe-profile.json');
