import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/lib/auth/session';
import { classifyFreshness } from '@/lib/db/freshness';

const KEY = 'unit-test-secret-0123456789abcdef0123456789';

describe('session cookies', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;

  it('round-trips a signed session', () => {
    expect(verifySession(signSession({ uid: 'dev:a', exp, v: 1 }, KEY), KEY)).toEqual({
      uid: 'dev:a',
      exp,
      v: 1,
    });
  });

  it('rejects tampering, wrong keys, expiry and junk', () => {
    const token = signSession({ uid: 'dev:a', exp, v: 1 }, KEY);
    const [body, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ uid: 'dev:admin', exp, v: 1 })).toString(
      'base64url',
    );
    expect(verifySession(`${forgedBody}.${sig}`, KEY)).toBeNull();
    expect(verifySession(`${body}.${sig}x`, KEY)).toBeNull();
    expect(verifySession(token, `${KEY}-other`)).toBeNull();
    expect(verifySession(signSession({ uid: 'dev:a', exp: 1, v: 1 }, KEY), KEY)).toBeNull();
    expect(verifySession('garbage', KEY)).toBeNull();
    expect(verifySession(undefined, KEY)).toBeNull();
  });
});

describe('freshness classification', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const base = { status: 'ACTIVE' as const, isFixture: false, fetchIntervalMinutes: 180 };
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it('is truthful about every state', () => {
    expect(classifyFreshness({ ...base, isFixture: true, lastSuccessfulSyncAt: null }, now)).toBe(
      'fixture',
    );
    expect(
      classifyFreshness({ ...base, status: 'PAUSED', lastSuccessfulSyncAt: hoursAgo(1) }, now),
    ).toBe('paused');
    expect(
      classifyFreshness({ ...base, status: 'ERROR', lastSuccessfulSyncAt: hoursAgo(1) }, now),
    ).toBe('error');
    expect(classifyFreshness({ ...base, lastSuccessfulSyncAt: null }, now)).toBe('never-synced');
    expect(classifyFreshness({ ...base, lastSuccessfulSyncAt: hoursAgo(5) }, now)).toBe('fresh');
    expect(classifyFreshness({ ...base, lastSuccessfulSyncAt: hoursAgo(6.6) }, now)).toBe('stale');
  });
});
