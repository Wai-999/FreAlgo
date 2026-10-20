import { z } from 'zod';
import { apiHandler, parseSearchParams } from '@/lib/api/handler';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

const query = z.object({
  sourceId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Ingestion audit log (most recent first). */
export const GET = apiHandler(
  { rateLimit: { bucket: 'admin', limit: 120, windowSec: 60 } },
  async (req) => {
    requireAdminRequest(req);
    const q = parseSearchParams(query, req.nextUrl.searchParams);
    return {
      runs: await getPrisma().ingestionRun.findMany({
        where: q.sourceId ? { feedSourceId: q.sourceId } : {},
        orderBy: { startedAt: 'desc' },
        take: q.limit,
      }),
    };
  },
);
