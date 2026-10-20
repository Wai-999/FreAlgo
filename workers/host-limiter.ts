import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

/**
 * Distributed per-host concurrency limiter (Redis sorted-set semaphore with lease expiry), so
 * several worker replicas never hit the same publisher with more than `limit` parallel requests.
 */
const ACQUIRE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[2]))
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
end
return 0`;

export class HostLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly leaseMs = 120_000,
  ) {}

  private key(host: string) {
    return `frealgo:host-sem:${host.toLowerCase()}`;
  }

  async acquire(host: string): Promise<string | null> {
    const token = randomUUID();
    const ok = await this.redis.eval(
      ACQUIRE,
      1,
      this.key(host),
      Date.now(),
      this.leaseMs,
      this.limit,
      token,
    );
    return ok === 1 ? token : null;
  }

  async release(host: string, token: string): Promise<void> {
    await this.redis.zrem(this.key(host), token);
  }
}
