import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Source quality dashboard (FreAlgo 2.0, spec §12). Every number is measured from stored data,
 * with its window and denominator, so readers can judge coverage rather than trust a score.
 * Public-safe: no URLs with credentials, no error text, no per-user data.
 */
export interface SourceQuality {
  generatedAt: string;
  sources: { enabled: number; reachable: number; paused: number; failing: number };
  coverage: {
    countriesAbout24h: number;
    countriesAbout7d: number;
    countriesWithEnabledSource: number;
  };
  articles7d: {
    total: number;
    languages: Record<string, number>;
    /** Articles whose headline+excerpt fingerprint also appears on another article. */
    duplicateRatio: number;
    /** Share with no country they are about / no sector / no publisher-signalled type. */
    withoutAboutCountry: number;
    withoutSector: number;
    typeUnknown: number;
  };
  freshness: {
    /** Hours since each enabled source's newest article: median and 90th percentile. */
    newestArticleAgeHoursP50: number | null;
    newestArticleAgeHoursP90: number | null;
    /** Minutes from publication to first seen by FreAlgo (time-to-visible), last 7 days. */
    timeToVisibleMinutesP50: number | null;
    timeToVisibleMinutesP90: number | null;
  };
  ingestion24h: { runs: number; failed: number; retried: number };
}

type Row = {
  enabled: number;
  reachable: number;
  paused: number;
  failing: number;
  c24: number;
  c7: number;
  csrc: number;
  total: number;
  languages: Record<string, number> | null;
  dups: number;
  no_country: number;
  no_sector: number;
  type_unknown: number;
  age50: number | null;
  age90: number | null;
  ttv50: number | null;
  ttv90: number | null;
  runs: number;
  failed: number;
  retried: number;
};

const round = (n: number | null, d = 1) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export async function getSourceQuality(
  prisma: PrismaClient,
  opts: { includeFixtures: boolean; now?: Date },
): Promise<SourceQuality> {
  const now = opts.now ?? new Date();
  const inc = opts.includeFixtures;
  const [r] = await prisma.$queryRaw<Row[]>`
    WITH arts AS (
      SELECT a.* FROM "Article" a
      WHERE a.status = 'PUBLISHED' AND (${inc} OR NOT a."isFixture")
        AND a."publishedAt" > ${now}::timestamp - interval '7 days'
    ),
    feeds AS (
      SELECT f.* FROM "FeedSource" f WHERE (${inc} OR NOT f."isFixture")
    ),
    newest AS (
      SELECT f.id, extract(epoch FROM (${now}::timestamp - max(a."publishedAt"))) / 3600.0 AS age
      FROM feeds f JOIN "Article" a ON a."feedSourceId" = f.id
      WHERE f.status = 'ACTIVE' GROUP BY f.id
    )
    SELECT
      (SELECT count(*) FROM feeds WHERE status = 'ACTIVE')::int AS enabled,
      (SELECT count(*) FROM feeds WHERE status = 'ACTIVE' AND "lastSuccessfulSyncAt" IS NOT NULL
         AND "lastSuccessfulSyncAt" >= coalesce("lastAttemptAt", "lastSuccessfulSyncAt"))::int AS reachable,
      (SELECT count(*) FROM feeds WHERE status = 'PAUSED')::int AS paused,
      (SELECT count(*) FROM feeds WHERE status = 'ERROR' OR (status = 'ACTIVE' AND "failureCount" > 0))::int AS failing,
      (SELECT count(DISTINCT ac."countryId") FROM "ArticleCountry" ac JOIN arts ON arts.id = ac."articleId"
         WHERE ac.role <> 'PUBLISHER_HOME' AND arts."publishedAt" > ${now}::timestamp - interval '24 hours')::int AS c24,
      (SELECT count(DISTINCT ac."countryId") FROM "ArticleCountry" ac JOIN arts ON arts.id = ac."articleId"
         WHERE ac.role <> 'PUBLISHER_HOME')::int AS c7,
      (SELECT count(DISTINCT o."countryId") FROM feeds f JOIN "MediaOutlet" o ON o.id = f."outletId"
         WHERE f.status = 'ACTIVE')::int AS csrc,
      (SELECT count(*) FROM arts)::int AS total,
      (SELECT json_object_agg(l, n) FROM (
         SELECT coalesce(split_part(lower(language), '-', 1), 'unknown') AS l, count(*)::int AS n
         FROM arts GROUP BY 1) x) AS languages,
      (SELECT count(*) FROM arts a WHERE a."contentHash" IS NOT NULL AND EXISTS (
         SELECT 1 FROM "Article" b WHERE b."contentHash" = a."contentHash" AND b.id <> a.id))::int AS dups,
      (SELECT count(*) FROM arts a WHERE NOT EXISTS (
         SELECT 1 FROM "ArticleCountry" ac WHERE ac."articleId" = a.id AND ac.role <> 'PUBLISHER_HOME'))::int AS no_country,
      (SELECT count(*) FROM arts a WHERE NOT EXISTS (
         SELECT 1 FROM "ArticleSector" s WHERE s."articleId" = a.id))::int AS no_sector,
      (SELECT count(*) FROM arts WHERE "articleType" = 'UNKNOWN')::int AS type_unknown,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY age) FROM newest) AS age50,
      (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY age) FROM newest) AS age90,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("firstSeenAt" - "publishedAt")) / 60.0)
         FROM arts WHERE NOT "publishedAtEstimated" AND "firstSeenAt" >= "publishedAt") AS ttv50,
      (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM ("firstSeenAt" - "publishedAt")) / 60.0)
         FROM arts WHERE NOT "publishedAtEstimated" AND "firstSeenAt" >= "publishedAt") AS ttv90,
      (SELECT count(*) FROM "IngestionRun" WHERE "startedAt" > ${now}::timestamp - interval '24 hours')::int AS runs,
      (SELECT count(*) FROM "IngestionRun" WHERE "startedAt" > ${now}::timestamp - interval '24 hours'
         AND status NOT IN ('SUCCESS', 'NOT_MODIFIED', 'RUNNING'))::int AS failed,
      (SELECT count(*) FROM "IngestionRun" WHERE "startedAt" > ${now}::timestamp - interval '24 hours'
         AND attempt > 1)::int AS retried`;
  const share = (n: number) => (r!.total ? Math.round((n / r!.total) * 1000) / 1000 : 0);
  return {
    generatedAt: now.toISOString(),
    sources: {
      enabled: r!.enabled,
      reachable: r!.reachable,
      paused: r!.paused,
      failing: r!.failing,
    },
    coverage: {
      countriesAbout24h: r!.c24,
      countriesAbout7d: r!.c7,
      countriesWithEnabledSource: r!.csrc,
    },
    articles7d: {
      total: r!.total,
      languages: r!.languages ?? {},
      duplicateRatio: share(r!.dups),
      withoutAboutCountry: share(r!.no_country),
      withoutSector: share(r!.no_sector),
      typeUnknown: share(r!.type_unknown),
    },
    freshness: {
      newestArticleAgeHoursP50: round(r!.age50),
      newestArticleAgeHoursP90: round(r!.age90),
      timeToVisibleMinutesP50: round(r!.ttv50, 0),
      timeToVisibleMinutesP90: round(r!.ttv90, 0),
    },
    ingestion24h: { runs: r!.runs, failed: r!.failed, retried: r!.retried },
  };
}
