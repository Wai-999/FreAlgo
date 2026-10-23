import { ApiError, apiHandler, notFound } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { corpusOutlets, getEvent } from '@/lib/db/events';
import { buildPerspectives } from '@/lib/events/perspectives';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';

/**
 * GET /api/v1/events/:id/perspectives — side-by-side coverage by outlet, source-level labels with
 * provenance, and coverage gaps in FreAlgo's corpus (not in the world).
 */
export const GET = apiHandler<{ id: string }>(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async (_req, { params }) => {
    if (!isEnabled('perspectives') || !isEnabled('eventClustering'))
      throw new ApiError(404, 'NOT_FOUND', 'Perspectives are disabled');
    if (!/^[a-z0-9-]{1,120}$/.test(params.id)) throw notFound('Event');
    const includeFixtures = getEnv().SHOW_FIXTURES;
    const detail = await getEvent(getPrisma(), params.id, { includeFixtures });
    if (!detail) throw notFound('Event');
    const corpus = await corpusOutlets(getPrisma(), { includeFixtures });
    return {
      ...buildPerspectives(detail, corpus),
      caveat:
        'Gaps describe the outlets FreAlgo ingests, not the world: other outlets may have covered this event.',
    };
  },
);
