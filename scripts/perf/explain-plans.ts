// Query-plan check at realistic volume (testing matrix: "DB EXPLAIN plans").
//
//   DATABASE_URL_TEST=… node --env-file-if-exists=.env --import tsx scripts/perf/explain-plans.ts [articles]
//
// Runs ONLY against a *_test database. It bulk-inserts SYNTHETIC articles (default 200 000) on the
// reserved `synthetic.invalid` domain, tags them with a skewed country distribution and sectors,
// runs ANALYZE, then calls the real query builders (listArticles, country summaries, coverage,
// freshness) with Prisma query logging on and runs EXPLAIN (ANALYZE, BUFFERS) on each captured
// statement. Synthetic rows are deleted afterwards (pass --keep to inspect them).
// Output: reports/explain-plans.txt (full plans) and reports/explain-plans.json (summary).
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { articleQuerySchema } from '@/lib/api/contracts';
import { listArticles } from '@/lib/search/articles';
import { listCountrySummaries } from '@/lib/db/countries';
import { getCountryCoverage } from '@/lib/db/coverage';
import { getFreshnessReport } from '@/lib/db/freshness';

const url = process.env.DATABASE_URL_TEST ?? '';
if (!/_test(\?|$)/.test(url)) {
  console.error('DATABASE_URL_TEST must point at a *_test database');
  process.exit(2);
}
process.env.DATABASE_URL = url;
const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200_000);
const keep = process.argv.includes('--keep');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, max: 4 }),
  log: [{ emit: 'event', level: 'query' }],
});
// The app's getPrisma() reuses this global, so the real loaders run on the logging client.
(globalThis as unknown as { __frealgoPrisma?: PrismaClient }).__frealgoPrisma = prisma;

let capture: { sql: string; params: unknown[] }[] | null = null;
prisma.$on('query', (e) => {
  if (!capture) return;
  const raw = JSON.parse(e.params || '[]') as unknown[];
  capture.push({
    sql: e.query,
    params: raw.map((p) =>
      p && typeof p === 'object' && 'prisma__value' in p
        ? (p as { prisma__value: unknown }).prisma__value
        : p,
    ),
  });
});

async function seedSynthetic() {
  const t0 = Date.now();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "Article" WHERE "canonicalUrl" LIKE 'https://synthetic.invalid/%'`,
  );
  // Words chosen so the search scenarios match a realistic fraction of rows.
  await prisma.$executeRawUnsafe(`
    WITH outlets AS (SELECT array_agg(id ORDER BY slug) AS ids FROM "MediaOutlet"),
    words AS (SELECT ARRAY['rice','harvest','election','budget','court','storm','trade','minister',
      'protest','vaccine','port','bank','school','drought','market','border','ceasefire','energy',
      'rail','football','festival','inflation','parliament','mining','flood','startup','reform',
      'talks','strike','summit'] AS w)
    INSERT INTO "Article" (id, "outletId", "canonicalUrl", "canonicalUrlHash", title, excerpt,
      language, "publishedAt", "firstSeenAt", "updatedAt", status, "isFixture")
    SELECT 'syn' || g,
      outlets.ids[1 + (g % array_length(outlets.ids, 1))],
      'https://synthetic.invalid/a/' || g,
      encode(sha256(('https://synthetic.invalid/a/' || g)::bytea), 'hex'),
      initcap(w[1 + (g * 7) % 30]) || ' ' || w[1 + (g * 13) % 30] || ' ' || w[1 + (g * 17) % 30] || ' update ' || g,
      'Synthetic excerpt about ' || w[1 + (g * 3) % 30] || ' and ' || w[1 + (g * 11) % 30] || '.',
      'en',
      now() - (random() * interval '365 days'),
      now(), now(), 'PUBLISHED', false
    FROM generate_series(1, ${N}) g, outlets, words`);
  // Skewed country distribution: a few countries get most stories, many get very few.
  await prisma.$executeRawUnsafe(`
    WITH cs AS (SELECT array_agg(id ORDER BY (iso2 NOT IN ('US','GB','IN','MM','KE','BR')), iso2) AS ids FROM "Country"),
    picks AS (
      SELECT a.id AS "articleId", a."publishedAt", k,
             cs.ids[1 + floor(power(random(), 3) * array_length(cs.ids, 1))::int] AS "countryId"
      FROM "Article" a, cs, generate_series(1, 2) k
      WHERE a."canonicalUrl" LIKE 'https://synthetic.invalid/%' AND (k = 1 OR abs(hashtext(a.id)) % 10 < 4)
    )
    INSERT INTO "ArticleCountry" ("articleId", "countryId", basis, role, "publishedAt")
    SELECT DISTINCT ON ("articleId", "countryId") "articleId", "countryId",
           CASE WHEN k = 1 AND abs(hashtext("articleId")) % 2 = 0 THEN 'SOURCE_COUNTRY' ELSE 'TEXT_MATCH' END::"CountryTagBasis",
           -- v2 roles: about half of the first tags are only the publisher's home (like BBC world news)
           CASE WHEN k = 1 AND abs(hashtext("articleId")) % 2 = 0 THEN 'PUBLISHER_HOME' ELSE 'SUBJECT' END::"CountryRole",
           "publishedAt"
    FROM picks ON CONFLICT DO NOTHING`);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ArticleSector" ("articleId", "sectorId", basis, "publishedAt")
    SELECT a.id, s.id, 'KEYWORD_RULE'::"SectorTagBasis", a."publishedAt"
    FROM "Article" a
    JOIN LATERAL (SELECT id FROM "Sector" ORDER BY random() + (a.id IS NULL)::int LIMIT 1) s ON true
    WHERE a."canonicalUrl" LIKE 'https://synthetic.invalid/%' AND random() < 0.7
    ON CONFLICT DO NOTHING`);
  await prisma.$executeRawUnsafe(`ANALYZE "Article"; `);
  await prisma.$executeRawUnsafe(`ANALYZE "ArticleCountry"`);
  await prisma.$executeRawUnsafe(`ANALYZE "ArticleSector"`);
  const [counts] = await prisma.$queryRawUnsafe<{ a: number; ac: number; asec: number }[]>(`
    SELECT (SELECT count(*) FROM "Article")::int AS a, (SELECT count(*) FROM "ArticleCountry")::int AS ac,
           (SELECT count(*) FROM "ArticleSector")::int AS asec`);
  return { ...counts, seedMs: Date.now() - t0 };
}

const q = (input: Record<string, string | string[]>) => articleQuerySchema.parse(input);

async function scenarios(): Promise<[string, () => Promise<unknown>][]> {
  const page1 = await listArticles(prisma, q({ country: 'US' }), { includeFixtures: false });
  const page2 = await listArticles(prisma, q({ country: 'US', cursor: page1.page.nextCursor! }), {
    includeFixtures: false,
  });
  const run = (input: Record<string, string | string[]>) => () =>
    listArticles(prisma, q(input), { includeFixtures: false });
  return [
    ['country MM, newest (page 1)', run({ country: 'MM' })],
    ['country US, about + publisher home (scope=all)', run({ country: 'US', scope: 'all' })],
    ['country BR, about only (publisher-heavy country)', run({ country: 'BR' })],
    ['opinion only, newest', run({ type: 'opinion' })],
    ['alphabetical, page 1', run({ sort: 'alphabetical' })],
    [
      'country US, newest (page 3 via cursor)',
      run({ country: 'US', cursor: page2.page.nextCursor! }),
    ],
    [
      'country US + sector + orientation, oldest',
      run({
        country: 'US',
        sector: 'politics',
        orientation: ['center', 'unrated'],
        sort: 'oldest',
      }),
    ],
    [
      'country US + politics + center-right, oldest (load-test URL)',
      run({ country: 'US', sector: 'politics', orientation: 'center-right', sort: 'oldest' }),
    ],
    ['country KE + last 7 days', run({ country: 'KE', period: '7d' })],
    ['region Africa, newest', run({ region: 'Africa' })],
    ['global newest, no filters', run({})],
    ['search "rice harvest", relevance', run({ q: 'rice harvest' })],
    ['search "ceasefire" in country IN', run({ q: 'ceasefire', country: 'IN' })],
    ['search "hurricanes" (selective)', run({ q: 'hurricanes' })],
    ['search "ceasfire" (typo, trigram only)', run({ q: 'ceasfire' })],
    ['country summaries (globe/list)', () => listCountrySummaries({ includeFixtures: false })],
    ['country coverage (MM)', () => getCountryCoverage(prisma, 'MM', { includeFixtures: false })],
    ['freshness report', () => getFreshnessReport(prisma, { includeFixtures: false })],
  ];
}

async function explain(sql: string, params: unknown[], steered: boolean) {
  const stmt = prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
    ...params,
  );
  // Reproduce the app's per-transaction planner setting for text-search statements.
  const rows = steered
    ? (
        await prisma.$transaction([
          prisma.$executeRawUnsafe('SET LOCAL enable_seqscan = off'),
          stmt,
        ])
      )[1]
    : await stmt;
  return rows.map((r) => r['QUERY PLAN']);
}

const seeded = await seedSynthetic();
console.log('synthetic data', seeded);
const text: string[] = [
  `# EXPLAIN (ANALYZE, BUFFERS) at ${seeded.a} articles, ${seeded.ac} country tags, ${seeded.asec} sector tags`,
  `# ${new Date().toISOString()}; synthetic rows on synthetic.invalid in a *_test database`,
  '',
];
const summary: Record<string, unknown>[] = [];
try {
  for (const [name, fn] of await scenarios()) {
    capture = [];
    const t0 = Date.now();
    await fn();
    const wallMs = Date.now() - t0;
    const stmts = capture;
    capture = null;
    let worstMs = 0;
    const nodes = new Set<string>();
    text.push(`## ${name}  (end-to-end ${wallMs} ms, ${stmts.length} statements)`, '');
    const steered = stmts.some((s) => /SET LOCAL enable_seqscan = off/.test(s.sql));
    for (const s of stmts) {
      if (!/^\s*(WITH|SELECT)/i.test(s.sql)) continue;
      const plan = await explain(s.sql, s.params, steered && s.sql.includes('<%'));
      const exec = Number(/Execution Time: ([\d.]+)/.exec(plan.join('\n'))?.[1] ?? 0);
      worstMs = Math.max(worstMs, exec);
      for (const l of plan) {
        const m =
          /(Index Only Scan|Index Scan|Bitmap Index Scan|Seq Scan) (?:Backward )?(?:using (\S+) )?on "?(\w+)"?/.exec(
            l,
          );
        if (m) nodes.add(m[2] ? `${m[1]}: ${m[2]}` : `${m[1]}: ${m[3]}`);
      }
      text.push(
        '```sql',
        s.sql.replace(/\s+/g, ' ').slice(0, 600),
        '```',
        '```',
        ...plan,
        '```',
        '',
      );
    }
    summary.push({
      scenario: name,
      wallMs,
      slowestStatementMs: +worstMs.toFixed(1),
      access: [...nodes].join('; '),
    });
  }
} finally {
  if (!keep) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "Article" WHERE "canonicalUrl" LIKE 'https://synthetic.invalid/%'`,
    );
  }
  await prisma.$disconnect();
}
console.table(
  summary.map((r) => ({
    scenario: r.scenario,
    wallMs: r.wallMs,
    slowestStatementMs: r.slowestStatementMs,
  })),
);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/explain-plans.txt', text.join('\n'));
writeFileSync(
  'reports/explain-plans.json',
  JSON.stringify({ measuredAt: new Date().toISOString(), data: seeded, summary }, null, 2),
);
console.log('Wrote reports/explain-plans.txt and reports/explain-plans.json');
