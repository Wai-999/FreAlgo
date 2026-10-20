import { apiHandler } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';

export const GET = apiHandler(
  { cache: 'public-long', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async () => ({
    sectors: await getPrisma().sector.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, description: true },
    }),
    note: 'Articles may carry several sectors. Tags come from auditable rules (see /methodology#tagging).',
  }),
);
