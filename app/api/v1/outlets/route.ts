import { z } from 'zod';
import { apiHandler, parseSearchParams } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { listOutlets } from '@/lib/db/outlets';
import { getEnv } from '@/lib/env';

const query = z.object({
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
});

/** Outlet registry: source-level labels with confidence, provenance, status and feeds. */
export const GET = apiHandler(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async (req) => {
    const q = parseSearchParams(query, req.nextUrl.searchParams);
    const outlets = await listOutlets(getPrisma(), {
      includeFixtures: getEnv().SHOW_FIXTURES,
      countryIso2: q.country,
    });
    return {
      outlets: outlets.map((o) => ({
        id: o.id,
        slug: o.slug,
        name: o.name,
        homepageUrl: o.homepageUrl,
        country: o.country,
        primaryLanguage: o.primaryLanguage,
        ownershipType: o.ownershipType,
        paywall: o.paywall,
        isFixture: o.isFixture,
        label: {
          level: 'source',
          orientation: o.orientation,
          status: o.labelStatus,
          confidence: o.labelConfidence,
          ideologyTags: o.ideologyTags,
          context: o.labelContext,
          methodology: o.labelMethodology,
          sourceUrl: o.labelSourceUrl,
          reviewedAt: o.labelReviewedAt,
          isMachine: o.labelIsMachine,
        },
        feeds: o.feeds.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          lastSuccessfulSyncAt: f.lastSuccessfulSyncAt,
        })),
        publishedArticleCount: o._count.articles,
      })),
      note: 'Labels describe an outlet’s general editorial orientation, not the accuracy or viewpoint of any article.',
    };
  },
);
