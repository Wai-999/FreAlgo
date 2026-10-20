import type { PrismaClient } from '@/generated/prisma/client';

/** Public outlet registry view: labels with provenance, ownership, paywall, feeds and freshness. */
export async function listOutlets(
  prisma: PrismaClient,
  opts: { includeFixtures: boolean; countryIso2?: string },
) {
  return prisma.mediaOutlet.findMany({
    where: {
      ...(opts.includeFixtures ? {} : { isFixture: false }),
      ...(opts.countryIso2 ? { country: { iso2: opts.countryIso2 } } : {}),
    },
    orderBy: [{ isFixture: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      homepageUrl: true,
      primaryLanguage: true,
      ownershipType: true,
      ownershipNotes: true,
      paywall: true,
      orientation: true,
      ideologyTags: true,
      labelStatus: true,
      labelConfidence: true,
      labelMethodology: true,
      labelSourceUrl: true,
      labelReviewedAt: true,
      labelContext: true,
      labelIsMachine: true,
      isFixture: true,
      country: { select: { iso2: true, name: true } },
      feeds: {
        select: {
          id: true,
          name: true,
          status: true,
          lastSuccessfulSyncAt: true,
          termsReviewedAt: true,
          excerptAllowed: true,
        },
        orderBy: { url: 'asc' },
      },
      _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
    },
  });
}

export type OutletListItem = Awaited<ReturnType<typeof listOutlets>>[number];

export async function getOutletLabelHistory(prisma: PrismaClient, outletId: string) {
  return prisma.outletLabelHistory.findMany({
    where: { outletId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}
