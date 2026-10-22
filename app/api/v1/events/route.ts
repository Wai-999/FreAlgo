import { z } from 'zod';
import { ApiError, apiHandler, parseSearchParams } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { decodeEventCursor, listEvents } from '@/lib/db/events';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';

const schema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
  minOutlets: z.coerce.number().int().min(1).max(2).default(1),
});

/**
 * GET /api/v1/events — event clusters, newest latest report first (never by size or attention).
 * minOutlets=2 gives the events Perspectives can compare.
 */
export const GET = apiHandler(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async (req) => {
    if (!isEnabled('eventClustering'))
      throw new ApiError(404, 'NOT_FOUND', 'Event clusters are disabled');
    const q = parseSearchParams(schema, req.nextUrl.searchParams);
    if (q.cursor && !decodeEventCursor(q.cursor))
      throw new ApiError(400, 'INVALID_CURSOR', 'The cursor is invalid or expired.');
    return listEvents(getPrisma(), { ...q, includeFixtures: getEnv().SHOW_FIXTURES });
  },
);
