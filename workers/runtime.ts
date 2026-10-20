import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Logger } from 'pino';
import type { PrismaClient } from '@/generated/prisma/client';
import { jobBackoffMs } from '@/lib/ingest/backoff';
import { DLQ_QUEUE, INGEST_QUEUE } from '@/lib/queue/ingest-queue';
import type { HostLimiter } from './host-limiter';
import { createProcessor } from './processors';
import type { FeedProvider, ProviderContext } from './providers/types';

export interface RuntimeOptions {
  connection: ConnectionOptions;
  prefix?: string;
  prisma: PrismaClient;
  limiter: HostLimiter | null;
  providerContext: ProviderContext;
  retentionDays: number;
  concurrency: number;
  logger: Logger;
  now?: () => Date;
  providers?: Partial<Record<'RSS' | 'ATOM' | 'LICENSED_API', FeedProvider>>;
  /** Override for tests (milliseconds per retry). */
  backoffMs?: (attemptsMade: number) => number;
}

/** Wires queue + worker + dead-letter handling. Shared by the worker process and tests. */
export function startIngestRuntime(opts: RuntimeOptions) {
  const prefix = opts.prefix ?? process.env.QUEUE_PREFIX ?? 'bull';
  const queue = new Queue(INGEST_QUEUE, { connection: opts.connection, prefix });
  const dlq = new Queue(DLQ_QUEUE, { connection: opts.connection, prefix });
  const processor = createProcessor({
    prisma: opts.prisma,
    queue,
    limiter: opts.limiter,
    providerContext: opts.providerContext,
    retentionDays: opts.retentionDays,
    logger: opts.logger,
    now: opts.now,
    providers: opts.providers,
  });
  const backoff = opts.backoffMs ?? ((n: number) => jobBackoffMs(n));
  const worker = new Worker(INGEST_QUEUE, processor, {
    connection: opts.connection,
    prefix,
    concurrency: opts.concurrency,
    lockDuration: 120_000,
    settings: { backoffStrategy: (attemptsMade: number) => backoff(attemptsMade) },
  });

  worker.on('failed', (job, err) => {
    if (!job) return;
    const exhausted =
      err.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
    opts.logger.warn(
      {
        jobId: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        exhausted,
        err: err.message,
      },
      'job failed',
    );
    if (exhausted) {
      void dlq
        .add(
          'dead-letter',
          {
            originalJobId: job.id,
            name: job.name,
            data: job.data,
            error: err.message,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: { age: 30 * 24 * 3600 } },
        )
        .catch((e: Error) => opts.logger.error({ err: e.message }, 'could not write to DLQ'));
    }
  });
  worker.on('error', (err) => opts.logger.error({ err: err.message }, 'worker error'));

  return {
    queue,
    dlq,
    worker,
    async close() {
      await worker.close();
      await Promise.all([queue.close(), dlq.close()]);
    },
  };
}
