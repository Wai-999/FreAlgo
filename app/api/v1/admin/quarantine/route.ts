import { z } from 'zod';
import { apiHandler, parseSearchParams } from '@/lib/api/handler';
import { requireAdminRequest } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';

const query = z.object({
  resolved: z.enum(['true', 'false']).default('false'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = apiHandler(
  { rateLimit: { bucket: 'admin', limit: 120, windowSec: 60 } },
  async (req) => {
    requireAdminRequest(req);
    const q = parseSearchParams(query, req.nextUrl.searchParams);
    const prisma = getPrisma();
    const [items, quarantinedArticles] = await Promise.all([
      prisma.ingestionQuarantine.findMany({
        where: { resolvedAt: q.resolved === 'true' ? { not: null } : null },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        include: { feedSource: { select: { url: true, outlet: { select: { name: true } } } } },
      }),
      prisma.article.findMany({
        where: { status: 'QUARANTINED' },
        orderBy: { firstSeenAt: 'desc' },
        take: q.limit,
        select: {
          id: true,
          title: true,
          canonicalUrl: true,
          statusReason: true,
          publishedAt: true,
          publishedAtRaw: true,
        },
      }),
    ]);
    return { items, quarantinedArticles };
  },
);
