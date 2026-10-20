import { apiHandler } from '@/lib/api/handler';
import { listSourcesForAdmin } from '@/lib/admin/service';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

export const GET = apiHandler(
  { rateLimit: { bucket: 'admin', limit: 120, windowSec: 60 } },
  async (req) => {
    requireAdminRequest(req);
    return { sources: await listSourcesForAdmin(getPrisma()) };
  },
);
