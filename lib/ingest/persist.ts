import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { ARTICLE_TYPE_RULES_VERSION, classifyArticleType } from './tagging/article-type';
import { COUNTRY_RULES_VERSION, tagCountries } from './tagging/countries';
import { SECTOR_RULES_VERSION, tagSectors } from './tagging/sectors';
import type { NormalizedItem } from './normalize';

/**
 * Combined tagging rules version stored on each article. Bumping any rule set changes it, and
 * scripts/retag-articles.ts (run by the migrate job) re-tags stored articles below it.
 */
export const TAGGING_RULES_VERSION =
  COUNTRY_RULES_VERSION * 10_000 + SECTOR_RULES_VERSION * 100 + ARTICLE_TYPE_RULES_VERSION;

/** Publisher categories kept for provenance and re-tagging (bounded). */
export function boundedCategories(categories: string[]): string[] {
  return [...new Set(categories.map((c) => c.trim().slice(0, 80)).filter(Boolean))].slice(0, 10);
}

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

type TagInput = Pick<
  NormalizedItem,
  'title' | 'excerpt' | 'language' | 'categories' | 'canonicalUrl'
>;
type TagContext = Pick<
  PersistContext,
  | 'sourceCountryIso2'
  | 'feedDefaultIso2'
  | 'feedDefaultSectors'
  | 'countryIdByIso2'
  | 'sectorIdBySlug'
>;

function computeTags(ctx: TagContext, item: TagInput) {
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
  const articleType = classifyArticleType({
    url: item.canonicalUrl,
    categories: item.categories,
    title: item.title,
  });
  return { countries, sectors, articleType };
}

type Tx = Prisma.TransactionClient;

async function writeTags(
  tx: Tx,
  articleId: string,
  publishedAt: Date,
  ctx: TagContext,
  item: TagInput,
) {
  const { countries, sectors, articleType } = computeTags(ctx, item);

  // Replace rule-derived tags (so a changed basis/role/rule id is applied); MANUAL tags are kept and
  // win on conflict because the createMany below skips existing (articleId, countryId) pairs.
  await tx.articleCountry.deleteMany({
    where: { articleId, basis: { in: [...RULE_COUNTRY_BASES] } },
  });
  await tx.articleSector.deleteMany({
    where: { articleId, basis: { in: [...RULE_SECTOR_BASES] } },
  });
  if (countries.length) {
    await tx.articleCountry.createMany({
      data: countries.map((c) => ({
        articleId,
        countryId: ctx.countryIdByIso2.get(c.iso2)!,
        basis: c.basis,
        role: c.role,
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
  await tx.article.update({
    where: { id: articleId },
    data: {
      articleType: articleType.type,
      articleTypeBasis: articleType.basis,
      taggedRulesVersion: TAGGING_RULES_VERSION,
    },
  });
}

/**
 * Re-tag a stored article with the current rules (used by scripts/retag-articles.ts). Uses the
 * stored headline, excerpt, language, URL and publisher categories; never touches MANUAL tags.
 */
export async function retagStoredArticle(
  prisma: PrismaClient,
  ctx: TagContext,
  article: {
    id: string;
    publishedAt: Date;
    title: string;
    excerpt: string | null;
    language: string | null;
    canonicalUrl: string;
    feedCategories: string[];
  },
): Promise<void> {
  await prisma.$transaction((tx) =>
    writeTags(tx, article.id, article.publishedAt, ctx, {
      title: article.title,
      excerpt: article.excerpt,
      language: article.language,
      canonicalUrl: article.canonicalUrl,
      categories: article.feedCategories,
    }),
  );
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
          feedCategories: boundedCategories(item.categories),
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
        feedCategories: boundedCategories(item.categories),
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
