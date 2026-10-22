import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Story Journeys (FreAlgo 2.0, M4; flag "journeys"). Curated by a named person: each step names a
 * place, says how it connects to the previous step, labels that statement as a fact,
 * interpretation or analogy, and cites evidence. FreAlgo never generates journeys or links.
 */
export interface JourneyStep {
  position: number;
  title: string;
  explanation: string;
  kind: 'FACT' | 'INTERPRETATION' | 'ANALOGY';
  occurredAt: string | null;
  evidenceUrl: string;
  evidenceName: string;
  uncertainty: string | null;
  country: { iso2: string; name: string } | null;
  event: { slug: string; title: string } | null;
}

export interface Journey {
  slug: string;
  title: string;
  description: string;
  caveats: string;
  curatedBy: string;
  reviewedAt: string;
  isFixture: boolean;
  steps: JourneyStep[];
}

export async function listJourneys(prisma: PrismaClient, opts: { includeFixtures: boolean }) {
  const rows = await prisma.storyJourney.findMany({
    where: opts.includeFixtures ? {} : { isFixture: false },
    select: {
      slug: true,
      title: true,
      description: true,
      isFixture: true,
      _count: { select: { nodes: true } },
    },
    orderBy: { title: 'asc' },
  });
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    isFixture: r.isFixture,
    steps: r._count.nodes,
  }));
}

export async function getJourney(
  prisma: PrismaClient,
  slug: string,
  opts: { includeFixtures: boolean },
): Promise<Journey | null> {
  if (slug.length > 120) return null;
  const j = await prisma.storyJourney.findUnique({
    where: { slug },
    include: {
      nodes: {
        orderBy: { position: 'asc' },
        include: {
          country: { select: { iso2: true, name: true } },
          event: { select: { slug: true, title: true, isFixture: true } },
        },
      },
    },
  });
  if (!j || (j.isFixture && !opts.includeFixtures)) return null;
  return {
    slug: j.slug,
    title: j.title,
    description: j.description,
    caveats: j.caveats,
    curatedBy: j.curatedBy,
    reviewedAt: j.reviewedAt.toISOString(),
    isFixture: j.isFixture,
    steps: j.nodes.map((n) => ({
      position: n.position,
      title: n.title,
      explanation: n.explanation,
      kind: n.kind,
      occurredAt: n.occurredAt?.toISOString() ?? null,
      evidenceUrl: n.evidenceUrl,
      evidenceName: n.evidenceName,
      uncertainty: n.uncertainty,
      country: n.country,
      event:
        n.event && (opts.includeFixtures || !n.event.isFixture)
          ? { slug: n.event.slug, title: n.event.title }
          : null,
    })),
  };
}
