// Lighthouse (mobile, simulated throttling) for representative pages.
// Usage: node scripts/perf/lighthouse.mjs [baseUrl]    (production server must be running)
// Uses Playwright's Chromium so no separate Chrome install is needed; Lighthouse is fetched at a
// pinned version via npx. Writes reports/lighthouse/*.json|html and prints a summary table.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3000';
const pages = [
  ['home', '/?intro=0'],
  ['country-sheet', '/?country=MM&sector=agriculture&intro=0'],
  ['search', '/search?q=rice&intro=0'],
];
mkdirSync('reports/lighthouse', { recursive: true });
const chromePath = chromium.executablePath();
const rows = [];
for (const [name, path] of pages) {
  const out = `reports/lighthouse/${name}`;
  try {
    execFileSync(
      'npx',
      [
        '-y',
        'lighthouse@13.5.0',
        `${base}${path}`,
        '--quiet',
        '--output=json',
        '--output=html',
        `--output-path=${out}`,
        '--chrome-flags=--headless=new --no-sandbox',
        '--only-categories=performance,accessibility,best-practices,seo',
      ],
      { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromePath }, timeout: 300_000 },
    );
  } catch (err) {
    rows.push({ page: name, error: String(err.message ?? err).slice(0, 120) });
    continue;
  }
  const r = JSON.parse(readFileSync(`${out}.report.json`, 'utf8'));
  const a = r.audits;
  rows.push({
    page: name,
    performance: Math.round(r.categories.performance.score * 100),
    accessibility: Math.round(r.categories.accessibility.score * 100),
    bestPractices: Math.round(r.categories['best-practices'].score * 100),
    seo: Math.round(r.categories.seo.score * 100),
    LCP_s: +(a['largest-contentful-paint'].numericValue / 1000).toFixed(2),
    TBT_ms: Math.round(a['total-blocking-time'].numericValue),
    CLS: +a['cumulative-layout-shift'].numericValue.toFixed(3),
    transferKB: Math.round(a['total-byte-weight'].numericValue / 1024),
  });
}
console.table(rows);
