/**
 * Idempotent seed: safe to run any number of times (upserts keyed on natural keys).
 *  1. Countries (ISO 3166-1, generated reference data)  — always
 *  2. Sectors                                            — always
 *  3. Fixture outlets/feeds/articles (isFixture = true)  — only when SEED_FIXTURES=true
 *
 *  4. Real publisher registry (prisma/data/sources.ts)  — always, as PAUSED + UNRATED
 *
 * Re-seeding never changes a real feed's status, terms review or an outlet's label: those are
 * operator decisions recorded through the admin tools with an audit trail.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../lib/db/client';
import { SECTORS } from '../lib/domain/sectors';
import { validateSourceLabel } from '../lib/domain/orientation';
import { canonicalizeUrl, canonicalUrlHash, sha256Hex } from '../lib/ingest/canonical-url';
import {
  FIXTURE_LABEL_METHODOLOGY,
  FIXTURE_LABEL_SOURCE,
  FIXTURE_OUTLETS,
  buildFixtureArticles,
} from './data/fixtures';
import { REAL_SOURCES } from './data/sources';
import type { PrismaClient } from '../generated/prisma/client';

interface CountryRow {
  iso2: string;
  iso3: string;
  isoNumeric: string | null;
  name: string;
  region: string | null;
  subregion: string | null;
  officialLanguages: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));

export async function seedCountries(prisma: PrismaClient): Promise<number> {
  const { countries } = JSON.parse(
    readFileSync(path.join(here, 'data/countries.json'), 'utf8'),
  ) as { countries: CountryRow[] };
  // Batched in one transaction: 250 small upserts.
  await prisma.$transaction(
    countries.map((c) =>
      prisma.country.upsert({
        where: { iso2: c.iso2 },
        create: c,
        update: {
          iso3: c.iso3,
          isoNumeric: c.isoNumeric,
          name: c.name,
          region: c.region,
          subregion: c.subregion,
          officialLanguages: c.officialLanguages,
        },
      }),
    ),
  );
  return countries.length;
}

export async function seedSectors(prisma: PrismaClient): Promise<number> {
  await prisma.$transaction(
    SECTORS.map((s, i) =>
      prisma.sector.upsert({
        where: { slug: s.slug },
        create: { slug: s.slug, name: s.name, description: s.description, sortOrder: i },
        update: { name: s.name, description: s.description, sortOrder: i },
      }),
    ),
  );
  return SECTORS.length;
}

export async function seedFixtures(prisma: PrismaClient, now = new Date()): Promise<number> {
  const countries = new Map(
    (await prisma.country.findMany({ select: { id: true, iso2: true } })).map((c) => [
      c.iso2,
      c.id,
    ]),
  );
  const sectors = new Map(
    (await prisma.sector.findMany({ select: { id: true, slug: true } })).map((s) => [s.slug, s.id]),
  );
  const outletIds = new Map<string, string>();
  const feedIds = new Map<string, string>();

  for (const o of FIXTURE_OUTLETS) {
    const label = {
      orientation: o.orientation,
      status: o.labelStatus,
      confidence: o.labelConfidence,
      ideologyTags: o.ideologyTags,
      methodology: o.labelStatus === 'UNRATED' ? null : FIXTURE_LABEL_METHODOLOGY,
      sourceUrl: o.labelStatus === 'UNRATED' ? null : FIXTURE_LABEL_SOURCE,
      reviewedAt: o.labelStatus === 'REVIEWED' ? new Date('2026-09-01T00:00:00Z') : null,
      context: o.labelContext,
      isMachine: o.labelIsMachine ?? false,
    };
    const issues = validateSourceLabel(label);
    if (issues.length) throw new Error(`Fixture label for ${o.slug} invalid: ${issues.join(', ')}`);

    const data = {
      name: o.name,
      homepageUrl: `https://${o.slug}.example/`,
      countryId: countries.get(o.countryIso2) ?? null,
      primaryLanguage: o.language,
      ownershipType: o.ownershipType,
      ownershipNotes: 'Fictional fixture outlet.',
      paywall: o.paywall,
      orientation: label.orientation,
      ideologyTags: label.ideologyTags,
      labelStatus: label.status,
      labelConfidence: label.confidence,
      labelMethodology: label.methodology,
      labelSourceUrl: label.sourceUrl,
      labelReviewedAt: label.reviewedAt,
      labelContext: label.context,
      labelIsMachine: label.isMachine,
      isFixture: true,
    };
    const outlet = await prisma.mediaOutlet.upsert({
      where: { slug: o.slug },
      create: { slug: o.slug, ...data },
      update: data,
    });
    outletIds.set(o.slug, outlet.id);

    // Provenance trail: one initial history entry per fixture outlet.
    const hasHistory = await prisma.outletLabelHistory.count({ where: { outletId: outlet.id } });
    if (!hasHistory) {
      await prisma.outletLabelHistory.create({
        data: {
          outletId: outlet.id,
          orientation: label.orientation,
          ideologyTags: label.ideologyTags,
          labelStatus: label.status,
          labelConfidence: label.confidence,
          labelMethodology: label.methodology,
          labelSourceUrl: label.sourceUrl,
          labelReviewedAt: label.reviewedAt,
          labelContext: label.context,
          labelIsMachine: label.isMachine,
          changedBy: 'seed',
          changeReason: 'Initial fixture label',
        },
      });
    }

    const feedUrl = `https://${o.slug}.example/feed.xml`;
    const feed = await prisma.feedSource.upsert({
      where: { url: feedUrl },
      // Fixture feeds point at unreachable .example hosts, so they stay PAUSED and are honestly
      // reported as "never synced" on the status page.
      create: {
        outletId: outlet.id,
        name: `${o.name} feed`,
        url: feedUrl,
        kind: 'RSS',
        status: 'PAUSED',
        language: o.language,
        excerptAllowed: o.excerptAllowed,
        licenseNotes: 'Fixture feed (not fetched).',
        isFixture: true,
      },
      update: { outletId: outlet.id, excerptAllowed: o.excerptAllowed, isFixture: true },
    });
    feedIds.set(o.slug, feed.id);
  }

  const articles = buildFixtureArticles();
  for (const a of articles) {
    const outletId = outletIds.get(a.outletSlug)!;
    const canonicalUrl = canonicalizeUrl(a.url);
    const hash = canonicalUrlHash(canonicalUrl);
    const publishedAt = new Date(now.getTime() - a.hoursAgo * 3_600_000);
    const contentHash = sha256Hex(`${a.title}\n${a.excerpt ?? ''}`);
    const existing = await prisma.article.findUnique({
      where: { canonicalUrlHash: hash },
      select: { id: true, publishedAt: true },
    });
    if (existing) {
      // Re-seed keeps the original timestamps so cursors and tests stay stable.
      await prisma.article.update({
        where: { id: existing.id },
        data: { title: a.title, excerpt: a.excerpt, language: a.language, contentHash },
      });
      continue;
    }
    await prisma.article.create({
      data: {
        outletId,
        feedSourceId: feedIds.get(a.outletSlug) ?? null,
        externalId: a.externalId,
        canonicalUrl,
        canonicalUrlHash: hash,
        title: a.title,
        excerpt: a.excerpt,
        language: a.language,
        publishedAt,
        publishedAtRaw: publishedAt.toISOString(),
        publishedOffsetMinutes: 0,
        contentHash,
        isFixture: true,
        countries: {
          create: a.countries
            .filter((c) => countries.has(c.iso2))
            .map((c) => ({
              countryId: countries.get(c.iso2)!,
              basis: c.basis,
              matchedTerm: c.term ?? null,
              publishedAt,
            })),
        },
        sectors: {
          create: a.sectors.map((slug) => ({
            sectorId: sectors.get(slug)!,
            basis: 'MANUAL' as const,
            ruleId: 'fixture',
            publishedAt,
          })),
        },
      },
    });
  }
  return articles.length;
}

export async function seedRealSources(prisma: PrismaClient): Promise<number> {
  const countries = new Map(
    (await prisma.country.findMany({ select: { id: true, iso2: true } })).map((c) => [
      c.iso2,
      c.id,
    ]),
  );
  let feeds = 0;
  for (const o of REAL_SOURCES) {
    const descriptive = {
      name: o.name,
      homepageUrl: o.homepageUrl,
      countryId: countries.get(o.countryIso2) ?? null,
      primaryLanguage: o.language,
      ownershipType: o.ownershipType,
      ownershipNotes: o.ownershipNotes,
      paywall: o.paywall,
    };
    const existing = await prisma.mediaOutlet.findUnique({ where: { slug: o.slug } });
    const outlet = existing
      ? await prisma.mediaOutlet.update({ where: { id: existing.id }, data: descriptive })
      : await prisma.mediaOutlet.create({
          data: {
            slug: o.slug,
            ...descriptive,
            orientation: 'UNRATED',
            labelStatus: 'UNRATED',
            isFixture: false,
            labelHistory: {
              create: {
                orientation: 'UNRATED',
                labelStatus: 'UNRATED',
                changedBy: 'seed',
                changeReason: 'Registry entry created; not yet reviewed',
              },
            },
          },
        });
    for (const f of o.feeds) {
      await prisma.feedSource.upsert({
        where: { url: f.url },
        create: {
          outletId: outlet.id,
          name: f.name,
          url: f.url,
          kind: 'RSS',
          status: 'PAUSED',
          language: f.language ?? o.language,
          defaultCountryIso2: f.defaultCountryIso2 ?? [],
          defaultSectorSlugs: f.defaultSectorSlugs ?? [],
          licenseNotes: 'Publisher RSS feed. Terms not yet reviewed by an operator.',
          isFixture: false,
        },
        update: {
          outletId: outlet.id,
          name: f.name,
          language: f.language ?? o.language,
          defaultCountryIso2: f.defaultCountryIso2 ?? [],
          defaultSectorSlugs: f.defaultSectorSlugs ?? [],
        },
      });
      feeds += 1;
    }
  }
  return feeds;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = createPrismaClient(url, 2);
  try {
    const started = Date.now();
    const countries = await seedCountries(prisma);
    const sectors = await seedSectors(prisma);
    const seedFixturesFlag = !['0', 'false', 'no', 'off'].includes(
      String(process.env.SEED_FIXTURES ?? 'true').toLowerCase(),
    );
    const fixtures = seedFixturesFlag ? await seedFixtures(prisma) : 0;
    const realFeeds = await seedRealSources(prisma);
    console.log(
      JSON.stringify({
        msg: 'seed complete',
        countries,
        sectors,
        fixtureArticles: fixtures,
        fixturesSeeded: seedFixturesFlag,
        realFeedsRegistered: realFeeds,
        ms: Date.now() - started,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
