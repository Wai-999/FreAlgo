import type { PrismaClient } from '@/generated/prisma/client';
import {
  EVENTS_CRON,
  EVENTS_SCHEDULER_ID,
  FETCH_JOB_OPTIONS,
  MAINTENANCE_SCHEDULER_ID,
  TICK_SCHEDULER_ID,
  fetchJobId,
  windowStart,
  type FetchSourceJobData,
} from '@/lib/queue/ingest-queue';

/** Minimal queue surface so the cadence logic can be tested with a fake queue and fake clock. */
export interface BulkQueue {
  addBulk(
    jobs: {
      name: string;
      data: FetchSourceJobData;
      opts: Record<string, unknown> & { jobId: string };
    }[],
  ): Promise<unknown>;
}

export interface SchedulerQueue {
  upsertJobScheduler(
    id: string,
    repeat: { pattern: string; tz?: string },
    template?: { name: string; data?: unknown },
  ): Promise<unknown>;
}

/** Tolerance so a source fetched at 03:00:05 is due again at the 06:00 tick. */
const DUE_SLACK_MS = 10 * 60_000;

/**
 * Enqueues one fetch job for every ACTIVE source that is due in the current 3-hour window.
 * Called by the "schedule-tick" job; safe to call any number of times (deterministic job ids).
 */
export async function enqueueDueSources(
  prisma: PrismaClient,
  queue: BulkQueue,
  now: Date,
): Promise<{ window: Date; enqueued: number }> {
  const window = windowStart(now);
  const sources = await prisma.feedSource.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ nextEligibleFetchAt: null }, { nextEligibleFetchAt: { lte: now } }],
    },
    select: { id: true, lastAttemptAt: true, fetchIntervalMinutes: true },
    orderBy: { id: 'asc' },
  });
  const due = sources.filter(
    (s) =>
      !s.lastAttemptAt ||
      now.getTime() - s.lastAttemptAt.getTime() + DUE_SLACK_MS >= s.fetchIntervalMinutes * 60_000,
  );
  if (due.length) {
    await queue.addBulk(
      due.map((s) => ({
        name: 'fetch-source',
        data: { sourceId: s.id, trigger: 'schedule' as const, windowStart: window.toISOString() },
        opts: { ...FETCH_JOB_OPTIONS, jobId: fetchJobId(s.id, window) },
      })),
    );
  }
  return { window, enqueued: due.length };
}

/**
 * Registers the cluster-wide schedulers. `upsertJobScheduler` is keyed by id in Redis, so every
 * worker replica can call this at boot without creating duplicate schedules.
 */
export async function registerSchedulers(queue: SchedulerQueue, cron: string): Promise<void> {
  await queue.upsertJobScheduler(
    TICK_SCHEDULER_ID,
    { pattern: cron, tz: 'UTC' },
    { name: 'schedule-tick' },
  );
  await queue.upsertJobScheduler(
    MAINTENANCE_SCHEDULER_ID,
    { pattern: '17 4 * * *', tz: 'UTC' },
    { name: 'maintenance' },
  );
  await queue.upsertJobScheduler(
    EVENTS_SCHEDULER_ID,
    { pattern: EVENTS_CRON, tz: 'UTC' },
    { name: 'cluster-events' },
  );
}
