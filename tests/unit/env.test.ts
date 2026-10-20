import { describe, expect, it } from 'vitest';
import { isLocalHostname, parseEnv } from '@/lib/env';

const minimal = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('environment validation', () => {
  it('applies safe defaults in development', () => {
    const env = parseEnv(minimal);
    expect(env.NODE_ENV).toBe('development');
    expect(env.INGEST_CRON).toBe('0 */3 * * *');
    expect(env.AUTH_DEV_LOGIN).toBe(false);
    expect(env.ADMIN_USER_IDS).toEqual([]);
  });

  it('treats empty strings (from compose ${VAR:-}) as unset', () => {
    const env = parseEnv({ ...minimal, SESSION_SECRET: '', ADMIN_API_TOKEN: '', OIDC_ISSUER: '' });
    expect(env.SESSION_SECRET).toBeUndefined();
    expect(env.ADMIN_API_TOKEN).toBeUndefined();
  });

  it('requires DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('requires a strong session secret in production', () => {
    expect(() => parseEnv({ ...minimal, NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv({ ...minimal, NODE_ENV: 'production', SESSION_SECRET: 'short' })).toThrow(
      /32/,
    );
  });

  it('refuses dev login on a non-local production origin', () => {
    expect(() =>
      parseEnv({
        ...minimal,
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(40),
        AUTH_DEV_LOGIN: 'true',
        APP_BASE_URL: 'https://news.example.com',
      }),
    ).toThrow(/AUTH_DEV_LOGIN/);
    expect(
      parseEnv({
        ...minimal,
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(40),
        AUTH_DEV_LOGIN: 'true',
        APP_BASE_URL: 'http://localhost:3000',
      }).AUTH_DEV_LOGIN,
    ).toBe(true);
  });

  it('rejects the compose fallback secret outside localhost', () => {
    const insecure = 'insecure-local-compose-session-secret-0000000000';
    expect(() =>
      parseEnv({
        ...minimal,
        NODE_ENV: 'production',
        SESSION_SECRET: insecure,
        APP_BASE_URL: 'https://news.example.com',
      }),
    ).toThrow(/non-localhost/);
    expect(
      parseEnv({ ...minimal, NODE_ENV: 'production', SESSION_SECRET: insecure }).SESSION_SECRET,
    ).toBe(insecure);
  });

  it('bounds numeric settings', () => {
    expect(() => parseEnv({ ...minimal, INGEST_TIMEOUT_MS: '10' })).toThrow();
    expect(parseEnv({ ...minimal, INGEST_TIMEOUT_MS: '20000' }).INGEST_TIMEOUT_MS).toBe(20000);
  });

  it('recognises local development hosts only', () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('app.localhost')).toBe(true);
    expect(isLocalHostname('frealgo.test')).toBe(true);
    expect(isLocalHostname('localhost.evil.com')).toBe(false);
  });
});
