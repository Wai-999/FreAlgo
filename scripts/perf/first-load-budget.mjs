// First-load budget for the Explore page: the gzipped bytes a browser downloads before the first
// paint, which is what Lighthouse's simulated mobile LCP is made of (docs/performance.md, "LCP
// follow-up"; ADR-027). Exits 1 when a budget is exceeded.
//
// Usage: node scripts/perf/first-load-budget.mjs [baseUrl]
//   Run after `next build`. Without baseUrl it starts the standalone server on a free local port
//   (Postgres and Redis must be reachable, as for `npm run start:standalone`). A baseUrl must
//   serve this checkout's .next build, because chunks are classified from its manifests.
//
// Measured per page: every script the HTML loads (`<script src>` without `nomodule`, script
// preloads), its stylesheets and its iframes (the flat map), gzipped at zlib's default level,
// which is byte-for-byte what the Next.js server sends. Framework chunks are the ones Next.js
// lists as `rootMainFiles` in .next/build-manifest.json (React, React DOM, the App Router and
// Turbopack runtimes); the page entry chunks are the ones the page's client reference manifest
// lists for `app/page` but not for `app/layout`.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const KB = 1000;
const BUDGETS = [
  { key: 'page', label: 'Page entry JS', limit: 9.5 * KB },
  { key: 'app', label: 'App JS (all but framework)', limit: 20 * KB },
  { key: 'js', label: 'Total JS', limit: 155 * KB },
  { key: 'css', label: 'CSS', limit: 9 * KB },
  { key: 'map', label: 'Map iframe', limit: 20 * KB },
];
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'country sheet', path: '/?country=MM&sector=agriculture' },
];

const kb = (bytes) => `${(bytes / KB).toFixed(2)} KB`;
// Manifests name chunks relative to .next ("static/chunks/…"); the HTML loads them from /_next/.
const assetFile = (url) => new URL(url).pathname.replace(/^\/_next\//, '');

function readBuild() {
  let buildManifest, rscManifestSource;
  try {
    buildManifest = JSON.parse(readFileSync('.next/build-manifest.json', 'utf8'));
    rscManifestSource = readFileSync('.next/server/app/page_client-reference-manifest.js', 'utf8');
  } catch {
    throw new Error('No production build in .next: run `npm run build` first.');
  }
  // The manifest is a script that assigns globalThis.__RSC_MANIFEST.
  const sandbox = {};
  runInNewContext(rscManifestSource, sandbox);
  const entries = sandbox.__RSC_MANIFEST?.['/page']?.entryJSFiles;
  const framework = new Set(buildManifest.rootMainFiles ?? []);
  if (!entries?.['[project]/app/page'] || framework.size === 0) {
    throw new Error('Unrecognised Next.js build manifests (format changed?): update this script.');
  }
  const layout = new Set(entries['[project]/app/layout'] ?? []);
  const page = new Set(entries['[project]/app/page'].filter((file) => !layout.has(file)));
  return { framework, page };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  // The script `exec`s node, so killing the child stops the server.
  const child = spawn('sh', ['scripts/start-standalone.sh'], {
    env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const res = await fetch(`${base}/api/v1/health/live`);
      if (res.ok) return { base, stop: () => child.kill() };
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`The standalone server did not start:\n${log.slice(-2000)}`);
}

/** Resources the browser fetches from the HTML before it runs any script. */
function firstLoadResources(html, base) {
  const scripts = new Set();
  const styles = new Set();
  const frames = new Set();
  const markup = html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  for (const [, tagName, attrText] of markup.matchAll(/<(script|link|iframe)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries(
      [...attrText.matchAll(/([^\s="'/]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [
        k.toLowerCase(),
        (v ?? '').replaceAll('&amp;', '&'),
      ]),
    );
    const tag = tagName.toLowerCase();
    const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
    const url = (ref) => new URL(ref, base).href;
    if (tag === 'script' && attrs.src && !('nomodule' in attrs)) scripts.add(url(attrs.src));
    else if (tag === 'link' && attrs.href) {
      if (rel.includes('modulepreload') || (rel.includes('preload') && attrs.as === 'script')) {
        scripts.add(url(attrs.href));
      } else if (rel.includes('stylesheet')) styles.add(url(attrs.href));
    } else if (tag === 'iframe' && attrs.src) frames.add(url(attrs.src));
  }
  return { scripts, styles, frames };
}

async function download(url) {
  const res = await fetch(url).catch((err) => {
    throw new Error(`GET ${url}: ${err.cause?.message ?? err.message}`);
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function printTable(header, align, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) =>
    cells
      .map((c, i) => (align[i] === 'r' ? c.padStart(widths[i]) : c.padEnd(widths[i])))
      .join('  ')
      .trimEnd();
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(line(row));
}

async function main() {
  const build = readBuild();
  const server = process.argv[2] ? null : await startServer();
  const base = process.argv[2] ?? server.base;
  try {
    const assets = new Map(); // url → { kind, file, raw, gzip, pages }
    const totals = [];
    for (const page of PAGES) {
      const htmlUrl = new URL(page.path, base).href;
      const html = await download(htmlUrl);
      const { scripts, styles, frames } = firstLoadResources(html.toString('utf8'), base);
      const sum = { page: 0, app: 0, js: 0, css: 0, map: 0 };
      const loaded = new Set();
      const add = async (url, kind, body) => {
        let asset = assets.get(url);
        if (!asset) {
          const data = body ?? (await download(url));
          const file = kind === 'document' ? page.path : assetFile(url);
          asset = { kind, file, raw: data.length, gzip: gzipSync(data).length, pages: [] };
          assets.set(url, asset);
        }
        asset.pages.push(page.name);
        return asset;
      };
      await add(htmlUrl, 'document', html);
      for (const url of scripts) {
        const file = assetFile(url);
        const kind = build.framework.has(file)
          ? 'framework'
          : build.page.has(file)
            ? 'page'
            : 'app';
        const { gzip } = await add(url, kind);
        loaded.add(file);
        sum.js += gzip;
        if (kind !== 'framework') sum.app += gzip;
        if (kind === 'page') sum.page += gzip;
      }
      for (const url of styles) sum.css += (await add(url, 'css')).gzip;
      for (const url of frames) sum.map += (await add(url, 'map')).gzip;
      // Guard the classification itself: a silent mismatch would make the budgets meaningless.
      const missingPage = [...build.page].filter((file) => !loaded.has(file));
      if (missingPage.length > 0 || ![...build.framework].some((file) => loaded.has(file))) {
        throw new Error(
          `${page.path}: the HTML does not load the chunks the build manifests name ` +
            `(missing page chunks: ${missingPage.join(', ') || 'none'}). Is ${base} serving ` +
            'this build?',
        );
      }
      totals.push(sum);
    }

    console.log(`\nFirst-load assets (gzip at zlib's default level, as the server sends them)\n`);
    const order = ['document', 'framework', 'app', 'page', 'css', 'map'];
    const rows = [...assets.values()]
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.gzip - a.gzip)
      .map((a) => [
        a.kind,
        a.file,
        kb(a.raw),
        kb(a.gzip),
        a.pages.length === PAGES.length ? 'all' : a.pages.join(', '),
      ]);
    printTable(['kind', 'asset', 'raw', 'gzip', 'pages'], 'llrrl', rows);

    console.log(`\nBudgets (1 KB = 1000 bytes)\n`);
    const over = [];
    const budgetRows = BUDGETS.map(({ key, label, limit }) => {
      const worst = Math.max(...totals.map((t) => t[key]));
      if (worst > limit) over.push(label);
      const status =
        worst > limit ? `OVER by ${kb(worst - limit)}` : `ok, ${kb(limit - worst)} left`;
      return [label, ...totals.map((t) => kb(t[key])), kb(limit), status];
    });
    printTable(
      ['budget', ...PAGES.map((p) => p.name), 'limit', 'status'],
      `l${'r'.repeat(PAGES.length)}rl`,
      budgetRows,
    );
    if (over.length > 0) {
      console.error(
        `\nFirst-load budget exceeded: ${over.join(', ')}.\nA few KB more before the first ` +
          'paint can push the simulated mobile LCP of / back over 2.5 s. Move the new code out ' +
          'of the first load (React.lazy, a server component) or measure with ' +
          '`npm run perf:lighthouse` before raising a budget (docs/performance.md, "Margin and ' +
          'budget").',
      );
      process.exitCode = 1;
    } else {
      console.log('\nFirst-load budget: ok');
    }
  } finally {
    server?.stop();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
