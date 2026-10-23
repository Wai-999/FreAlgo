import { ApiError, apiHandler, notFound } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { getEvent } from '@/lib/db/events';
import { CLUSTER_METHOD_VERSION } from '@/lib/events/cluster';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';

/**
 * GET /api/v1/events/:id (id or slug) — one event, every report in it with its original link,
 * outlet, time and the evidence that grouped it, plus curated, sourced timeline entries.
 */
export const GET = apiHandler<{ id: string }>(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async (_req, { params }) => {
    if (!isEnabled('eventClustering'))
      throw new ApiError(404, 'NOT_FOUND', 'Event clusters are disabled');
    if (!/^[a-z0-9-]{1,120}$/.test(params.id)) throw notFound('Event');
    const detail = await getEvent(getPrisma(), params.id, {
      includeFixtures: getEnv().SHOW_FIXTURES,
    });
    if (!detail) throw notFound('Event');
    return {
      ...detail,
      timeline: isEnabled('timelines') ? detail.timeline : [],
      upcoming: isEnabled('timelines') ? detail.upcoming : [],
      method: {
        version: CLUSTER_METHOD_VERSION,
        description:
          'Reports grouped by shared distinctive headline words within 72 hours (same language). Grouping is automatic and can be wrong; each report lists the words it shared.',
        url: '/methodology#events',
      },
    };
  },
);
