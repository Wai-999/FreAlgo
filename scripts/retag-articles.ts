/**
 * Re-tag stored articles with the current tagging rules (countries + roles, sectors, article type).
 *
 *   node --import tsx scripts/retag-articles.ts          # only articles tagged by older rules
 *   node --import tsx scripts/retag-articles.ts --all    # every real article
 *
 * Idempotent and safe to run on every deploy (the migrate job does): articles already at
 * TAGGING_RULES_VERSION are skipped. Fixture articles keep their curated tags; removed articles
 * are left untouched. MANUAL tags are never changed. Prints role counts before and after.
 */
import { parseArgs } from 'node:util';
import { createPrismaClient } from '../lib/db/client';
import { TAGGING_RULES_VERSION, retagStoredArticle } from '../lib/ingest/persist';

const { values } = parseArgs({ options: { all: { type: 'boolean', default: false } } });
const BATCH = 200;

async function roleCounts(prisma: ReturnType<typeof createPrismaClient>) {
  const rows = await prisma.$queryRaw<{ role: string; n: number }[]>`
    SELECT ac.role::text AS role, count(*)::int AS n
    FROM "ArticleCountry" ac JOIN "Article" a ON a.id = ac."articleId"
    WHERE NOT a."isFixture" GROUP BY 1 ORDER BY 1`;
  return Object.fromEntries(rows.map((r) => [r.role, r.n]));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const prisma = createPrismaClient(url, 2);
  try {
    const where = {
      isFixture: false,
      status: { not: 'REMOVED' as const },
      ...(values.all
        ? {}
        : {
            OR: [
              { taggedRulesVersion: null },
              { taggedRulesVersion: { lt: TAGGING_RULES_VERSION } },
            ],
          }),
    };
    const total = await prisma.article.count({ where });
    if (!total) {
      console.log(`retag: nothing to do (rules ${TAGGING_RULES_VERSION})`);
      return;
    }
    const before = await roleCounts(prisma);
    const [countries, sectors] = await Promise.all([
      prisma.country.findMany({ select: { id: true, iso2: true } }),
      prisma.sector.findMany({ select: { id: true, slug: true } }),
    ]);
    const countryIdByIso2 = new Map(countries.map((c) => [c.iso2, c.id]));
    const sectorIdBySlug = new Map(sectors.map((s) => [s.slug, s.id]));
    const feedCtx = new Map<
      string,
      { sourceCountryIso2: string | null; feedDefaultIso2: string[]; feedDefaultSectors: string[] }
    >();

    let done = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await prisma.article.findMany({
        // Explicit id paging: re-tagged rows leave the version filter, so a Prisma cursor (which
        // needs the cursor row) is not used.
        where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
        orderBy: { id: 'asc' },
        take: BATCH,
        select: {
          id: true,
          publishedAt: true,
          title: true,
          excerpt: true,
          language: true,
          canonicalUrl: true,
          feedCategories: true,
          feedSourceId: true,
          outlet: { select: { country: { select: { iso2: true } } } },
        },
      });
      if (!batch.length) break;
      for (const a of batch) {
        const key = a.feedSourceId ?? `outlet:${a.outlet.country?.iso2 ?? ''}`;
        let ctx = feedCtx.get(key);
        if (!ctx) {
          const feed = a.feedSourceId
            ? await prisma.feedSource.findUnique({
                where: { id: a.feedSourceId },
                select: { defaultCountryIso2: true, defaultSectorSlugs: true },
              })
            : null;
          ctx = {
            sourceCountryIso2: a.outlet.country?.iso2 ?? null,
            feedDefaultIso2: feed?.defaultCountryIso2 ?? [],
            feedDefaultSectors: feed?.defaultSectorSlugs ?? [],
          };
          feedCtx.set(key, ctx);
        }
        await retagStoredArticle(prisma, { ...ctx, countryIdByIso2, sectorIdBySlug }, a);
        done += 1;
      }
      cursor = batch[batch.length - 1]!.id;
    }
    const after = await roleCounts(prisma);
    console.log(
      JSON.stringify({
        msg: 'retag complete',
        rules: TAGGING_RULES_VERSION,
        articles: done,
        before,
        after,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
