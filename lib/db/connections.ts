import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Country connections (FreAlgo 2.0, spec §3; flag "countryConnections"). The only relationship
 * type FreAlgo shows is evidenced in its own data: both countries are named in the text of
 * reports grouped into the same event cluster. No trade, historical or political link is
 * inferred, and a connection says nothing beyond "reported together".
 */
export interface Connection {
  iso2: string;
  name: string;
  relationship: 'shared-event-cluster';
  events: { slug: string; title: string; startAt: string; lastAt: string }[];
}

export async function countryConnections(
  prisma: PrismaClient,
  iso2: string,
  opts: { includeFixtures: boolean },
): Promise<Connection[]> {
  const rows = await prisma.$queryRaw<
    { iso2: string; name: string; slug: string; title: string; startAt: Date; lastAt: Date }[]
  >`
    SELECT DISTINCT c2.iso2, c2.name, e.slug, e.title, e."startAt", e."lastAt"
    FROM "Country" c1
    JOIN "ArticleCountry" ac1 ON ac1."countryId" = c1.id AND ac1.role = 'SUBJECT'::"CountryRole"
    JOIN "Article" a1 ON a1.id = ac1."articleId" AND a1.status = 'PUBLISHED'
    JOIN "EventArticle" ea1 ON ea1."articleId" = a1.id
    JOIN "NewsEvent" e ON e.id = ea1."eventId"
    JOIN "EventArticle" ea2 ON ea2."eventId" = e.id
    JOIN "Article" a2 ON a2.id = ea2."articleId" AND a2.status = 'PUBLISHED'
    JOIN "ArticleCountry" ac2 ON ac2."articleId" = a2.id AND ac2.role = 'SUBJECT'::"CountryRole"
    JOIN "Country" c2 ON c2.id = ac2."countryId" AND c2.id <> c1.id
    WHERE c1.iso2 = ${iso2} AND (${opts.includeFixtures} OR NOT e."isFixture")
    ORDER BY c2.name, e."lastAt" DESC`;
  const out = new Map<string, Connection>();
  for (const r of rows) {
    const c = out.get(r.iso2) ?? {
      iso2: r.iso2,
      name: r.name,
      relationship: 'shared-event-cluster' as const,
      events: [],
    };
    c.events.push({
      slug: r.slug,
      title: r.title,
      startAt: r.startAt.toISOString(),
      lastAt: r.lastAt.toISOString(),
    });
    out.set(r.iso2, c);
  }
  return [...out.values()];
}
