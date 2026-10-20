import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { COUNTRY_RULES_VERSION, tagCountries } from './tagging/countries';
import { SECTOR_RULES_VERSION, tagSectors } from './tagging/sectors';
import type { NormalizedItem } from './normalize';

/**
 * Transaction-safe, idempotent article upsert.
 * Dedupe order: (outletId, externalId) when the feed provides a guid, then canonicalUrlHash.
 * The same story syndicated by another outlet with the same canonical URL is not duplicated.
 * Takedowns stick: a REMOVED article is never resurrected by a later fetch.
 */

export interface PersistContext {
  outletId: string;
  feedSourceId: string;
  isFixture: boolean;
  sourceCountryIso2: string | null;
  feedDefaultIso2: string[];
  feedDefaultSectors: string[];
  countryIdByIso2: ReadonlyMap<string, string>;
  sectorIdBySlug: ReadonlyMap<string, string>;
}

export type PersistOutcome = 'inserted' | 'updated' | 'unchanged';

const RULE_COUNTRY_BASES = ['SOURCE_COUNTRY', 'FEED_DEFAULT', 'TEXT_MATCH'] as const;
const RULE_SECTOR_BASES = ['FEED_DEFAULT', 'FEED_CATEGORY', 'KEYWORD_RULE'] as const;

function computeTags(ctx: PersistContext, item: NormalizedItem) {
  const countries = tagCountries({
    title: item.title,
    excerpt: item.excerpt,
    language: item.language,
    sourceCountryIso2: ctx.sourceCountryIso2,
    feedDefaultIso2: ctx.feedDefaultIso2,
  }).filter((t) => ctx.countryIdByIso2.has(t.iso2));
  const sectors = tagSectors({
    title: item.title,
    excerpt: item.excerpt,
    language: item.language,
    categories: item.categories,
    feedDefaultSlugs: ctx.feedDefaultSectors,
    validSlugs: new Set(ctx.sectorIdBySlug.keys()),
  });
  return { countries, sectors };
}

type Tx = Prisma.TransactionClient;

async function writeTags(
  tx: Tx,
  articleId: string,
  publishedAt: Date,
  ctx: PersistContext,
  item: NormalizedItem,
) {
  const { countries, sectors } = computeTags(ctx, item);
  const countryIds = countries.map((c) => ctx.countryIdByIso2.get(c.iso2)!);
  const sectorIds = sectors.map((s) => ctx.sectorIdBySlug.get(s.slug)!);

  // Remove rule-derived tags that no longer apply; MANUAL tags are never touched.
  await tx.articleCountry.deleteMany({
    where: { articleId, basis: { in: [...RULE_COUNTRY_BASES] }, countryId: { notIn: countryIds } },
  });
  await tx.articleSector.deleteMany({
    where: { articleId, basis: { in: [...RULE_SECTOR_BASES] }, sectorId: { notIn: sectorIds } },
  });
  if (countries.length) {
    await tx.articleCountry.createMany({
      data: countries.map((c) => ({
        articleId,
        countryId: ctx.countryIdByIso2.get(c.iso2)!,
        basis: c.basis,
        matchedTerm: c.matchedTerm ? `${c.matchedTerm} (rules v${COUNTRY_RULES_VERSION})` : null,
        publishedAt,
      })),
      skipDuplicates: true,
    });
  }
  if (sectors.length) {
    await tx.articleSector.createMany({
      data: sectors.map((s) => ({
        articleId,
        sectorId: ctx.sectorIdBySlug.get(s.slug)!,
        basis: s.basis,
        ruleId: s.ruleId,
        rulesVersion: SECTOR_RULES_VERSION,
        publishedAt,
      })),
      skipDuplicates: true,
    });
  }
}

async function findExisting(tx: Tx, ctx: PersistContext, item: NormalizedItem) {
  const select = {
    id: true,
    externalId: true,
    contentHash: true,
    status: true,
    publishedAt: true,
    publishedAtEstimated: true,
  } as const;
  if (item.externalId) {
    const byGuid = await tx.article.findUnique({
      where: { outletId_externalId: { outletId: ctx.outletId, externalId: item.externalId } },
      select,
    });
    if (byGuid) return byGuid;
  }
  return tx.article.findUnique({ where: { canonicalUrlHash: item.canonicalUrlHash }, select });
}

async function persistOnce(
  prisma: PrismaClient,
  ctx: PersistContext,
  item: NormalizedItem,
): Promise<PersistOutcome> {
  return prisma.$transaction(async (tx) => {
    const existing = await findExisting(tx, ctx, item);
    if (!existing) {
      const created = await tx.article.create({
        data: {
          outletId: ctx.outletId,
          feedSourceId: ctx.feedSourceId,
          externalId: item.externalId,
          canonicalUrl: item.canonicalUrl,
          canonicalUrlHash: item.canonicalUrlHash,
          title: item.title,
          excerpt: item.excerpt,
          language: item.language,
          author: item.author,
          imageUrl: item.imageUrl,
          publishedAt: item.publishedAt,
          publishedAtRaw: item.publishedAtRaw,
          publishedOffsetMinutes: item.publishedOffsetMinutes,
          publishedAtEstimated: item.publishedAtEstimated,
          contentHash: item.contentHash,
          status: item.status,
          statusReason: item.statusReason,
          isFixture: ctx.isFixture,
        },
        select: { id: true, publishedAt: true },
      });
      await writeTags(tx, created.id, created.publishedAt, ctx, item);
      return 'inserted';
    }

    // Keep the first real timestamp (stable ordering); upgrade an estimated one to a real one.
    const upgradeDate = existing.publishedAtEstimated && !item.publishedAtEstimated;
    const publishedAt = upgradeDate ? item.publishedAt : existing.publishedAt;
    const changed = existing.contentHash !== item.contentHash || upgradeDate;
    if (!changed) return 'unchanged';

    await tx.article.update({
      where: { id: existing.id },
      data: {
        title: item.title,
        excerpt: item.excerpt,
        language: item.language,
        author: item.author,
        imageUrl: item.imageUrl,
        contentHash: item.contentHash,
        ...(existing.externalId ? {} : item.externalId ? { externalId: item.externalId } : {}),
        ...(upgradeDate
          ? {
              publishedAt,
              publishedAtRaw: item.publishedAtRaw,
              publishedOffsetMinutes: item.publishedOffsetMinutes,
              publishedAtEstimated: false,
            }
          : {}),
      },
    });
    if (upgradeDate) {
      await tx.articleCountry.updateMany({
        where: { articleId: existing.id },
        data: { publishedAt },
      });
      await tx.articleSector.updateMany({
        where: { articleId: existing.id },
        data: { publishedAt },
      });
    }
    if (existing.status !== 'REMOVED') await writeTags(tx, existing.id, publishedAt, ctx, item);
    return 'updated';
  });
}

export async function persistItem(
  prisma: PrismaClient,
  ctx: PersistContext,
  item: NormalizedItem,
): Promise<PersistOutcome> {
  try {
    return await persistOnce(prisma, ctx, item);
  } catch (err) {
    // A concurrent writer inserted the same article between our read and insert: retry once,
    // which now takes the update path.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return persistOnce(prisma, ctx, item);
    }
    throw err;
  }
}
