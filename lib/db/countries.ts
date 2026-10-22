import { swr } from '@/lib/cache/swr';
import { getPrisma } from './client';

export interface CountrySummary {
  iso2: string;
  iso3: string;
  isoNumeric: string | null;
  name: string;
  region: string | null;
  subregion: string | null;
  officialLanguages: string[];
  /** Stories about the country (text evidence or the feed's declared scope). */
  articleCount: number;
  /** Stories from publishers based in the country that are not about it (not coverage). */
  publisherHomeCount: number;
  outletCount: number;
  activeSourceCount: number;
  latestPublishedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
}

/**
 * Every ISO country with article/outlet/source counts and freshness. Countries with zero sources
 * are returned too so coverage gaps are visible rather than hidden. Cached briefly (SWR).
 */
export async function listCountrySummaries(opts: {
  includeFixtures: boolean;
}): Promise<CountrySummary[]> {
  return swr(`countries:${opts.includeFixtures}`, 30_000, 300_000, () =>
    loadCountrySummaries(opts),
  );
}

async function loadCountrySummaries(opts: { includeFixtures: boolean }): Promise<CountrySummary[]> {
  const prisma = getPrisma();
  return prisma.$queryRaw<CountrySummary[]>`
    WITH counts AS (
      SELECT ac."countryId",
             count(*) FILTER (WHERE ac.role <> 'PUBLISHER_HOME')::int AS n,
             count(*) FILTER (WHERE ac.role = 'PUBLISHER_HOME')::int AS home,
             max(ac."publishedAt") FILTER (WHERE ac.role <> 'PUBLISHER_HOME') AS latest
      FROM "ArticleCountry" ac
      JOIN "Article" a ON a.id = ac."articleId"
      WHERE a.status = 'PUBLISHED' AND (${opts.includeFixtures} OR NOT a."isFixture")
      GROUP BY ac."countryId"
    ),
    outlets AS (
      SELECT o."countryId", count(DISTINCT o.id)::int AS n,
             count(f.id) FILTER (WHERE f.status = 'ACTIVE')::int AS active,
             max(f."lastSuccessfulSyncAt") AS "lastSync"
      FROM "MediaOutlet" o
      LEFT JOIN "FeedSource" f ON f."outletId" = o.id
      WHERE (${opts.includeFixtures} OR NOT o."isFixture")
      GROUP BY o."countryId"
    )
    SELECT c.iso2, c.iso3, c."isoNumeric", c.name, c.region, c.subregion, c."officialLanguages",
           coalesce(counts.n, 0) AS "articleCount",
           coalesce(counts.home, 0) AS "publisherHomeCount",
           coalesce(outlets.n, 0) AS "outletCount",
           coalesce(outlets.active, 0) AS "activeSourceCount",
           counts.latest AS "latestPublishedAt",
           outlets."lastSync" AS "lastSuccessfulSyncAt"
    FROM "Country" c
    LEFT JOIN counts ON counts."countryId" = c.id
    LEFT JOIN outlets ON outlets."countryId" = c.id
    ORDER BY c.name ASC, c.iso2 ASC
  `;
}

export function numericToIso2Map(countries: Pick<CountrySummary, 'iso2' | 'isoNumeric'>[]) {
  const map = new Map<string, string>();
  for (const c of countries) if (c.isoNumeric) map.set(c.isoNumeric, c.iso2);
  return map;
}
