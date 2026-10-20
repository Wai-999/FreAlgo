import { NextRequest } from 'next/server';
import { OAuth2Server } from 'oauth2-mock-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signSession } from '@/lib/auth/session';
import {
  GET as getPrefs,
  PUT as putPrefs,
  DELETE as deletePrefs,
} from '@/app/api/v1/me/preferences/route';
import { GET as oidcStart } from '@/app/api/v1/auth/oidc/start/route';
import { GET as oidcCallback } from '@/app/api/v1/auth/oidc/callback/route';
import { closeTestPrisma, testPrisma } from '../support/db';

const prisma = testPrisma();
const BASE = 'http://localhost:3000';
const ctx = { params: Promise.resolve({}) };
const ip = () => ({ 'x-forwarded-for': `pref-test-${Math.random()}` });
const cookieFor = (uid: string) =>
  `frealgo_session=${signSession({ uid, exp: Math.floor(Date.now() / 1000) + 3600, v: 1 })}`;

function req(
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
  path = '/api/v1/me/preferences',
) {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      ...ip(),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const valid = {
  pinnedCountries: ['MM', 'KE'],
  outletSlugs: ['bbc-news'],
  sectors: ['agriculture'],
  orientations: ['CENTER', 'UNRATED'],
  languages: ['en', 'my'],
  preferredSort: 'oldest',
  reducedMotion: true,
  globeEnabled: false,
};

beforeAll(() => {
  process.env.SESSION_SECRET = 'integration-session-secret-0123456789abcdef';
  process.env.APP_BASE_URL = BASE;
});

afterAll(async () => {
  await prisma.userPreference.deleteMany({ where: { userId: { startsWith: 'dev:pref-' } } });
  await closeTestPrisma();
});

describe('opt-in preference sync', () => {
  it('rejects anonymous access (no identity inferred from IP)', async () => {
    expect((await getPrefs(req('GET'), ctx)).status).toBe(401);
    expect((await putPrefs(req('PUT', { origin: BASE }, valid), ctx)).status).toBe(401);
  });

  it('rejects forged sessions', async () => {
    const forged = `frealgo_session=${signSession({ uid: 'dev:pref-a', exp: 9_999_999_999, v: 1 }, 'x'.repeat(40))}`;
    expect((await getPrefs(req('GET', { cookie: forged }), ctx)).status).toBe(401);
  });

  it('requires a same-origin request to write', async () => {
    const res = await putPrefs(
      req('PUT', { cookie: cookieFor('dev:pref-a'), origin: 'https://evil.example' }, valid),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it('validates the body strictly (no unknown fields, no behavioural data)', async () => {
    const res = await putPrefs(
      req(
        'PUT',
        { cookie: cookieFor('dev:pref-a'), origin: BASE },
        { ...valid, readingHistory: ['x'] },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('stores, reads, exports and deletes only the signed-in user’s preferences', async () => {
    const a = cookieFor('dev:pref-a');
    const b = cookieFor('dev:pref-b');
    expect((await putPrefs(req('PUT', { cookie: a, origin: BASE }, valid), ctx)).status).toBe(200);
    const read = await (await getPrefs(req('GET', { cookie: a }), ctx)).json();
    expect(read.preferences).toMatchObject(valid);
    expect((await getPrefs(req('GET', { cookie: b }), ctx)).status).toBe(404);

    const exported = await getPrefs(
      req('GET', { cookie: a }, undefined, '/api/v1/me/preferences?download=1'),
      ctx,
    );
    expect(exported.headers.get('content-disposition')).toMatch(/attachment/);

    expect(
      await (await deletePrefs(req('DELETE', { cookie: a, origin: BASE }), ctx)).json(),
    ).toEqual({ deleted: true });
    expect(await prisma.userPreference.count({ where: { userId: 'dev:pref-a' } })).toBe(0);
  });
});

describe('OpenID Connect sign-in (mock identity provider)', () => {
  let idp: OAuth2Server;

  beforeAll(async () => {
    idp = new OAuth2Server();
    await idp.issuer.keys.generate('RS256');
    await idp.start(0, 'localhost');
    process.env.OIDC_ISSUER = idp.issuer.url!;
    process.env.OIDC_CLIENT_ID = 'frealgo-test';
    process.env.OIDC_CLIENT_SECRET = 'test-secret';
  });

  afterAll(async () => {
    await idp.stop();
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
  });

  it('completes code + PKCE flow and issues an opaque session id', async () => {
    const start = await oidcStart(req('GET', {}, undefined, '/api/v1/auth/oidc/start'), ctx);
    expect(start.status).toBe(303);
    const authorize = new URL(start.headers.get('location')!);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('state')).toBeTruthy();
    expect(authorize.searchParams.get('nonce')).toBeTruthy();
    const transient = start.headers.get('set-cookie')!.match(/frealgo_oidc=([^;]+)/)![1]!;

    // The mock IdP auto-approves and redirects back with ?code=…&state=…
    const idpRes = await fetch(authorize, { redirect: 'manual' });
    const back = new URL(idpRes.headers.get('location')!);
    const callback = await oidcCallback(
      req(
        'GET',
        { cookie: `frealgo_oidc=${transient}` },
        undefined,
        `/api/v1/auth/oidc/callback${back.search}`,
      ),
      ctx,
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('/account');
    const session = callback.headers.get('set-cookie')!;
    expect(session).toMatch(/frealgo_session=/);
    expect(session).toMatch(/HttpOnly/i);
  });

  it('rejects a callback whose state does not match', async () => {
    const start = await oidcStart(req('GET', {}, undefined, '/api/v1/auth/oidc/start'), ctx);
    const transient = start.headers.get('set-cookie')!.match(/frealgo_oidc=([^;]+)/)![1]!;
    const authorize = new URL(start.headers.get('location')!);
    const back = new URL((await fetch(authorize, { redirect: 'manual' })).headers.get('location')!);
    back.searchParams.set('state', 'tampered');
    const res = await oidcCallback(
      req(
        'GET',
        { cookie: `frealgo_oidc=${transient}` },
        undefined,
        `/api/v1/auth/oidc/callback${back.search}`,
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a callback without the signed transient cookie', async () => {
    const res = await oidcCallback(
      req('GET', {}, undefined, '/api/v1/auth/oidc/callback?code=x&state=y'),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('OIDC_STATE_MISSING');
  });
});
