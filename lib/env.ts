import { z } from 'zod';

/**
 * Server-side environment contract shared by the web app, worker, seed and tests.
 * Never import this from a Client Component: nothing here is `NEXT_PUBLIC_`.
 * Parsing is lazy so `next build` does not require runtime secrets.
 */

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const bool = (fallback: boolean) =>
  z.preprocess((v) => {
    const x = emptyToUndefined(v);
    if (x === undefined) return fallback;
    if (typeof x === 'boolean') return x;
    return ['1', 'true', 'yes', 'on'].includes(String(x).toLowerCase());
  }, z.boolean());

const int = (fallback: number, min: number, max: number) =>
  z.preprocess((v) => emptyToUndefined(v) ?? fallback, z.coerce.number().int().min(min).max(max));

const optionalString = (schema: z.ZodType<string> = z.string()) =>
  z.preprocess(emptyToUndefined, schema.optional());

const csv = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  z.array(z.string()),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_BASE_URL: z.preprocess(emptyToUndefined, z.url().default('http://localhost:3000')),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.preprocess(emptyToUndefined, z.string().default('redis://localhost:6379')),

    SESSION_SECRET: optionalString(z.string().min(32, 'SESSION_SECRET must be >= 32 chars')),
    ADMIN_API_TOKEN: optionalString(z.string().min(32, 'ADMIN_API_TOKEN must be >= 32 chars')),
    ADMIN_USER_IDS: csv,
    AUTH_DEV_LOGIN: bool(false),
    OIDC_ISSUER: optionalString(z.url()),
    OIDC_CLIENT_ID: optionalString(),
    OIDC_CLIENT_SECRET: optionalString(),

    SEED_FIXTURES: bool(true),
    SHOW_FIXTURES: bool(true),

    INGEST_CRON: z.preprocess(emptyToUndefined, z.string().default('0 */3 * * *')),
    INGEST_TIMEOUT_MS: int(15_000, 1_000, 120_000),
    INGEST_MAX_BYTES: int(5 * 1024 * 1024, 64 * 1024, 50 * 1024 * 1024),
    INGEST_MAX_REDIRECTS: int(3, 0, 10),
    INGEST_WORKER_CONCURRENCY: int(4, 1, 64),
    INGEST_PER_HOST_CONCURRENCY: int(2, 1, 16),
    INGEST_USER_AGENT: z.preprocess(
      emptyToUndefined,
      z.string().default('FreAlgoFeedReader/0.1 (personal non-commercial reader)'),
    ),
    RETENTION_DAYS: int(90, 1, 3650),
    WORKER_HEALTH_PORT: int(9464, 1, 65535),

    LOG_LEVEL: z.preprocess(
      emptyToUndefined,
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ),
    CLIENT_TELEMETRY_ENABLED: bool(true),
    METRICS_TOKEN: optionalString(z.string().min(16)),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.SESSION_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET is required in production',
      });
    }
    const host = new URL(env.APP_BASE_URL).hostname;
    if (env.SESSION_SECRET?.includes('insecure') && !isLocalHostname(host)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'The built-in local SESSION_SECRET cannot be used on a non-localhost origin',
      });
    }
    if (env.AUTH_DEV_LOGIN && !isLocalHostname(host)) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_DEV_LOGIN'],
        message: 'AUTH_DEV_LOGIN is only allowed when APP_BASE_URL points at localhost',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.test')
  );
}

let cached: Env | undefined;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}

/** For tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}
