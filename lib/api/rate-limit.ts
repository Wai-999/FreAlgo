import { createHash } from 'node:crypto';
import { ensureConnected, getRedis } from '@/lib/redis';

/**
 * Fixed-window rate limiting. Redis-backed so limits hold across web replicas, with an in-memory
 * fallback when Redis is unavailable (graceful degradation: per-instance limits instead of none).
 *
 * Privacy: the client key is a truncated SHA-256 of the network address plus a daily-rotating
 * salt. Raw IPs are never stored or logged, and keys expire with the window.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetSec: number;
}

const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  if (memory.size > 50_000) {
    for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  }
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return { ok: true, remaining: limit - 1, resetSec: windowSec };
  }
  entry.count += 1;
  return {
    ok: entry.count <= limit,
    remaining: limit - entry.count,
    resetSec: Math.ceil((entry.expiresAt - now) / 1000),
  };
}

export function clientKey(req: Request): string {
  // Behind a reverse proxy, the left-most X-Forwarded-For entry is the client. Without a proxy
  // the header may be absent; requests then share one bucket (documented in docs/operations/runbook.md).
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || req.headers.get('x-real-ip') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.SESSION_SECRET ?? 'frealgo';
  return createHash('sha256').update(`${salt}:${day}:${ip}`).digest('hex').slice(0, 20);
}

export async function checkRateLimit(
  rule: { bucket: string; limit: number; windowSec: number },
  key: string,
): Promise<RateLimitResult> {
  const window = Math.floor(Date.now() / 1000 / rule.windowSec);
  const redisKey = `frealgo:rl:${rule.bucket}:${key}:${window}`;
  try {
    const redis = getRedis();
    await ensureConnected(redis);
    const results = await redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, rule.windowSec, 'NX')
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const resetSec = rule.windowSec - (Math.floor(Date.now() / 1000) % rule.windowSec);
    return { ok: count <= rule.limit, remaining: rule.limit - count, resetSec };
  } catch {
    return memoryLimit(redisKey, rule.limit, rule.windowSec);
  }
}
