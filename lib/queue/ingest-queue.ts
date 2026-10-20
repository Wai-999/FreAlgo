import { Queue } from 'bullmq';
import { JOB_ATTEMPTS } from '@/lib/ingest/backoff';
import { bullConnection } from '@/lib/redis';

/** Queue names and job contracts shared by the worker and the web app's admin actions. */
export const INGEST_QUEUE = 'frealgo-ingest';
export const DLQ_QUEUE = 'frealgo-ingest-dlq';
export const TICK_SCHEDULER_ID = 'ingest-tick';
export const MAINTENANCE_SCHEDULER_ID = 'maintenance-daily';
export const CADENCE_MINUTES = 180;

export type IngestJobName = 'schedule-tick' | 'fetch-source' | 'maintenance';

export interface FetchSourceJobData {
  sourceId: string;
  trigger: 'schedule' | 'manual';
  windowStart?: string;
  requestedBy?: string;
}

export const FETCH_JOB_OPTIONS = {
  attempts: JOB_ATTEMPTS,
  backoff: { type: 'jitter' as const },
  removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
  removeOnFail: { age: 30 * 24 * 3600 },
};

/** Start of the 3-hour UTC window containing `now` (00:00, 03:00, ... 21:00). */
export function windowStart(now: Date, cadenceMinutes = CADENCE_MINUTES): Date {
  const ms = cadenceMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** One job per source per window: re-ticks, retries and extra replicas cannot duplicate it. */
export function fetchJobId(sourceId: string, window: Date): string {
  return `fetch__${sourceId}__${window.getTime()}`;
}

/** Manual re-fetches dedupe per minute so repeated clicks enqueue one job. */
export function manualJobId(sourceId: string, now: Date): string {
  return `manual__${sourceId}__${Math.floor(now.getTime() / 60_000)}`;
}

const globalForQueue = globalThis as unknown as { __frealgoIngestQueue?: Queue };

export function getIngestQueue(): Queue {
  globalForQueue.__frealgoIngestQueue ??= new Queue(INGEST_QUEUE, {
    connection: bullConnection(),
    prefix: process.env.QUEUE_PREFIX ?? 'bull',
  });
  return globalForQueue.__frealgoIngestQueue;
}
