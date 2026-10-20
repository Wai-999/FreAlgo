import { apiHandler, parseJsonBody } from '@/lib/api/handler';
import { articleStatusSchema, setArticleStatus } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

/** Takedown / release: { status: "REMOVED" | "PUBLISHED" | "QUARANTINED", reason } */
export const POST = apiHandler<{ id: string }>(
  { rateLimit: { bucket: 'admin', limit: 60, windowSec: 60 } },
  async (req, { params }) => {
    const actor = requireAdminRequest(req);
    return setArticleStatus(
      getPrisma(),
      actor,
      params.id,
      await parseJsonBody(articleStatusSchema, req),
    );
  },
);
