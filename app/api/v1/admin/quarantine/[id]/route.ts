import { apiHandler, parseJsonBody } from '@/lib/api/handler';
import { quarantineResolveSchema, resolveQuarantine } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

export const POST = apiHandler<{ id: string }>(
  { rateLimit: { bucket: 'admin', limit: 60, windowSec: 60 } },
  async (req, { params }) => {
    const actor = requireAdminRequest(req);
    return resolveQuarantine(
      getPrisma(),
      actor,
      params.id,
      await parseJsonBody(quarantineResolveSchema, req),
    );
  },
);
