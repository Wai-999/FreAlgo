import { apiHandler } from '@/lib/api/handler';
import { requestRefetch } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

/** Manual re-fetch: enqueues a one-off job for the worker (deduplicated per minute). */
export const POST = apiHandler<{ id: string }>(
  { rateLimit: { bucket: 'admin-refetch', limit: 20, windowSec: 60 } },
  async (req, { params }) => {
    const actor = requireAdminRequest(req);
    return requestRefetch(getPrisma(), actor, params.id);
  },
);
