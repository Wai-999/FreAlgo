import { apiHandler, parseJsonBody } from '@/lib/api/handler';
import { sourceUpdateSchema, updateSource } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

/** PATCH { status?: "ACTIVE"|"PAUSED", termsReviewed?: { licenseNotes, termsUrl?, excerptAllowed } } */
export const PATCH = apiHandler<{ id: string }>(
  { rateLimit: { bucket: 'admin', limit: 60, windowSec: 60 } },
  async (req, { params }) => {
    const actor = requireAdminRequest(req);
    const body = await parseJsonBody(sourceUpdateSchema, req);
    return { source: await updateSource(getPrisma(), actor, params.id, body) };
  },
);
