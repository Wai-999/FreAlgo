import { apiHandler } from '@/lib/api/handler';
import { methodology } from '@/lib/methodology';

/** GET /api/v1/methodology — the ordering, tagging, selection and grouping rules in force. */
export const GET = apiHandler(
  { cache: 'public-long', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async () => methodology(),
);
