import { Redis, type RedisOptions } from 'ioredis';

/**
 * Redis connections. BullMQ workers need `maxRetriesPerRequest: null`; request-path usage
 * (rate limiting, health) uses a short retry budget so a Redis outage degrades gracefully
 * instead of hanging requests.
 */
const globalForRedis = globalThis as unknown as { __frealgoRedis?: Redis };

export function redisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function createRedis(opts: RedisOptions = {}): Redis {
  return new Redis(redisUrl(), {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    ...opts,
  });
}

/** Connection options for BullMQ queues/workers (blocking commands, unlimited retries). */
export function bullConnection(): RedisOptions & { url: string } {
  return { url: redisUrl(), maxRetriesPerRequest: null, enableReadyCheck: true };
}

export function getRedis(): Redis {
  if (!globalForRedis.__frealgoRedis) {
    const client = createRedis();
    client.on('error', () => {
      // Errors surface through command rejections; avoid unhandled 'error' events.
    });
    globalForRedis.__frealgoRedis = client;
  }
  return globalForRedis.__frealgoRedis;
}

export async function ensureConnected(client: Redis): Promise<void> {
  if (client.status === 'wait' || client.status === 'end') await client.connect();
}

export async function pingRedis(timeoutMs = 1_500): Promise<boolean> {
  const client = getRedis();
  try {
    await ensureConnected(client);
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  }
}
