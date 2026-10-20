/**
 * Ingestion worker entry point (deployed separately from the web app).
 *
 *  - Registers two cluster-wide BullMQ job schedulers (idempotent across replicas):
 *      ingest-tick       INGEST_CRON (default "0 *\/3 * * *", UTC) -> enqueue due sources
 *      maintenance-daily 04:17 UTC                                  -> retention cleanup
 *  - Consumes fetch-source jobs with bounded concurrency + per-host limits
 *  - Moves jobs that exhausted their retries to the dead-letter queue
 *  - Serves /healthz and /metrics on WORKER_HEALTH_PORT (not published publicly)
 */
process.env.SERVICE_NAME ??= 'worker';

import { disconnectPrisma, getPrisma } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { getLogger } from '@/lib/log';
import { bullConnection, createRedis, ensureConnected, pingRedis } from '@/lib/redis';
import { startHealthServer } from './health-server';
import { HostLimiter } from './host-limiter';
import { collectMetrics } from './metrics';
import { startIngestRuntime } from './runtime';
import { registerSchedulers } from './scheduler';

const log = getLogger();

async function main() {
  const env = getEnv();
  const prisma = getPrisma();
  const redis = createRedis({ maxRetriesPerRequest: 3, enableOfflineQueue: true });
  await ensureConnected(redis);

  const runtime = startIngestRuntime({
    connection: bullConnection(),
    prisma,
    limiter: new HostLimiter(redis, env.INGEST_PER_HOST_CONCURRENCY),
    retentionDays: env.RETENTION_DAYS,
    concurrency: env.INGEST_WORKER_CONCURRENCY,
    logger: log,
    providerContext: {
      env: process.env,
      respectRobots: true,
      fetchOptions: {
        userAgent: env.INGEST_USER_AGENT,
        timeoutMs: env.INGEST_TIMEOUT_MS,
        maxBytes: env.INGEST_MAX_BYTES,
        maxRedirects: env.INGEST_MAX_REDIRECTS,
      },
    },
  });
  const { queue, dlq, worker } = runtime;

  await registerSchedulers(queue, env.INGEST_CRON);
  log.info({ cron: env.INGEST_CRON, tz: 'UTC' }, 'job schedulers registered');

  const startedAt = new Date();
  const server = startHealthServer(env.WORKER_HEALTH_PORT, {
    startedAt,
    ready: async () => {
      const [db, redisOk] = await Promise.all([
        prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        pingRedis(),
      ]);
      const running = worker.isRunning();
      return {
        ok: db && redisOk && running,
        checks: {
          database: db ? 'ok' : 'error',
          redis: redisOk ? 'ok' : 'error',
          worker: running ? 'running' : 'stopped',
        },
      };
    },
    metrics: () => collectMetrics(prisma, queue, dlq),
  });
  log.info(
    { port: env.WORKER_HEALTH_PORT, concurrency: env.INGEST_WORKER_CONCURRENCY },
    'worker started',
  );

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'worker shutting down (finishing active jobs)');
    server.close();
    await runtime.close();
    redis.disconnect();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
