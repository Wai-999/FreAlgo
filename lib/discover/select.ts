import { createHash, randomInt } from 'node:crypto';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { articleQuerySchema } from '@/lib/api/contracts';
import { getArticleItems, listArticles, type ArticleListItem } from '@/lib/search/articles';

/**
 * Discover (FreAlgo 2.0, spec §3): explicit, documented, seeded selection. No popularity,
 * engagement or personal signal is involved, and the same seed always gives the same result.
 *
 * Method v1:
 * - Surprise Me picks a COUNTRY uniformly from the eligible pool, which is every country with at
 *   least one story *about* it (subject or feed scope) in the last 7 days that matches the
 *   optional constraints, sorted by ISO code. Index = SHA-256(seed) as a 48-bit integer, modulo
 *   the pool size. Countries are weighted equally, so lightly covered countries have the same
 *   chance as heavily covered ones.
 * - The daily discovery picks one STORY from those published on a complete UTC day that are about
 *   at least one country, ordered by (publishedAt, id), with seed "daily:<date>". No story → none.
 */
export const DISCOVER_METHOD_VERSION = 1;
export const WINDOW_DAYS = 7;

export function seededIndex(seed: string, n: number): number {
  if (n <= 0) throw new Error('empty pool');
  const h = createHash('sha256').update(seed).digest();
  return h.readUIntBE(0, 6) % n; // 48-bit integer; modulo bias < n / 2^48 (negligible)
}

/** A fresh, human-friendly seed (6 digits) for "Surprise me" links. */
export function newSeed(): string {
  return String(randomInt(100_000, 1_000_000));
}

export const SEED_RE = /^[A-Za-z0-9_-]{1,32}$/;

export interface DiscoverConstraints {
  region?: string;
  language?: string;
  sector?: string;
}

export interface EligibleCountry {
  iso2: string;
  name: string;
  stories: number;
}

export async function eligibleCountries(
  prisma: PrismaClient,
  c: DiscoverConstraints,
  opts: { includeFixtures: boolean; now?: Date },
): Promise<EligibleCountry[]> {
  const now = opts.now ?? new Date();
  const where: Prisma.Sql[] = [
    Prisma.sql`ac.role IN ('SUBJECT'::"CountryRole", 'FEED_SCOPE'::"CountryRole")`,
    Prisma.sql`a.status = 'PUBLISHED'`,
    Prisma.sql`a."publishedAt" > ${now}::timestamp - make_interval(days => ${WINDOW_DAYS})`,
    Prisma.sql`a."publishedAt" <= ${now}::timestamp`,
  ];
  if (!opts.includeFixtures) where.push(Prisma.sql`NOT a."isFixture"`);
  if (c.region) where.push(Prisma.sql`(co.region = ${c.region} OR co.subregion = ${c.region})`);
  if (c.language)
    where.push(Prisma.sql`split_part(lower(coalesce(a.language, '')), '-', 1) = ${c.language}`);
  if (c.sector)
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM "ArticleSector" s JOIN "Sector" sc ON sc.id = s."sectorId"
      WHERE s."articleId" = a.id AND sc.slug = ${c.sector})`);
  return prisma.$queryRaw<EligibleCountry[]>`
    SELECT co.iso2, co.name, count(DISTINCT a.id)::int AS stories
    FROM "ArticleCountry" ac
    JOIN "Article" a ON a.id = ac."articleId"
    JOIN "Country" co ON co.id = ac."countryId"
    WHERE ${Prisma.join(where, ' AND ')}
    GROUP BY co.iso2, co.name
    ORDER BY co.iso2`;
}

export interface SurpriseResult {
  method: { version: number; description: string };
  seed: string;
  constraints: DiscoverConstraints;
  eligible: { count: number; windowDays: number };
  pick: (EligibleCountry & { index: number }) | null;
  stories: ArticleListItem[];
}

export async function surprise(
  prisma: PrismaClient,
  seed: string,
  c: DiscoverConstraints,
  opts: { includeFixtures: boolean; now?: Date },
): Promise<SurpriseResult> {
  const pool = await eligibleCountries(prisma, c, opts);
  const method = {
    version: DISCOVER_METHOD_VERSION,
    description: `Uniform choice among ${pool.length} eligible countries (stories about them in the last ${WINDOW_DAYS} days${constraintText(c)}), sorted by ISO code; index = SHA-256(seed) mod ${pool.length || 'pool size'}. Every country has the same chance, however many stories it has.`,
  };
  if (!pool.length)
    return {
      method,
      seed,
      constraints: c,
      eligible: { count: 0, windowDays: WINDOW_DAYS },
      pick: null,
      stories: [],
    };
  const index = seededIndex(seed, pool.length);
  const chosen = pool[index]!;
  const list = await listArticles(
    prisma,
    articleQuerySchema.parse({
      country: chosen.iso2,
      language: c.language,
      sector: c.sector,
      period: '7d',
      limit: 5,
    }),
    { includeFixtures: opts.includeFixtures, now: opts.now },
  );
  return {
    method,
    seed,
    constraints: c,
    eligible: { count: pool.length, windowDays: WINDOW_DAYS },
    pick: { ...chosen, index },
    stories: list.items,
  };
}

function constraintText(c: DiscoverConstraints): string {
  const parts = [
    c.region && `in ${c.region}`,
    c.language && `in language "${c.language}"`,
    c.sector && `in sector "${c.sector}"`,
  ].filter(Boolean);
  return parts.length ? `, ${parts.join(', ')}` : '';
}

/** Latest complete UTC day (yesterday): today's pick would change as stories keep arriving. */
export function latestCompleteDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
    .toISOString()
    .slice(0, 10);
}

export interface DailyResult {
  date: string;
  method: { version: number; description: string };
  poolSize: number;
  index: number | null;
  story: ArticleListItem | null;
}

export async function dailyDiscovery(
  prisma: PrismaClient,
  date: string,
  opts: { includeFixtures: boolean },
): Promise<DailyResult> {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const pool = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM "Article" a
    WHERE a.status = 'PUBLISHED' AND (${opts.includeFixtures} OR NOT a."isFixture")
      AND a."publishedAt" >= ${start} AND a."publishedAt" < ${end}
      AND EXISTS (SELECT 1 FROM "ArticleCountry" ac WHERE ac."articleId" = a.id
                  AND ac.role IN ('SUBJECT'::"CountryRole", 'FEED_SCOPE'::"CountryRole"))
    ORDER BY a."publishedAt", a.id`;
  const method = {
    version: DISCOVER_METHOD_VERSION,
    description: `One story chosen from the ${pool.length} published on ${date} (UTC) that are about at least one country, ordered by publication time; index = SHA-256("daily:${date}") mod ${pool.length || 'pool size'}.`,
  };
  if (!pool.length) return { date, method, poolSize: 0, index: null, story: null };
  const index = seededIndex(`daily:${date}`, pool.length);
  const [story] = await getArticleItems(prisma, [pool[index]!.id], opts);
  return { date, method, poolSize: pool.length, index, story: story ?? null };
}
