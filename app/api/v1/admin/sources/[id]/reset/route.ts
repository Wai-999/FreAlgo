import { apiHandler } from '@/lib/api/handler';
import { resetCircuit } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

/** Reset the circuit breaker (ERROR sources return to PAUSED for an explicit re-activation). */
export const POST = apiHandler<{ id: string }>(
  { rateLimit: { bucket: 'admin', limit: 60, windowSec: 60 } },
  async (req, { params }) => {
    const actor = requireAdminRequest(req);
    return { source: await resetCircuit(getPrisma(), actor, params.id) };
  },
);
