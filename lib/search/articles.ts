import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { effectiveSort, resolveDateRange, type ArticleQuery, type Sort } from '@/lib/api/contracts';
import type { LabelStatus, Orientation } from '@/lib/domain/orientation';
import { decodeCursor, encodeCursor, type CursorPayload } from './cursor';

/**
 * Deterministic article listing and search.
 *
 * - Only explicit filters and an explicit, allow-listed sort are applied. There is no popularity,
 *   engagement or personal signal anywhere in this query.
 * - All values are bound parameters (Prisma.sql tagged templates); identifiers come from fixed
 *   code paths only, so user input never reaches SQL text.
 * - Keyset pagination on (sortKey…, publishedAt, id) gives stable, duplicate-free pages.
 * - Text relevance (sort=relevance) is Postgres ts_rank_cd over headline (A) and excerpt (B),
 *   plus trigram word-similarity on the headline. It measures textual match only.
 */

export const COUNT_CAP = 1000;

export interface ArticleListItem {
  id: string;
  title: string;
  excerpt: string | null;
  url: string;
  language: string | null;
  author: string | null;
  publishedAt: string;
  publishedAtRaw: string | null;
  publishedOffsetMinutes: number | null;
  publishedAtEstimated: boolean;
  firstSeenAt: string;
  isFixture: boolean;
  outlet: {
    id: string;
    slug: string;
    name: string;
    paywall: 'NONE' | 'METERED' | 'HARD' | 'UNKNOWN';
    country: { iso2: string; name: string } | null;
    label: {
      level: 'source';
      orientation: Orientation;
      status: LabelStatus;
      confidence: number | null;
      ideologyTags: string[];
      methodology: string | null;
      sourceUrl: string | null;
      reviewedAt: string | null;
      context: string | null;
      isMachine: boolean;
    };
  };
  /** Article-level label: null means "not classified" (never inferred from the outlet). */
  articleLabel: { level: 'article'; orientation: Orientation; note: string | null } | null;
  countries: { iso2: string; name: string; basis: string; matchedTerm: string | null }[];
  sectors: { slug: string; name: string; basis: string; ruleId: string | null }[];
  /** Present only for sort=relevance: textual match score (not a quality or political score). */
  relevance?: number;
}

export interface ArticleListResult {
  items: ArticleListItem[];
  page: {
    limit: number;
    sort: Sort;
    number: number;
    nextCursor: string | null;
    prevCursor: string | null;
    total: number;
    totalIsCapped: boolean;
  };
}

interface Row {
  id: string;
  pub: Date;
  oname: string;
  score: string;
  title: string;
  excerpt: string | null;
  canonicalUrl: string;
  language: string | null;
  author: string | null;
  publishedAtRaw: string | null;
  publishedOffsetMinutes: number | null;
  publishedAtEstimated: boolean;
  firstSeenAt: Date;
  isFixture: boolean;
  articleLabel: Orientation | null;
  articleLabelNote: string | null;
  outletId: string;
  outletSlug: string;
  outletName: string;
  paywall: ArticleListItem['outlet']['paywall'];
  orientation: Orientation;
  ideologyTags: string[];
  labelStatus: LabelStatus;
  labelConfidence: number | null;
  labelMethodology: string | null;
  labelSourceUrl: string | null;
  labelReviewedAt: Date | null;
  labelContext: string | null;
  labelIsMachine: boolean;
  outletCountryIso2: string | null;
  outletCountryName: string | null;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class UnknownCountryError extends Error {
  constructor(iso2: string) {
    super(`Unknown country ${iso2}`);
    this.name = 'UnknownCountryError';
  }
}

export async function listArticles(
  prisma: PrismaClient,
  query: ArticleQuery,
  opts: { includeFixtures: boolean; now?: Date },
): Promise<ArticleListResult> {
  const sort = effectiveSort(query);
  const cursor: CursorPayload | null = query.cursor ? decodeCursor(query.cursor, sort) : null;
  const limit = query.limit;

  let countryId: string | null = null;
  if (query.country) {
    const c = await prisma.country.findUnique({
      where: { iso2: query.country },
      select: { id: true },
    });
    if (!c) throw new UnknownCountryError(query.country);
    countryId = c.id;
  }

  // Drive country pages from the denormalized tag table so newest/oldest is an ordered index scan.
  const driveByCountry = countryId !== null && (sort === 'newest' || sort === 'oldest');
  const pubCol = driveByCountry ? Prisma.sql`ac."publishedAt"` : Prisma.sql`a."publishedAt"`;
  const idCol = driveByCountry ? Prisma.sql`ac."articleId"` : Prisma.sql`a.id`;
  const from = driveByCountry
    ? Prisma.sql`"ArticleCountry" ac JOIN "Article" a ON a.id = ac."articleId"`
    : Prisma.sql`"Article" a`;

  const where: Prisma.Sql[] = [Prisma.sql`a.status = 'PUBLISHED'`];
  if (!opts.includeFixtures) where.push(Prisma.sql`NOT a."isFixture"`);
  if (countryId) {
    where.push(
      driveByCountry
        ? Prisma.sql`ac."countryId" = ${countryId}`
        : Prisma.sql`EXISTS (SELECT 1 FROM "ArticleCountry" acx WHERE acx."articleId" = a.id AND acx."countryId" = ${countryId})`,
    );
  }
  // Region and sector filters are resolved to ids first (both tables are tiny). Filtering the tag
  // tables by id lets the planner use column statistics; a join on slug/region hides the value
  // and led to a 70x misestimate and a scan of every tag for that sector (docs/performance.md).
  const [regionCountryIds, sectorIds] = await Promise.all([
    query.region
      ? prisma.country
          .findMany({
            where: { OR: [{ region: query.region }, { subregion: query.region }] },
            select: { id: true },
          })
          .then((rows) => rows.map((r) => r.id))
      : null,
    query.sector?.length
      ? prisma.sector
          .findMany({ where: { slug: { in: query.sector } }, select: { id: true } })
          .then((rows) => rows.map((r) => r.id))
      : null,
  ]);
  if (regionCountryIds) {
    where.push(
      regionCountryIds.length
        ? Prisma.sql`EXISTS (SELECT 1 FROM "ArticleCountry" acr
            WHERE acr."articleId" = a.id AND acr."countryId" IN (${Prisma.join(regionCountryIds)}))`
        : Prisma.sql`FALSE`,
    );
  }
  if (sectorIds) {
    where.push(
      sectorIds.length
        ? Prisma.sql`EXISTS (SELECT 1 FROM "ArticleSector" s
            WHERE s."articleId" = a.id AND s."sectorId" IN (${Prisma.join(sectorIds)}))`
        : Prisma.sql`FALSE`,
    );
  }
  if (query.outlet?.length) where.push(Prisma.sql`o.slug IN (${Prisma.join(query.outlet)})`);
  if (query.orientation?.length)
    where.push(Prisma.sql`o.orientation::text IN (${Prisma.join(query.orientation)})`);
  if (query.language?.length) {
    where.push(
      Prisma.sql`split_part(lower(coalesce(a.language, '')), '-', 1) IN (${Prisma.join(query.language)})`,
    );
  }
  const range = resolveDateRange(query, opts.now);
  if (range.from) where.push(Prisma.sql`${pubCol} >= ${range.from}`);
  if (range.to) where.push(Prisma.sql`${pubCol} < ${range.to}`);

  let scoreExpr = Prisma.sql`0::numeric`;
  if (query.q) {
    const lang = query.language?.[0] ?? 'en';
    // Plan notes (docs/performance.md, measured at 200k articles):
    // - Outlet-name matches are resolved first (the outlet table is tiny), so every OR branch is on
    //   "Article" with known values: the planner can estimate each one and BitmapOr the GIN/btree
    //   indexes instead of scanning the table. The branch is dropped when no outlet matches.
    // - The WHERE keeps the tsquery inline so the planner can estimate it from statistics. In the
    //   score, a scalar subquery (InitPlan) builds it once, since websearch_to_tsquery is STABLE
    //   and a bare call is re-evaluated per row.
    // - ts_rank_cd searches for covers even in documents that do not match (~45 µs/row); guarded,
    //   non-matching rows score 0, which is also correct for negated terms ("storm -flood").
    const tsqInline = Prisma.sql`(websearch_to_tsquery('simple', ${query.q}) || websearch_to_tsquery(frealgo_ts_config(${lang}), ${query.q}))`;
    const tsqOnce = Prisma.sql`(SELECT ${tsqInline})`;
    const pattern = `%${escapeLike(query.q)}%`;
    const matchedOutlets = (
      await prisma.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "MediaOutlet" WHERE name ILIKE ${pattern}`
    ).map((r) => r.id);
    const byOutlet = matchedOutlets.length
      ? Prisma.sql`OR a."outletId" IN (${Prisma.join(matchedOutlets)})`
      : Prisma.empty;
    where.push(Prisma.sql`(a."searchVector" @@ ${tsqInline}
      OR a.title ILIKE ${pattern}
      ${byOutlet}
      OR ${query.q} <% a.title)`);
    scoreExpr = Prisma.sql`round((
      CASE WHEN a."searchVector" @@ ${tsqOnce} THEN ts_rank_cd(a."searchVector", ${tsqOnce}, 32) ELSE 0 END
      + 0.3 * word_similarity(${query.q}, a.title)
      + ${matchedOutlets.length ? Prisma.sql`CASE WHEN a."outletId" IN (${Prisma.join(matchedOutlets)}) THEN 0.05 ELSE 0 END` : Prisma.sql`0`}
    )::numeric, 6)`;
  }

  const inner = Prisma.sql`
    SELECT ${idCol} AS id, ${pubCol} AS pub, lower(o.name) AS oname, ${scoreExpr} AS score,
      a.title, a.excerpt, a."canonicalUrl", a.language, a.author, a."publishedAtRaw",
      a."publishedOffsetMinutes", a."publishedAtEstimated", a."firstSeenAt", a."isFixture",
      a."articleLabel", a."articleLabelNote",
      o.id AS "outletId", o.slug AS "outletSlug", o.name AS "outletName", o.paywall,
      o.orientation, o."ideologyTags", o."labelStatus", o."labelConfidence", o."labelMethodology",
      o."labelSourceUrl", o."labelReviewedAt", o."labelContext", o."labelIsMachine",
      oc.iso2 AS "outletCountryIso2", oc.name AS "outletCountryName"
    FROM ${from}
    JOIN "MediaOutlet" o ON o.id = a."outletId"
    LEFT JOIN "Country" oc ON oc.id = o."countryId"
    WHERE ${Prisma.join(where, ' AND ')}`;

  // Direction: "prev" pages are fetched in reverse order and flipped afterwards.
  const reverse = cursor?.d === 'prev';
  const desc = (forward: boolean) => (forward !== reverse ? Prisma.sql`DESC` : Prisma.sql`ASC`);
  let order: Prisma.Sql;
  let keyset: Prisma.Sql = Prisma.sql`TRUE`;

  // `after` = strictly after the boundary row in the requested direction.
  const k = cursor?.k ?? [];
  const tupleAfter = (descending: boolean, p: string, i: string) =>
    descending !== reverse
      ? Prisma.sql`(x.pub, x.id) < (${new Date(p)}::timestamp, ${i})`
      : Prisma.sql`(x.pub, x.id) > (${new Date(p)}::timestamp, ${i})`;

  switch (sort) {
    case 'newest':
      order = Prisma.sql`x.pub ${desc(true)}, x.id ${desc(true)}`;
      if (cursor) keyset = tupleAfter(true, k[0]!, k[1]!);
      break;
    case 'oldest':
      order = Prisma.sql`x.pub ${desc(false)}, x.id ${desc(false)}`;
      if (cursor) keyset = tupleAfter(false, k[0]!, k[1]!);
      break;
    case 'outlet':
      order = Prisma.sql`x.oname ${desc(false)}, x.pub ${desc(true)}, x.id ${desc(true)}`;
      if (cursor) {
        keyset = reverse
          ? Prisma.sql`(x.oname < ${k[0]!} OR (x.oname = ${k[0]!} AND ${tupleAfter(true, k[1]!, k[2]!)}))`
          : Prisma.sql`(x.oname > ${k[0]!} OR (x.oname = ${k[0]!} AND ${tupleAfter(true, k[1]!, k[2]!)}))`;
      }
      break;
    case 'relevance':
      order = Prisma.sql`x.score ${desc(true)}, x.pub ${desc(true)}, x.id ${desc(true)}`;
      if (cursor) {
        keyset = reverse
          ? Prisma.sql`(x.score > ${k[0]!}::numeric OR (x.score = ${k[0]!}::numeric AND ${tupleAfter(true, k[1]!, k[2]!)}))`
          : Prisma.sql`(x.score < ${k[0]!}::numeric OR (x.score = ${k[0]!}::numeric AND ${tupleAfter(true, k[1]!, k[2]!)}))`;
      }
      break;
  }

  const rowsSql = Prisma.sql`SELECT * FROM (${inner}) x WHERE ${keyset} ORDER BY ${order} LIMIT ${limit + 1}`;
  const countSql = Prisma.sql`SELECT count(*)::int AS n FROM (${inner} LIMIT ${COUNT_CAP + 1}) t`;
  let rows: Row[];
  let countRow: { n: number }[];
  if (query.q) {
    // Every text-match branch is index-backed, but the planner does not charge for the per-row
    // cost of trigram similarity and can choose a full scan for broad terms (country-scoped count:
    // 329 ms vs 21 ms at 200k articles, docs/performance.md). Steer only these two statements.
    [, rows, countRow] = await prisma.$transaction([
      prisma.$executeRaw`SET LOCAL enable_seqscan = off`,
      prisma.$queryRaw<Row[]>(rowsSql),
      prisma.$queryRaw<{ n: number }[]>(countSql),
    ]);
  } else {
    [rows, countRow] = await Promise.all([
      prisma.$queryRaw<Row[]>(rowsSql),
      prisma.$queryRaw<{ n: number }[]>(countSql),
    ]);
  }

  const hasExtra = rows.length > limit;
  let page = rows.slice(0, limit);
  if (reverse) page = page.reverse();

  const keyOf = (r: Row): string[] => {
    const ts = r.pub.toISOString();
    if (sort === 'outlet') return [r.oname, ts, r.id];
    if (sort === 'relevance') return [Number(r.score).toFixed(6), ts, r.id];
    return [ts, r.id];
  };
  const currentPage = cursor?.p ?? 1;
  // Forward: more rows exist after this page iff we over-fetched. Backward: we came from a later
  // page, so a next page always exists; an earlier page exists iff we over-fetched.
  const hasNext = reverse ? true : hasExtra;
  const hasPrev = reverse ? hasExtra : cursor !== null;
  const first = page[0];
  const last = page[page.length - 1];

  const items = await hydrate(prisma, page, sort === 'relevance');
  const total = Math.min(countRow[0]?.n ?? 0, COUNT_CAP);
  return {
    items,
    page: {
      limit,
      sort,
      number: currentPage,
      nextCursor:
        hasNext && last
          ? encodeCursor({ v: 1, s: sort, d: 'next', k: keyOf(last), p: currentPage + 1 })
          : null,
      prevCursor:
        hasPrev && first && currentPage > 1
          ? encodeCursor({ v: 1, s: sort, d: 'prev', k: keyOf(first), p: currentPage - 1 })
          : null,
      total,
      totalIsCapped: (countRow[0]?.n ?? 0) > COUNT_CAP,
    },
  };
}

async function hydrate(
  prisma: PrismaClient,
  rows: Row[],
  withScore: boolean,
): Promise<ArticleListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [countries, sectors] = await Promise.all([
    prisma.articleCountry.findMany({
      where: { articleId: { in: ids } },
      select: {
        articleId: true,
        basis: true,
        matchedTerm: true,
        country: { select: { iso2: true, name: true } },
      },
    }),
    prisma.articleSector.findMany({
      where: { articleId: { in: ids } },
      select: {
        articleId: true,
        basis: true,
        ruleId: true,
        sector: { select: { slug: true, name: true, sortOrder: true } },
      },
    }),
  ]);
  const basisOrder = ['SOURCE_COUNTRY', 'FEED_DEFAULT', 'TEXT_MATCH', 'MANUAL'];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    url: r.canonicalUrl,
    language: r.language,
    author: r.author,
    publishedAt: r.pub.toISOString(),
    publishedAtRaw: r.publishedAtRaw,
    publishedOffsetMinutes: r.publishedOffsetMinutes,
    publishedAtEstimated: r.publishedAtEstimated,
    firstSeenAt: r.firstSeenAt.toISOString(),
    isFixture: r.isFixture,
    outlet: {
      id: r.outletId,
      slug: r.outletSlug,
      name: r.outletName,
      paywall: r.paywall,
      country: r.outletCountryIso2
        ? { iso2: r.outletCountryIso2, name: r.outletCountryName ?? r.outletCountryIso2 }
        : null,
      label: {
        level: 'source',
        orientation: r.orientation,
        status: r.labelStatus,
        confidence: r.labelConfidence,
        ideologyTags: r.ideologyTags,
        methodology: r.labelMethodology,
        sourceUrl: r.labelSourceUrl,
        reviewedAt: r.labelReviewedAt?.toISOString() ?? null,
        context: r.labelContext,
        isMachine: r.labelIsMachine,
      },
    },
    articleLabel: r.articleLabel
      ? { level: 'article', orientation: r.articleLabel, note: r.articleLabelNote }
      : null,
    countries: countries
      .filter((c) => c.articleId === r.id)
      .sort(
        (a, b) =>
          basisOrder.indexOf(a.basis) - basisOrder.indexOf(b.basis) ||
          a.country.name.localeCompare(b.country.name),
      )
      .map((c) => ({
        iso2: c.country.iso2,
        name: c.country.name,
        basis: c.basis,
        matchedTerm: c.matchedTerm,
      })),
    sectors: sectors
      .filter((s) => s.articleId === r.id)
      .sort((a, b) => a.sector.sortOrder - b.sector.sortOrder)
      .map((s) => ({ slug: s.sector.slug, name: s.sector.name, basis: s.basis, ruleId: s.ruleId })),
    ...(withScore ? { relevance: Number(r.score) } : {}),
  }));
}
