import { apiHandler, parseJsonBody } from '@/lib/api/handler';
import { labelUpdateSchema, updateOutletLabel } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

/** Label change with mandatory provenance; appends OutletLabelHistory + AdminAuditLog. */
export const PATCH = apiHandler<{ id: string }>(
  { rateLimit: { bucket: 'admin', limit: 30, windowSec: 60 } },
  async (req, { params }) => {
    const actor = requireAdminRequest(req);
    return {
      outlet: await updateOutletLabel(
        getPrisma(),
        actor,
        params.id,
        await parseJsonBody(labelUpdateSchema, req),
      ),
    };
  },
);
