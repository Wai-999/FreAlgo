import type { PrismaClient } from '@/generated/prisma/client';

/**
 * World Pulse (FreAlgo 2.0, spec §3; flag "worldPulse"): how many stored reports are about each
 * country in a period. A measure of FreAlgo's coverage, not of importance or of events: it
 * depends on which outlets FreAlgo ingests. "About" = the text names the country or the feed
 * declares it as its scope; publisher home countries are not counted.
 */
export const PULSE_PERIODS = { '24h': 24, '7d': 168 } as const;
export type PulsePeriod = keyof typeof PULSE_PERIODS;

/** Fixed bucket edges (raw counts). The lowest bucket starts at 1: zero is shown separately. */
export const PULSE_BUCKETS = [1, 3, 10, 30] as const;

export function pulseBucket(n: number): number {
  if (n <= 0) return 0;
  let b = 1;
  for (const edge of PULSE_BUCKETS.slice(1)) if (n >= edge) b += 1;
  return b;
}

export interface PulseData {
  period: PulsePeriod;
  since: string;
  generatedAt: string;
  totalReports: number;
  outlets: number;
  outletCountries: number;
  countries: { iso2: string; name: string; reports: number }[];
}

export async function pulseCounts(
  prisma: PrismaClient,
  opts: { includeFixtures: boolean; period: PulsePeriod; now?: Date },
): Promise<PulseData> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - PULSE_PERIODS[opts.period] * 3_600_000);
  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<{ iso2: string; name: string; reports: number }[]>`
      SELECT c.iso2, c.name, count(DISTINCT ac."articleId")::int AS reports
      FROM "ArticleCountry" ac
      JOIN "Article" a ON a.id = ac."articleId"
      JOIN "Country" c ON c.id = ac."countryId"
      WHERE ac.role IN ('SUBJECT'::"CountryRole", 'FEED_SCOPE'::"CountryRole")
        AND ac."publishedAt" >= ${since}::timestamp AND ac."publishedAt" <= ${now}::timestamp
        AND a.status = 'PUBLISHED' AND (${opts.includeFixtures} OR NOT a."isFixture")
      GROUP BY c.iso2, c.name
      ORDER BY reports DESC, c.name ASC`,
    prisma.$queryRaw<{ reports: number; outlets: number; homes: number }[]>`
      SELECT count(*)::int AS reports, count(DISTINCT a."outletId")::int AS outlets,
        count(DISTINCT o."countryId")::int AS homes
      FROM "Article" a JOIN "MediaOutlet" o ON o.id = a."outletId"
      WHERE a."publishedAt" >= ${since}::timestamp AND a."publishedAt" <= ${now}::timestamp
        AND a.status = 'PUBLISHED' AND (${opts.includeFixtures} OR NOT a."isFixture")`,
  ]);
  const t = totals[0] ?? { reports: 0, outlets: 0, homes: 0 };
  return {
    period: opts.period,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    totalReports: t.reports,
    outlets: t.outlets,
    outletCountries: t.homes,
    countries: rows,
  };
}
