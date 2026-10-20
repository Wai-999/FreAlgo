import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { seedCountries, seedFixtures, seedSectors } from '@/prisma/seed';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';

const prisma = testPrisma();

async function counts() {
  const [row] = await prisma.$queryRaw<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM "Country") AS countries,
           (SELECT count(*)::int FROM "Sector") AS sectors,
           (SELECT count(*)::int FROM "MediaOutlet") AS outlets,
           (SELECT count(*)::int FROM "FeedSource") AS feeds,
           (SELECT count(*)::int FROM "Article") AS articles,
           (SELECT count(*)::int FROM "ArticleCountry") AS article_countries,
           (SELECT count(*)::int FROM "ArticleSector") AS article_sectors,
           (SELECT count(*)::int FROM "OutletLabelHistory") AS label_history`;
  return row!;
}

describe('migrations + seed', () => {
  beforeAll(async () => {
    await truncateContent();
  });
  afterAll(async () => {
    await closeTestPrisma();
  });

  it('applies every migration to a clean database', async () => {
    const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at FROM "_prisma_migrations"`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.finished_at !== null)).toBe(true);
    const [ext] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pg_trgm'`;
    expect(ext!.n).toBe(1);
  });

  it('seeds reference data and fixtures, and re-running changes nothing', async () => {
    await seedCountries(prisma);
    await seedSectors(prisma);
    await seedFixtures(prisma);
    const first = await counts();
    expect(first.countries).toBe(250);
    expect(first.sectors).toBe(7);
    expect(first.outlets).toBe(12);
    expect(first.articles).toBe(168);

    const snapshot = await prisma.article.findMany({
      select: { id: true, publishedAt: true },
      orderBy: { id: 'asc' },
    });

    await seedCountries(prisma);
    await seedSectors(prisma);
    await seedFixtures(prisma, new Date(Date.now() + 86_400_000));
    expect(await counts()).toEqual(first);
    // Re-seeding must not move timestamps (stable cursors, truthful dates).
    expect(
      await prisma.article.findMany({
        select: { id: true, publishedAt: true },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(snapshot);
  });

  it('marks every fixture row and badge-worthy outlet as fixture', async () => {
    expect(await prisma.article.count({ where: { isFixture: false } })).toBe(0);
    expect(await prisma.mediaOutlet.count({ where: { isFixture: false } })).toBe(0);
    const urls = await prisma.article.findMany({ select: { canonicalUrl: true } });
    expect(urls.every((u) => new URL(u.canonicalUrl).hostname.endsWith('.example'))).toBe(true);
  });

  it('maintains the full-text search vector via trigger', async () => {
    const [row] = await prisma.$queryRaw<{ missing: number; hits: number }[]>`
      SELECT (SELECT count(*)::int FROM "Article" WHERE "searchVector" IS NULL) AS missing,
             (SELECT count(*)::int FROM "Article"
               WHERE "searchVector" @@ websearch_to_tsquery('english', 'irrigation')) AS hits`;
    expect(row!.missing).toBe(0);
    expect(row!.hits).toBeGreaterThan(0);
  });

  it('enforces label confidence range and ISO normalization with CHECK constraints', async () => {
    const outlet = await prisma.mediaOutlet.findFirstOrThrow();
    await expect(
      prisma.mediaOutlet.update({ where: { id: outlet.id }, data: { labelConfidence: 1.5 } }),
    ).rejects.toThrow();
    await expect(
      prisma.mediaOutlet.update({ where: { id: outlet.id }, data: { labelConfidence: -0.01 } }),
    ).rejects.toThrow();
    await expect(
      prisma.country.create({ data: { iso2: 'zz', iso3: 'ZZZ', name: 'Lowercase' } }),
    ).rejects.toThrow();
  });

  it('enforces article dedupe keys', async () => {
    const a = await prisma.article.findFirstOrThrow();
    await expect(
      prisma.article.create({
        data: {
          outletId: a.outletId,
          canonicalUrl: a.canonicalUrl,
          canonicalUrlHash: a.canonicalUrlHash,
          title: 'dup',
          publishedAt: new Date(),
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
