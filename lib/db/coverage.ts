import type { PrismaClient } from '@/generated/prisma/client';
import { classifyFreshness } from './freshness';

/**
 * Honest coverage facts for one country: what is registered, what is fresh, which official
 * languages have no source, and what is paywalled. Shown prominently in the country sheet.
 */
export interface CountryCoverage {
  country: {
    iso2: string;
    name: string;
    region: string | null;
    subregion: string | null;
    officialLanguages: string[];
  };
  outlets: {
    slug: string;
    name: string;
    language: string | null;
    paywall: string;
    isFixture: boolean;
  }[];
  sources: {
    active: number;
    fresh: number;
    stale: number;
    failing: number;
    paused: number;
    neverSynced: number;
    fixture: number;
  };
  languagesAvailable: string[];
  missingOfficialLanguages: string[];
  paywalledOutlets: string[];
  fixtureOnly: boolean;
  hasRealSources: boolean;
  /** Story counts by meaning (ADR V2-001): about the country vs. only published from it. */
  stories: { about: number; publisherHomeOnly: number };
}

const primary = (tag: string) => tag.split('-')[0]!.toLowerCase();

export async function getCountryCoverage(
  prisma: PrismaClient,
  iso2: string,
  opts: { includeFixtures: boolean },
): Promise<CountryCoverage | null> {
  const country = await prisma.country.findUnique({
    where: { iso2 },
    select: { iso2: true, name: true, region: true, subregion: true, officialLanguages: true },
  });
  if (!country) return null;
  const outlets = await prisma.mediaOutlet.findMany({
    where: { country: { iso2 }, ...(opts.includeFixtures ? {} : { isFixture: false }) },
    orderBy: { name: 'asc' },
    select: {
      slug: true,
      name: true,
      primaryLanguage: true,
      paywall: true,
      isFixture: true,
      feeds: {
        select: {
          status: true,
          isFixture: true,
          lastSuccessfulSyncAt: true,
          fetchIntervalMinutes: true,
          language: true,
        },
      },
    },
  });

  const sources = {
    active: 0,
    fresh: 0,
    stale: 0,
    failing: 0,
    paused: 0,
    neverSynced: 0,
    fixture: 0,
  };
  const languages = new Set<string>();
  for (const o of outlets) {
    if (o.primaryLanguage) languages.add(primary(o.primaryLanguage));
    for (const f of o.feeds) {
      if (f.language) languages.add(primary(f.language));
      if (f.status === 'ACTIVE' && !f.isFixture) sources.active++;
      const state = classifyFreshness(f);
      if (state === 'fresh') sources.fresh++;
      else if (state === 'stale') sources.stale++;
      else if (state === 'error') sources.failing++;
      else if (state === 'paused') sources.paused++;
      else if (state === 'never-synced') sources.neverSynced++;
      else sources.fixture++;
    }
  }
  const [storyCounts] = await prisma.$queryRaw<{ about: number; home: number }[]>`
    SELECT count(*) FILTER (WHERE ac.role <> 'PUBLISHER_HOME')::int AS about,
           count(*) FILTER (WHERE ac.role = 'PUBLISHER_HOME')::int AS home
    FROM "ArticleCountry" ac
    JOIN "Article" a ON a.id = ac."articleId"
    JOIN "Country" c ON c.id = ac."countryId"
    WHERE c.iso2 = ${iso2} AND a.status = 'PUBLISHED' AND (${opts.includeFixtures} OR NOT a."isFixture")`;
  const available = [...languages].sort();
  const official = country.officialLanguages.map(primary);
  return {
    country,
    outlets: outlets.map((o) => ({
      slug: o.slug,
      name: o.name,
      language: o.primaryLanguage,
      paywall: o.paywall,
      isFixture: o.isFixture,
    })),
    sources,
    languagesAvailable: available,
    missingOfficialLanguages: [...new Set(official)].filter((l) => !languages.has(l)),
    paywalledOutlets: outlets
      .filter((o) => o.paywall === 'METERED' || o.paywall === 'HARD')
      .map((o) => o.name),
    fixtureOnly: outlets.length > 0 && outlets.every((o) => o.isFixture),
    hasRealSources: outlets.some((o) => !o.isFixture),
    stories: { about: storyCounts?.about ?? 0, publisherHomeOnly: storyCounts?.home ?? 0 },
  };
}
