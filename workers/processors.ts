import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import type { Logger } from 'pino';
import type { PrismaClient } from '@/generated/prisma/client';
import { runEventClustering } from '@/lib/events/job';
import { isEnabled } from '@/lib/flags';
import type { FetchSourceJobData, IngestJobName } from '@/lib/queue/ingest-queue';
import type { HostLimiter } from './host-limiter';
import { runMaintenance } from './maintenance';
import type { FeedProvider, ProviderContext } from './providers/types';
import { runSource } from './run-source';
import { enqueueDueSources, type BulkQueue } from './scheduler';

export interface ProcessorDeps {
  prisma: PrismaClient;
  queue: BulkQueue;
  limiter: HostLimiter | null;
  providerContext: ProviderContext;
  retentionDays: number;
  logger: Logger;
  now?: () => Date;
  providers?: Partial<Record<'RSS' | 'ATOM' | 'LICENSED_API', FeedProvider>>;
}

/** Thrown to make BullMQ retry a transient failure with the configured backoff. */
export class RetryableJobError extends Error {
  constructor(code: string) {
    super(`Retryable ingestion failure: ${code}`);
    this.name = 'RetryableJobError';
  }
}

export function createProcessor(deps: ProcessorDeps) {
  const now = deps.now ?? (() => new Date());

  return async function process(job: Job, token?: string) {
    switch (job.name as IngestJobName) {
      case 'schedule-tick': {
        const res = await enqueueDueSources(deps.prisma, deps.queue, now());
        deps.logger.info(
          { window: res.window.toISOString(), enqueued: res.enqueued },
          'schedule tick',
        );
        return { window: res.window.toISOString(), enqueued: res.enqueued };
      }
      case 'maintenance': {
        const res = await runMaintenance(deps.prisma, deps.retentionDays, now());
        deps.logger.info(res, 'maintenance complete');
        return res;
      }
      case 'cluster-events': {
        // Switchable without a deploy: FEATURE_EVENT_CLUSTERING=false stops new grouping.
        if (!isEnabled('eventClustering')) {
          deps.logger.info({ skipped: 'flag-off' }, 'event clustering skipped');
          return { skipped: 'flag-off' };
        }
        const res = await runEventClustering(deps.prisma, { now: now() });
        deps.logger.info(res, 'event clustering complete');
        return res;
      }
      case 'fetch-source': {
        const data = job.data as FetchSourceJobData;
        const source = await deps.prisma.feedSource.findUnique({
          where: { id: data.sourceId },
          select: { url: true },
        });
        if (!source) return { status: 'SKIPPED', skippedReason: 'source-not-found' };
        const host = new URL(source.url).hostname;

        let lease: string | null = null;
        if (deps.limiter) {
          lease = await deps.limiter.acquire(host);
          if (!lease) {
            // Host busy: push back a few seconds without consuming an attempt.
            await job.moveToDelayed(Date.now() + 3_000 + Math.floor(Math.random() * 4_000), token);
            throw new DelayedError();
          }
        }
        try {
          const result = await runSource(
            {
              sourceId: data.sourceId,
              trigger: data.trigger,
              jobId: job.id,
              attempt: job.attemptsMade + 1,
              maxAttempts: job.opts.attempts ?? 1,
            },
            {
              prisma: deps.prisma,
              providerContext: deps.providerContext,
              logger: deps.logger,
              now: deps.now,
              providers: deps.providers,
            },
          );
          if (result.status === 'FAILED') {
            // Transient with attempts left -> BullMQ retries with backoff. Otherwise the failure is
            // final (already recorded on the source): fail the job so it lands in the DLQ.
            if (result.retry) throw new RetryableJobError(result.errorCode ?? 'UNKNOWN');
            throw new UnrecoverableError(
              `Ingestion failed permanently: ${result.errorCode ?? 'UNKNOWN'}`,
            );
          }
          return result;
        } finally {
          if (lease && deps.limiter) await deps.limiter.release(host, lease);
        }
      }
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  };
}
