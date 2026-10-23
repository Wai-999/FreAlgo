import { createHash } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  CLUSTER_METHOD_VERSION,
  WINDOW_HOURS,
  baseLang,
  clusterDecisions,
  names,
  idfFrom,
  isDistinctive,
  representative,
  sharedWording,
  terms,
  type ClusterDecision,
  type ClusterInput,
  type ExistingEvent,
  type Idf,
} from './cluster';

/**
 * Event clustering job (worker "cluster-events", scripts/cluster-events.ts).
 *
 * Reads the published reports of the last CORPUS_DAYS, groups them by (fixture or real, base
 * language), computes word rarity per group, and lets lib/events/cluster.ts decide joins. Writes
 * only NewsEvent and EventArticle rows; articles are never changed. One run at a time (Postgres
 * advisory lock), so worker replicas and a manual run cannot double-assign a report.
 */
export const CORPUS_DAYS = 7;
const LOCK_KEY = 'frealgo:event-clustering';

interface Doc extends ClusterInput {
  title: string;
  isFixture: boolean;
  eventId: string | null;
}

export interface ClusteringResult {
  skipped?: 'locked';
  methodVersion: number;
  considered: number;
  unclustered: number;
  joined: number;
  created: number;
  /** Events that gained reports in this run. */
  eventsTouched: number;
  /** Events whose stored title, dates, counts or wording were brought up to date. */
  eventsRefreshed: number;
  decisions?: (ClusterDecision & { titles: string[] })[];
}

export function eventSlug(title: string, startAt: Date, seedArticleId: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8)
    .join('-')
    .slice(0, 60)
    .replace(/-+$/, '');
  const hash = createHash('sha256').update(seedArticleId).digest('hex').slice(0, 6);
  return `${startAt.toISOString().slice(0, 10)}-${words || 'event'}-${hash}`;
}

const ARTICLE_FIELDS = {
  id: true,
  title: true,
  language: true,
  publishedAt: true,
  outletId: true,
  isFixture: true,
  // Only countries the text names: feed scope and publisher home say nothing about the event.
  countries: {
    where: { role: 'SUBJECT' as const },
    select: { country: { select: { iso2: true } } },
  },
};

interface ArticleRow {
  id: string;
  title: string;
  language: string | null;
  publishedAt: Date;
  outletId: string;
  isFixture: boolean;
  countries: { country: { iso2: string } }[];
}

function toDoc(r: ArticleRow, eventId: string | null): Doc {
  const language = baseLang(r.language);
  const countries = r.countries.map((c) => c.country.iso2);
  return {
    id: r.id,
    title: r.title,
    language,
    publishedAt: r.publishedAt,
    outletId: r.outletId,
    isFixture: r.isFixture,
    eventId,
    terms: terms(r.title, language, countries),
    names: names(r.title, language, countries),
  };
}

async function loadDocs(
  prisma: PrismaClient,
  since: Date,
  until: Date,
  fixturesOnly: boolean,
): Promise<Doc[]> {
  const rows = await prisma.article.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { gte: since, lte: until },
      eventExclusion: null, // an operator removed it from clustering (wrong grouping)
      ...(fixturesOnly ? { isFixture: true } : {}),
    },
    select: { ...ARTICLE_FIELDS, eventLink: { select: { eventId: true } } },
    orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((r) => toDoc(r, r.eventLink?.eventId ?? null));
}

export async function runEventClustering(
  prisma: PrismaClient,
  /** fixturesOnly: used by the seed so a deploy never clusters real reports as a side effect. */
  opts: { now?: Date; dryRun?: boolean; fixturesOnly?: boolean } = {},
): Promise<ClusteringResult> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - CORPUS_DAYS * 86_400_000);
  const until = new Date(now.getTime() + 3_600_000); // tolerate small publisher clock skew

  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS locked`;
      const empty = {
        methodVersion: CLUSTER_METHOD_VERSION,
        considered: 0,
        unclustered: 0,
        joined: 0,
        created: 0,
        eventsTouched: 0,
        eventsRefreshed: 0,
      };
      if (!lock?.locked) return { ...empty, skipped: 'locked' as const };

      const docs = await loadDocs(
        tx as unknown as PrismaClient,
        since,
        until,
        opts.fixturesOnly ?? false,
      );
      const byId = new Map(docs.map((d) => [d.id, d]));
      const groups = new Map<string, Doc[]>();
      for (const d of docs) {
        const key = `${d.isFixture ? 'fixture' : 'real'}|${d.language}`;
        groups.set(key, [...(groups.get(key) ?? []), d]);
      }

      // Open events: any event with a member in the corpus window. Members outside the window are
      // loaded too so the mean-similarity guard sees the whole event.
      const eventIds = [...new Set(docs.map((d) => d.eventId).filter((x): x is string => !!x))];
      const outside = eventIds.length
        ? await tx.eventArticle.findMany({
            where: { eventId: { in: eventIds }, articleId: { notIn: [...byId.keys()] } },
            select: { eventId: true, article: { select: ARTICLE_FIELDS } },
          })
        : [];
      const members = new Map<string, Doc[]>();
      for (const d of docs)
        if (d.eventId) members.set(d.eventId, [...(members.get(d.eventId) ?? []), d]);
      for (const o of outside) {
        const doc = toDoc(o.article, o.eventId);
        byId.set(doc.id, doc);
        members.set(o.eventId, [...(members.get(o.eventId) ?? []), doc]);
      }

      const all: ClusterDecision[] = [];
      const idfByGroup = new Map<string, ReturnType<typeof idfFrom>>();
      let unclustered = 0;
      for (const [key, group] of groups) {
        const idf = idfFrom(group.map((d) => d.terms));
        const distinctive = isDistinctive(idf, group.length);
        idfByGroup.set(key, idf);
        const free = group.filter((d) => !d.eventId);
        unclustered += free.length;
        if (!free.length) continue;
        const isFixture = key.startsWith('fixture|');
        const events: ExistingEvent[] = [...members]
          .filter(([, m]) => m[0]!.isFixture === isFixture && m[0]!.language === group[0]!.language)
          .map(([id, m]) => ({
            id,
            language: m[0]!.language,
            lastAt: new Date(Math.max(...m.map((x) => x.publishedAt.getTime()))),
            members: m,
          }))
          .sort((a, b) => (a.id < b.id ? -1 : 1));
        all.push(...clusterDecisions(free, events, idf, distinctive));
      }

      const result: ClusteringResult = {
        ...empty,
        considered: docs.length,
        unclustered,
        joined: all.filter((d) => d.kind === 'join').length,
        created: all.filter((d) => d.kind === 'create').length,
      };
      if (opts.dryRun) {
        result.decisions = all.map((d) => ({
          ...d,
          titles:
            d.kind === 'create'
              ? [d.seed.id, d.partner.id].map((id) => byId.get(id)!.title)
              : [byId.get(d.articleId)!.title],
        }));
        result.eventsTouched = new Set(
          all.map((d) => (d.kind === 'create' ? `new:${d.seed.id}` : d.eventId)),
        ).size;
        return result;
      }

      // Persist: create events, then memberships, then recompute each touched event.
      const realId = new Map<string, string>();
      const touched = new Set<string>();
      for (const d of all) {
        if (d.kind === 'create') {
          const first = d.seed.publishedAt <= d.partner.publishedAt ? d.seed : d.partner;
          const ev = await tx.newsEvent.create({
            data: {
              slug: eventSlug(byId.get(first.id)!.title, first.publishedAt, d.seed.id),
              title: byId.get(first.id)!.title,
              titleArticleId: first.id,
              language: d.seed.language,
              startAt: first.publishedAt,
              lastAt: d.partner.publishedAt,
              methodVersion: CLUSTER_METHOD_VERSION,
              isFixture: byId.get(d.seed.id)!.isFixture,
            },
            select: { id: true },
          });
          realId.set(`new:${d.seed.id}`, ev.id);
          await tx.eventArticle.createMany({
            data: [
              { articleId: d.seed.id, matchedArticleId: d.partner.id },
              { articleId: d.partner.id, matchedArticleId: d.seed.id },
            ].map((m) => ({
              ...m,
              eventId: ev.id,
              score: d.score,
              sharedTerms: d.shared,
              methodVersion: CLUSTER_METHOD_VERSION,
            })),
          });
          members.set(ev.id, [byId.get(d.seed.id)!, byId.get(d.partner.id)!]);
          touched.add(ev.id);
        } else {
          const eventId = realId.get(d.eventId) ?? d.eventId;
          await tx.eventArticle.create({
            data: {
              articleId: d.articleId,
              eventId,
              score: d.score,
              sharedTerms: d.shared,
              matchedArticleId: d.matchedArticleId,
              methodVersion: CLUSTER_METHOD_VERSION,
            },
          });
          members.set(eventId, [...(members.get(eventId) ?? []), byId.get(d.articleId)!]);
          touched.add(eventId);
        }
      }
      // Bring every open event's stored summary up to date (new members, or a member an
      // operator removed); rows that are already correct are not rewritten.
      result.eventsRefreshed = await refreshEvents(tx as unknown as PrismaClient, members, (m) =>
        idfByGroup.get(`${m.isFixture ? 'fixture' : 'real'}|${m.language}`),
      );
      result.eventsTouched = touched.size;
      return result;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

function summaryOf(members: Doc[], idf: Idf) {
  const m = [...members].sort(
    (a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || (a.id < b.id ? -1 : 1),
  );
  const shown = m[representative(m, idf)]!;
  return {
    title: shown.title,
    titleArticleId: shown.id,
    startAt: m[0]!.publishedAt,
    lastAt: m.at(-1)!.publishedAt,
    articleCount: m.length,
    outletCount: new Set(m.map((x) => x.outletId)).size,
    sharedTerms: sharedWording(m.map((x) => x.terms)),
  };
}

async function refreshEvents(
  prisma: PrismaClient,
  members: Map<string, Doc[]>,
  idfFor: (first: Doc) => Idf | undefined,
): Promise<number> {
  if (!members.size) return 0;
  const stored = await prisma.newsEvent.findMany({
    where: { id: { in: [...members.keys()] } },
    select: {
      id: true,
      title: true,
      titleArticleId: true,
      startAt: true,
      lastAt: true,
      articleCount: true,
      outletCount: true,
      sharedTerms: true,
    },
  });
  let changed = 0;
  for (const row of stored) {
    const m = members.get(row.id)!;
    const next = summaryOf(m, idfFor(m[0]!) ?? idfFrom(m.map((x) => x.terms)));
    const same =
      row.title === next.title &&
      row.titleArticleId === next.titleArticleId &&
      row.startAt.getTime() === next.startAt.getTime() &&
      row.lastAt.getTime() === next.lastAt.getTime() &&
      row.articleCount === next.articleCount &&
      row.outletCount === next.outletCount &&
      row.sharedTerms.join('|') === next.sharedTerms.join('|');
    if (same) continue;
    await prisma.newsEvent.update({ where: { id: row.id }, data: next });
    changed += 1;
  }
  return changed;
}

/**
 * Removes one report from event clustering for good (an operator's correction of a wrong
 * grouping): deletes its membership, records the exclusion and an audit entry, and refreshes the
 * event it left. The next clustering run never groups the report again.
 */
export async function excludeFromEvents(
  prisma: PrismaClient,
  articleId: string,
  opts: { reason: string; by: string },
): Promise<{ eventId: string | null }> {
  if (!opts.reason.trim() || !opts.by.trim()) throw new Error('reason and by are required');
  return prisma.$transaction(async (tx) => {
    const link = await tx.eventArticle.findUnique({ where: { articleId } });
    if (link) await tx.eventArticle.delete({ where: { articleId } });
    await tx.eventExclusion.upsert({
      where: { articleId },
      create: { articleId, reason: opts.reason, createdBy: opts.by },
      update: { reason: opts.reason, createdBy: opts.by },
    });
    await tx.adminAuditLog.create({
      data: {
        actor: opts.by,
        action: 'event.exclude',
        targetType: 'Article',
        targetId: articleId,
        detail: { eventId: link?.eventId ?? null, reason: opts.reason },
      },
    });
    if (link) {
      const rest = await tx.eventArticle.findMany({
        where: { eventId: link.eventId },
        select: { article: { select: ARTICLE_FIELDS } },
      });
      if (rest.length)
        await refreshEvents(
          tx as unknown as PrismaClient,
          new Map([[link.eventId, rest.map((r) => toDoc(r.article, link.eventId))]]),
          () => undefined,
        );
    }
    return { eventId: link?.eventId ?? null };
  });
}

/** Hours within which a report can join an event (re-exported for pages and docs). */
export { WINDOW_HOURS };
