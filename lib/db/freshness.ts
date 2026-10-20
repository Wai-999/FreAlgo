import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Source freshness, computed from what actually happened (attempts and successful syncs), never
 * from the schedule alone. "Every 3 hours" is an attempt cadence, not a promise of new stories.
 */
export type FreshnessState = 'fresh' | 'stale' | 'never-synced' | 'paused' | 'error' | 'fixture';

export const FRESHNESS_LABEL: Record<FreshnessState, string> = {
  fresh: 'Fresh',
  stale: 'Stale',
  'never-synced': 'Never synced',
  paused: 'Paused',
  error: 'Error (circuit open)',
  fixture: 'Fixture (not fetched)',
};

interface SourceTimes {
  status: 'ACTIVE' | 'PAUSED' | 'ERROR';
  isFixture: boolean;
  lastSuccessfulSyncAt: Date | null;
  fetchIntervalMinutes: number;
}

/** Stale = no successful sync within two intervals plus 30 minutes of tolerance. */
export function classifyFreshness(s: SourceTimes, now = new Date()): FreshnessState {
  if (s.isFixture) return 'fixture';
  if (s.status === 'PAUSED') return 'paused';
  if (s.status === 'ERROR') return 'error';
  if (!s.lastSuccessfulSyncAt) return 'never-synced';
  const limit = (2 * s.fetchIntervalMinutes + 30) * 60_000;
  return now.getTime() - s.lastSuccessfulSyncAt.getTime() > limit ? 'stale' : 'fresh';
}

export async function getFreshnessReport(
  prisma: PrismaClient,
  opts: { includeFixtures: boolean; now?: Date },
) {
  const now = opts.now ?? new Date();
  const [sources, lastTick] = await Promise.all([
    prisma.feedSource.findMany({
      where: opts.includeFixtures ? {} : { isFixture: false },
      orderBy: [{ isFixture: 'asc' }, { outlet: { name: 'asc' } }, { url: 'asc' }],
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        isFixture: true,
        language: true,
        fetchIntervalMinutes: true,
        lastAttemptAt: true,
        lastSuccessfulSyncAt: true,
        lastNewItemAt: true,
        lastError: true,
        lastHttpStatus: true,
        failureCount: true,
        nextEligibleFetchAt: true,
        termsReviewedAt: true,
        outlet: {
          select: {
            name: true,
            slug: true,
            paywall: true,
            country: { select: { iso2: true, name: true } },
          },
        },
      },
    }),
    prisma.ingestionRun.findFirst({
      where: { trigger: 'schedule' },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    }),
  ]);

  const rows = sources.map((s) => ({
    id: s.id,
    feedName: s.name,
    url: s.url,
    outlet: { name: s.outlet.name, slug: s.outlet.slug, paywall: s.outlet.paywall },
    country: s.outlet.country,
    language: s.language,
    status: s.status,
    isFixture: s.isFixture,
    freshness: classifyFreshness(s, now),
    fetchIntervalMinutes: s.fetchIntervalMinutes,
    lastAttemptAt: s.lastAttemptAt,
    lastSuccessfulSyncAt: s.lastSuccessfulSyncAt,
    lastNewItemAt: s.lastNewItemAt,
    // Only the machine-readable code is public; full error text stays in the admin view.
    lastErrorCode: s.lastError ? s.lastError.split(':')[0] : null,
    failureCount: s.failureCount,
    nextEligibleFetchAt: s.nextEligibleFetchAt,
    termsReviewed: !!s.termsReviewedAt,
  }));

  const summary: Record<FreshnessState, number> = {
    fresh: 0,
    stale: 0,
    'never-synced': 0,
    paused: 0,
    error: 0,
    fixture: 0,
  };
  for (const r of rows) summary[r.freshness] += 1;

  return {
    generatedAt: now.toISOString(),
    schedule: {
      cron: process.env.INGEST_CRON ?? '0 */3 * * *',
      timezone: 'UTC',
      meaning: 'scheduled fetch attempt, not guaranteed new articles',
    },
    lastScheduledRunAt: lastTick?.startedAt ?? null,
    summary,
    sources: rows,
  };
}
