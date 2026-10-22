import { ApiError, apiHandler, notFound } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { getJourney } from '@/lib/db/journeys';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';

/** GET /api/v1/journeys/:slug — a curated, sourced sequence of places (flag "journeys"). */
export const GET = apiHandler<{ slug: string }>(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async (_req, { params }) => {
    if (!isEnabled('journeys')) throw new ApiError(404, 'NOT_FOUND', 'Journeys are disabled');
    if (!/^[a-z0-9-]{1,120}$/.test(params.slug)) throw notFound('Journey');
    const j = await getJourney(getPrisma(), params.slug, {
      includeFixtures: getEnv().SHOW_FIXTURES,
    });
    if (!j) throw notFound('Journey');
    return j;
  },
);
