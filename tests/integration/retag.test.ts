import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalUrlHash } from '@/lib/ingest/canonical-url';
import { TAGGING_RULES_VERSION } from '@/lib/ingest/persist';
import { seedCountries, seedSectors } from '@/prisma/seed';
import { closeTestPrisma, testPrisma, truncateContent } from '../support/db';
import { testDatabaseUrl } from '../support/test-env';

/**
 * Re-tagging stored articles (FreAlgo 2.0, M2): articles stored under v1 rules are re-tagged with
 * roles by the migrate job; manual tags and fixtures are untouched; reruns change nothing.
 */
const prisma = testPrisma();
const ids: Record<string, string> = {};

const runCli = () =>
  execFileSync('node', ['--import', 'tsx', 'scripts/retag-articles.ts'], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), LOG_LEVEL: 'silent' },
  }).toString();

beforeAll(async () => {
  await seedCountries(prisma);
  await seedSectors(prisma);
  await truncateContent();
  const cid = async (iso2: string) =>
    (await prisma.country.findUniqueOrThrow({ where: { iso2 } })).id;
  const outlet = await prisma.mediaOutlet.create({
    data: {
      slug: 'retag-bbc-like',
      name: 'Retag World Service',
      homepageUrl: 'https://world.example/',
      countryId: await cid('GB'),
    },
  });
  const feed = await prisma.feedSource.create({
    data: { outletId: outlet.id, name: 'World', url: 'https://world.example/rss.xml' },
  });
  const at = new Date('2026-10-20T10:00:00Z');
  const mk = async (key: string, title: string, extra: object = {}) => {
    const url = `https://world.example/${key}`;
    const a = await prisma.article.create({
      data: {
        outletId: outlet.id,
        feedSourceId: feed.id,
        canonicalUrl: url,
        canonicalUrlHash: canonicalUrlHash(url),
        title,
        language: 'en',
        publishedAt: at,
        feedCategories: [],
        ...extra,
      },
    });
    ids[key] = a.id;
    return a;
  };
  // v1 state: only the publisher-country tag (v1 hid "US" because it was not an alias).
  const cross = await mk(
    'cross',
    'US citizen Stephen Hubbard freed by Russia as Trump envoy meets Putin',
  );
  await prisma.articleCountry.createMany({
    data: [
      { articleId: cross.id, countryId: await cid('GB'), basis: 'SOURCE_COUNTRY', publishedAt: at },
      // An editor's manual tag must survive re-tagging.
      { articleId: cross.id, countryId: await cid('FR'), basis: 'MANUAL', publishedAt: at },
    ],
  });
  const opinion = await mk('opinion', 'Opinion: the world needs calmer news', {
    canonicalUrl: 'https://world.example/opinion/calm',
    canonicalUrlHash: canonicalUrlHash('https://world.example/opinion/calm'),
  });
  ids.opinion = opinion.id;
  await mk('fixture', 'Fixture headline about Japan', { isFixture: true });
  await mk('current', 'Already tagged about Chile', { taggedRulesVersion: TAGGING_RULES_VERSION });
});

afterAll(async () => {
  await closeTestPrisma();
});

describe('retag-articles', () => {
  it('re-tags v1 articles with roles, keeps manual tags and skips fixtures and current rows', async () => {
    const out = runCli();
    expect(out).toMatch(/"articles":2/); // cross + opinion
    const cross = await prisma.articleCountry.findMany({
      where: { articleId: ids.cross },
      include: { country: true },
    });
    const byIso = Object.fromEntries(cross.map((c) => [c.country.iso2, [c.basis, c.role]]));
    expect(byIso).toEqual({
      US: ['TEXT_MATCH', 'SUBJECT'],
      RU: ['TEXT_MATCH', 'SUBJECT'],
      GB: ['SOURCE_COUNTRY', 'PUBLISHER_HOME'],
      FR: ['MANUAL', 'SUBJECT'],
    });
    const opinion = await prisma.article.findUniqueOrThrow({ where: { id: ids.opinion } });
    expect(opinion).toMatchObject({
      articleType: 'OPINION',
      taggedRulesVersion: TAGGING_RULES_VERSION,
    });
    const fixture = await prisma.article.findUniqueOrThrow({ where: { id: ids.fixture } });
    expect(fixture.taggedRulesVersion).toBeNull();
    expect(await prisma.articleCountry.count({ where: { articleId: ids.current } })).toBe(0);
  });

  it('is idempotent: a second run finds nothing to do', () => {
    expect(runCli()).toMatch(/nothing to do/);
  });
});
