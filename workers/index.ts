/**
 * Ingestion worker entry point (separate deployable from the web app).
 * Milestone 1: process skeleton with health endpoint, DB + Redis readiness and graceful shutdown.
 * Milestone 2 adds the BullMQ scheduler and source-fetch processors.
 */
process.env.SERVICE_NAME ??= 'worker';

import { disconnectPrisma, getPrisma } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { getLogger } from '@/lib/log';
import { pingRedis } from '@/lib/redis';
import { startHealthServer } from './health-server';

const log = getLogger();

async function main() {
  const env = getEnv();
  const startedAt = new Date();
  const server = startHealthServer(env.WORKER_HEALTH_PORT, {
    startedAt,
    ready: async () => {
      const [db, redis] = await Promise.all([
        getPrisma().$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        pingRedis(),
      ]);
      return {
        ok: db && redis,
        checks: { database: db ? 'ok' : 'error', redis: redis ? 'ok' : 'error' },
      };
    },
    metrics: async () =>
      `# HELP frealgo_worker_up Worker process is running\n# TYPE frealgo_worker_up gauge\nfrealgo_worker_up 1\n`,
  });
  log.info({ port: env.WORKER_HEALTH_PORT }, 'worker started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker shutting down');
    server.close();
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
