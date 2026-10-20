import { getPrisma } from './client';

export interface CountrySummary {
  iso2: string;
  iso3: string;
  isoNumeric: string | null;
  name: string;
  region: string | null;
  subregion: string | null;
  officialLanguages: string[];
  articleCount: number;
  outletCount: number;
  latestPublishedAt: Date | null;
}

/**
 * Every ISO country with its published-article and outlet counts. Countries with zero sources are
 * returned too so gaps in coverage are visible rather than hidden.
 */
export async function listCountrySummaries(opts: {
  includeFixtures: boolean;
}): Promise<CountrySummary[]> {
  const prisma = getPrisma();
  return prisma.$queryRaw<CountrySummary[]>`
    WITH counts AS (
      SELECT ac."countryId", count(*)::int AS n, max(ac."publishedAt") AS latest
      FROM "ArticleCountry" ac
      JOIN "Article" a ON a.id = ac."articleId"
      WHERE a.status = 'PUBLISHED' AND (${opts.includeFixtures} OR NOT a."isFixture")
      GROUP BY ac."countryId"
    ),
    outlets AS (
      SELECT o."countryId", count(*)::int AS n
      FROM "MediaOutlet" o
      WHERE (${opts.includeFixtures} OR NOT o."isFixture")
      GROUP BY o."countryId"
    )
    SELECT c.iso2, c.iso3, c."isoNumeric", c.name, c.region, c.subregion, c."officialLanguages",
           coalesce(counts.n, 0) AS "articleCount",
           coalesce(outlets.n, 0) AS "outletCount",
           counts.latest AS "latestPublishedAt"
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
