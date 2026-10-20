import { getPrisma } from '@/lib/db/client';
import { pingRedis } from '@/lib/redis';

/**
 * Readiness: database and Redis reachability. Redis being down degrades (rate limits fall back to
 * in-memory, re-fetch buttons disabled) but reads still work, so it reports "degraded" with 200.
 */
export async function GET() {
  const started = Date.now();
  const [db, redis] = await Promise.all([
    getPrisma().$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    pingRedis(),
  ]);
  const status = db ? (redis ? 'ok' : 'degraded') : 'unavailable';
  return Response.json(
    {
      status,
      checks: { database: db ? 'ok' : 'error', redis: redis ? 'ok' : 'error' },
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: db ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
