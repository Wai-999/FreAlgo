import { Queue } from 'bullmq';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/lib/auth/session';
import { INGEST_QUEUE } from '@/lib/queue/ingest-queue';
import { seedCountries, seedRealSources, seedSectors } from '@/prisma/seed';
import { GET as listSources } from '@/app/api/v1/admin/sources/route';
import { PATCH as patchSource } from '@/app/api/v1/admin/sources/[id]/route';
import { POST as refetch } from '@/app/api/v1/admin/sources/[id]/refetch/route';
import { PATCH as patchLabel } from '@/app/api/v1/admin/outlets/[id]/label/route';
import { POST as articleStatus } from '@/app/api/v1/admin/articles/[id]/status/route';
import { POST as appeal } from '@/app/api/v1/label-appeals/route';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';

const prisma = testPrisma();
const TOKEN = 'test-admin-token-0123456789abcdef0123456789';
const BASE = 'http://localhost:3000';

function req(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      host: 'localhost:3000',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}
const ctx = <P>(params: P) => ({ params: Promise.resolve(params) });
const cookieFor = (uid: string) =>
  `frealgo_session=${signSession({ uid, exp: Math.floor(Date.now() / 1000) + 3600, v: 1 })}`;

beforeAll(async () => {
  process.env.ADMIN_API_TOKEN = TOKEN;
  process.env.ADMIN_USER_IDS = 'dev:local-admin';
  process.env.SESSION_SECRET = 'integration-session-secret-0123456789abcdef';
  process.env.APP_BASE_URL = BASE;
  process.env.QUEUE_PREFIX = `test-admin-${Date.now()}`;
  await truncateContent();
  await seedCountries(prisma);
  await seedSectors(prisma);
});

beforeEach(async () => {
  await truncateContent();
  await seedRealSources(prisma);
});

afterAll(async () => {
  const q = new Queue(INGEST_QUEUE, {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    prefix: process.env.QUEUE_PREFIX,
  });
  await q.obliterate({ force: true }).catch(() => undefined);
  await q.close();
  await closeTestPrisma();
});

describe('admin API authorization (server-side)', () => {
  it('rejects anonymous requests with 401 and a stable error envelope', async () => {
    const res = await listSources(req('/api/v1/admin/sources'), ctx({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(body.error.requestId).toBeTruthy();
  });

  it('rejects a wrong bearer token', async () => {
    const res = await listSources(
      req('/api/v1/admin/sources', { headers: { authorization: 'Bearer nope' } }),
      ctx({}),
    );
    expect(res.status).toBe(401);
  });

  it('rejects signed-in users who are not administrators (403)', async () => {
    const res = await listSources(
      req('/api/v1/admin/sources', { headers: { cookie: cookieFor('dev:someone') } }),
      ctx({}),
    );
    expect(res.status).toBe(403);
  });

  it('rejects forged session cookies', async () => {
    const forged = `frealgo_session=${signSession({ uid: 'dev:local-admin', exp: 9_999_999_999, v: 1 }, 'wrong-secret-0123456789abcdef0123456789')}`;
    const res = await listSources(
      req('/api/v1/admin/sources', { headers: { cookie: forged } }),
      ctx({}),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the admin token and an admin session', async () => {
    const a = await listSources(
      req('/api/v1/admin/sources', { headers: { authorization: `Bearer ${TOKEN}` } }),
      ctx({}),
    );
    expect(a.status).toBe(200);
    expect((await a.json()).sources.length).toBeGreaterThan(20);
    const b = await listSources(
      req('/api/v1/admin/sources', { headers: { cookie: cookieFor('dev:local-admin') } }),
      ctx({}),
    );
    expect(b.status).toBe(200);
  });

  it('rejects cookie-authenticated writes without a same-origin Origin header (CSRF)', async () => {
    const source = await prisma.feedSource.findFirstOrThrow({ where: { isFixture: false } });
    const res = await patchSource(
      req(`/api/v1/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: { cookie: cookieFor('dev:local-admin'), origin: 'https://evil.example' },
        body: { status: 'PAUSED' },
      }),
      ctx({ id: source.id }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('CSRF_REJECTED');
  });
});

describe('source governance policy', () => {
  const auth = { authorization: `Bearer ${TOKEN}` };

  it('refuses to activate a real feed without a recorded terms review', async () => {
    const source = await prisma.feedSource.findFirstOrThrow({ where: { isFixture: false } });
    const res = await patchSource(
      req(`/api/v1/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: auth,
        body: { status: 'ACTIVE' },
      }),
      ctx({ id: source.id }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('TERMS_REVIEW_REQUIRED');
    expect((await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } })).status).toBe(
      'PAUSED',
    );
  });

  it('activates with a terms review and writes an audit entry', async () => {
    const source = await prisma.feedSource.findFirstOrThrow({ where: { isFixture: false } });
    const res = await patchSource(
      req(`/api/v1/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: auth,
        body: {
          status: 'ACTIVE',
          termsReviewed: {
            licenseNotes: 'Personal non-commercial RSS use permitted',
            excerptAllowed: true,
          },
        },
      }),
      ctx({ id: source.id }),
    );
    expect(res.status).toBe(200);
    const s = await prisma.feedSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(s.status).toBe('ACTIVE');
    expect(s.termsReviewedAt).not.toBeNull();
    const log = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: source.id } });
    expect(log).toMatchObject({ actor: 'token:admin-api', action: 'source.active' });
  });

  it('validates bodies and rejects unknown statuses with VALIDATION_ERROR', async () => {
    const source = await prisma.feedSource.findFirstOrThrow({ where: { isFixture: false } });
    const res = await patchSource(
      req(`/api/v1/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: auth,
        body: { status: 'DELETED' },
      }),
      ctx({ id: source.id }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a manual re-fetch before terms review, then queues one (deduplicated per minute)', async () => {
    const source = await prisma.feedSource.findFirstOrThrow({ where: { isFixture: false } });
    const blocked = await refetch(
      req(`/api/v1/admin/sources/${source.id}/refetch`, { method: 'POST', headers: auth }),
      ctx({ id: source.id }),
    );
    expect(blocked.status).toBe(409);
    await prisma.feedSource.update({
      where: { id: source.id },
      data: { termsReviewedAt: new Date() },
    });
    const r1 = await refetch(
      req(`/api/v1/admin/sources/${source.id}/refetch`, { method: 'POST', headers: auth }),
      ctx({ id: source.id }),
    );
    const r2 = await refetch(
      req(`/api/v1/admin/sources/${source.id}/refetch`, { method: 'POST', headers: auth }),
      ctx({ id: source.id }),
    );
    expect(r1.status).toBe(200);
    expect((await r1.json()).jobId).toBe((await r2.json()).jobId);
  });

  it('rejects labels that break the editorial policy and records valid changes in history', async () => {
    const outlet = await prisma.mediaOutlet.findFirstOrThrow({ where: { isFixture: false } });
    const bad = await patchLabel(
      req(`/api/v1/admin/outlets/${outlet.id}/label`, {
        method: 'PATCH',
        headers: auth,
        body: {
          orientation: 'CENTER',
          status: 'REVIEWED',
          confidence: 0.7,
          methodology: null,
          sourceUrl: null,
          reviewedAt: null,
          context: null,
          changeReason: 'test change',
        },
      }),
      ctx({ id: outlet.id }),
    );
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.details).toEqual(
      expect.arrayContaining([
        'reviewed-without-methodology',
        'reviewed-without-date',
        'rated-without-source',
      ]),
    );

    const good = await patchLabel(
      req(`/api/v1/admin/outlets/${outlet.id}/label`, {
        method: 'PATCH',
        headers: auth,
        body: {
          orientation: 'DISPUTED',
          status: 'DISPUTED',
          confidence: 0.3,
          methodology: 'Test methodology for integration tests',
          sourceUrl: 'https://example.org/assessment',
          reviewedAt: null,
          context: 'Test context',
          changeReason: 'Appeal opened in test',
        },
      }),
      ctx({ id: outlet.id }),
    );
    expect(good.status).toBe(200);
    const history = await prisma.outletLabelHistory.findMany({
      where: { outletId: outlet.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => h.orientation)).toEqual(['UNRATED', 'DISPUTED']);
    expect(history.at(-1)).toMatchObject({
      changedBy: 'token:admin-api',
      changeReason: 'Appeal opened in test',
    });
  });

  it('takes an article down and records why', async () => {
    const outlet = await prisma.mediaOutlet.findFirstOrThrow({ where: { isFixture: false } });
    const article = await prisma.article.create({
      data: {
        outletId: outlet.id,
        canonicalUrl: 'https://example.org/a',
        canonicalUrlHash: 'a'.repeat(64),
        title: 'Test article',
        publishedAt: new Date(),
      },
    });
    const res = await articleStatus(
      req(`/api/v1/admin/articles/${article.id}/status`, {
        method: 'POST',
        headers: auth,
        body: { status: 'REMOVED', reason: 'Publisher takedown request' },
      }),
      ctx({ id: article.id }),
    );
    expect(res.status).toBe(200);
    expect(await prisma.article.findUniqueOrThrow({ where: { id: article.id } })).toMatchObject({
      status: 'REMOVED',
      statusReason: 'Publisher takedown request',
    });
  });
});

describe('public label appeals', () => {
  it('accepts an appeal and rejects honeypot spam', async () => {
    // Unique client address per run: the appeals bucket allows 5/hour and persists in Redis.
    const ip = { 'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250)}-${Date.now()}` };
    const ok = await appeal(
      req('/api/v1/label-appeals', {
        method: 'POST',
        headers: ip,
        body: {
          outletSlug: 'bbc-news',
          message: 'The label should cite a methodology for this outlet please.',
        },
      }),
      ctx({}),
    );
    expect(ok.status).toBe(201);
    expect(await prisma.labelAppeal.count()).toBe(1);
    const spam = await appeal(
      req('/api/v1/label-appeals', {
        method: 'POST',
        headers: ip,
        body: {
          outletSlug: 'bbc-news',
          message: 'Buy cheap things now at our wonderful store',
          website: 'http://spam',
        },
      }),
      ctx({}),
    );
    expect(spam.status).toBe(400);
  });
});
