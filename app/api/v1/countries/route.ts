import { apiHandler } from '@/lib/api/handler';
import { listCountrySummaries } from '@/lib/db/countries';
import { getEnv } from '@/lib/env';

/** All ISO 3166-1 countries with article counts, registered sources and freshness. */
export const GET = apiHandler(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async () => {
    const countries = await listCountrySummaries({ includeFixtures: getEnv().SHOW_FIXTURES });
    return {
      countries: countries.map((c) => ({
        iso2: c.iso2,
        iso3: c.iso3,
        name: c.name,
        region: c.region,
        subregion: c.subregion,
        officialLanguages: c.officialLanguages,
        articleCount: c.articleCount,
        outletCount: c.outletCount,
        activeSourceCount: c.activeSourceCount,
        latestPublishedAt: c.latestPublishedAt,
        lastSuccessfulSyncAt: c.lastSuccessfulSyncAt,
      })),
      coverage: {
        countriesWithSources: countries.filter((c) => c.outletCount > 0).length,
        totalCountries: countries.length,
        note: 'Coverage is uneven across countries and languages; zero counts are reported, not hidden.',
      },
    };
  },
);
