import { z } from 'zod';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { getArticleItems, type ArticleListItem } from '@/lib/search/articles';

/**
 * Read side of event clusters (FreAlgo 2.0, M4). Counts are computed from the reports that are
 * still published, so a withdrawn report disappears from its event everywhere at once. Ordering
 * is by the time of the latest report (newest first), never by size or attention.
 */

export interface EventSummary {
  id: string;
  slug: string;
  /** One member's headline, verbatim; `titleOutlet` says whose. */
  title: string;
  titleOutlet: string | null;
  language: string;
  startAt: string;
  lastAt: string;
  reports: number;
  outlets: number;
  outletNames: string[];
  sharedTerms: string[];
  /** Countries named in the reports' text, with how many reports name each. */
  countries: { iso2: string; name: string; reports: number }[];
  methodVersion: number;
  isFixture: boolean;
}

export interface EventPage {
  items: EventSummary[];
  nextCursor: string | null;
}

const cursorSchema = z.tuple([z.iso.datetime(), z.string().min(1).max(40)]);

export function encodeEventCursor(lastAt: string, id: string): string {
  return Buffer.from(JSON.stringify([lastAt, id])).toString('base64url');
}

export function decodeEventCursor(cursor: string): [string, string] | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

interface SummaryRow {
  id: string;
  slug: string;
  title: string;
  titleArticleId: string | null;
  language: string;
  startAt: Date;
  lastAt: Date;
  sharedTerms: string[];
  methodVersion: number;
  isFixture: boolean;
  reports: number;
  outlets: number;
}

const SUMMARY_SELECT = Prisma.sql`
  e.id, e.slug, e.title, e."titleArticleId", e.language, e."startAt", e."lastAt",
  e."sharedTerms", e."methodVersion", e."isFixture",
  count(*)::int AS reports, count(DISTINCT a."outletId")::int AS outlets`;

async function decorate(prisma: PrismaClient, rows: SummaryRow[]): Promise<EventSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [countries, outlets] = await Promise.all([
    prisma.$queryRaw<{ eventId: string; iso2: string; name: string; n: number }[]>`
      SELECT ea."eventId", c.iso2, c.name, count(*)::int AS n
      FROM "EventArticle" ea
      JOIN "Article" a ON a.id = ea."articleId" AND a.status = 'PUBLISHED'
      JOIN "ArticleCountry" ac ON ac."articleId" = a.id AND ac.role = 'SUBJECT'::"CountryRole"
      JOIN "Country" c ON c.id = ac."countryId"
      WHERE ea."eventId" IN (${Prisma.join(ids)})
      GROUP BY 1, 2, 3
      ORDER BY 1, 4 DESC, 2`,
    prisma.$queryRaw<{ eventId: string; name: string; articleId: string }[]>`
      SELECT ea."eventId", o.name, a.id AS "articleId"
      FROM "EventArticle" ea
      JOIN "Article" a ON a.id = ea."articleId" AND a.status = 'PUBLISHED'
      JOIN "MediaOutlet" o ON o.id = a."outletId"
      WHERE ea."eventId" IN (${Prisma.join(ids)})
      ORDER BY 1, o.name`,
  ]);
  return rows.map((r) => {
    const own = outlets.filter((o) => o.eventId === r.id);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      titleOutlet: own.find((o) => o.articleId === r.titleArticleId)?.name ?? null,
      language: r.language,
      startAt: r.startAt.toISOString(),
      lastAt: r.lastAt.toISOString(),
      reports: r.reports,
      outlets: r.outlets,
      outletNames: [...new Set(own.map((o) => o.name))],
      sharedTerms: r.sharedTerms,
      countries: countries
        .filter((c) => c.eventId === r.id)
        .map((c) => ({ iso2: c.iso2, name: c.name, reports: c.n })),
      methodVersion: r.methodVersion,
      isFixture: r.isFixture,
    };
  });
}

export async function listEvents(
  prisma: PrismaClient,
  opts: {
    includeFixtures: boolean;
    limit?: number;
    cursor?: string | null;
    /** Perspectives lists only events reported by at least two outlets. */
    minOutlets?: number;
    country?: string | null;
    /** Only events whose latest report is at or after this time. */
    since?: Date;
  },
): Promise<EventPage> {
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 50);
  const where: Prisma.Sql[] = [Prisma.sql`(${opts.includeFixtures} OR NOT e."isFixture")`];
  const after = opts.cursor ? decodeEventCursor(opts.cursor) : null;
  if (after)
    where.push(Prisma.sql`(e."lastAt", e.id) < (${new Date(after[0])}::timestamp, ${after[1]})`);
  if (opts.since) where.push(Prisma.sql`e."lastAt" >= ${opts.since}::timestamp`);
  if (opts.country)
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "EventArticle" x
      JOIN "ArticleCountry" xc ON xc."articleId" = x."articleId" AND xc.role = 'SUBJECT'::"CountryRole"
      JOIN "Country" c ON c.id = xc."countryId"
      WHERE x."eventId" = e.id AND c.iso2 = ${opts.country})`);
  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT ${SUMMARY_SELECT}
    FROM "NewsEvent" e
    JOIN "EventArticle" ea ON ea."eventId" = e.id
    JOIN "Article" a ON a.id = ea."articleId" AND a.status = 'PUBLISHED'
    WHERE ${Prisma.join(where, ' AND ')}
    GROUP BY e.id
    HAVING count(*) >= 2 AND count(DISTINCT a."outletId") >= ${opts.minOutlets ?? 1}
    ORDER BY e."lastAt" DESC, e.id DESC
    LIMIT ${limit + 1}`;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: await decorate(prisma, page),
    nextCursor:
      rows.length > limit && last ? encodeEventCursor(last.lastAt.toISOString(), last.id) : null,
  };
}

export interface EventMember extends ArticleListItem {
  membership: {
    score: number;
    sharedTerms: string[];
    matchedArticleId: string | null;
    joinedAt: string;
  };
}

export interface CuratedEntry {
  id: string;
  occurredAt: string;
  datePrecision: 'DAY' | 'MONTH' | 'YEAR';
  kind: 'FACT' | 'INTERPRETATION' | 'ANALOGY';
  text: string;
  sourceUrl: string;
  sourceName: string;
  curatedBy: string;
  curatedAt: string;
  isFixture: boolean;
}

export interface EventDetail {
  event: EventSummary;
  /** Every report in the event, oldest first, with the evidence that grouped it. */
  members: EventMember[];
  /** Curated, sourced entries dated up to now. */
  timeline: CuratedEntry[];
  /** Curated entries dated after now ("next known dates"). */
  upcoming: CuratedEntry[];
}

/** Accepts the event's slug (pages) or id (API). */
export async function getEvent(
  prisma: PrismaClient,
  slugOrId: string,
  opts: { includeFixtures: boolean; now?: Date },
): Promise<EventDetail | null> {
  if (slugOrId.length > 120) return null;
  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT ${SUMMARY_SELECT}
    FROM "NewsEvent" e
    JOIN "EventArticle" ea ON ea."eventId" = e.id
    JOIN "Article" a ON a.id = ea."articleId" AND a.status = 'PUBLISHED'
    WHERE (e.slug = ${slugOrId} OR e.id = ${slugOrId})
      AND (${opts.includeFixtures} OR NOT e."isFixture")
    GROUP BY e.id
    HAVING count(*) >= 2`;
  const [event] = await decorate(prisma, rows);
  if (!event) return null;
  const links = await prisma.eventArticle.findMany({
    where: { eventId: event.id },
    select: {
      articleId: true,
      score: true,
      sharedTerms: true,
      matchedArticleId: true,
      joinedAt: true,
      article: { select: { publishedAt: true } },
    },
    orderBy: [{ article: { publishedAt: 'asc' } }, { articleId: 'asc' }],
  });
  const items = await getArticleItems(
    prisma,
    links.map((l) => l.articleId),
    opts,
  );
  const byId = new Map(links.map((l) => [l.articleId, l]));
  const members = items.map((it) => {
    const l = byId.get(it.id)!;
    return {
      ...it,
      membership: {
        score: l.score,
        sharedTerms: l.sharedTerms,
        matchedArticleId: l.matchedArticleId,
        joinedAt: l.joinedAt.toISOString(),
      },
    };
  });
  const entries = await prisma.timelineEntry.findMany({
    where: { eventId: event.id, ...(opts.includeFixtures ? {} : { isFixture: false }) },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
  const now = (opts.now ?? new Date()).getTime();
  const curated = entries.map((t) => ({
    id: t.id,
    occurredAt: t.occurredAt.toISOString(),
    datePrecision: t.datePrecision as CuratedEntry['datePrecision'],
    kind: t.kind,
    text: t.text,
    sourceUrl: t.sourceUrl,
    sourceName: t.sourceName,
    curatedBy: t.curatedBy,
    curatedAt: t.curatedAt.toISOString(),
    isFixture: t.isFixture,
  }));
  return {
    event,
    members,
    timeline: curated.filter((t) => Date.parse(t.occurredAt) <= now),
    upcoming: curated.filter((t) => Date.parse(t.occurredAt) > now),
  };
}

export interface CorpusOutlet {
  id: string;
  name: string;
  country: { iso2: string; name: string } | null;
  orientation: string;
  labelStatus: string;
  languages: string[];
}

/** Outlets with at least one published report in the last `days` days (the comparison corpus). */
export async function corpusOutlets(
  prisma: PrismaClient,
  opts: { includeFixtures: boolean; days?: number; now?: Date },
): Promise<CorpusOutlet[]> {
  const since = new Date((opts.now ?? new Date()).getTime() - (opts.days ?? 7) * 86_400_000);
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      iso2: string | null;
      cname: string | null;
      orientation: string;
      labelStatus: string;
      languages: string[];
    }[]
  >`
    SELECT o.id, o.name, c.iso2, c.name AS cname, o.orientation::text AS orientation,
      o."labelStatus"::text AS "labelStatus",
      array_agg(DISTINCT split_part(lower(coalesce(a.language, 'und')), '-', 1)) AS languages
    FROM "MediaOutlet" o
    JOIN "Article" a ON a."outletId" = o.id AND a.status = 'PUBLISHED' AND a."publishedAt" >= ${since}::timestamp
    LEFT JOIN "Country" c ON c.id = o."countryId"
    WHERE (${opts.includeFixtures} OR NOT a."isFixture")
    GROUP BY o.id, c.iso2, c.name
    ORDER BY o.name`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.iso2 ? { iso2: r.iso2, name: r.cname! } : null,
    orientation: r.orientation,
    labelStatus: r.labelStatus,
    languages: r.languages.sort(),
  }));
}
