import { apiHandler } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { getFreshnessReport } from '@/lib/db/freshness';
import { getSourceQuality } from '@/lib/db/quality';
import { getEnv } from '@/lib/env';

/**
 * Public source health (spec §7 `GET /api/sources/health`): per-source freshness plus the measured
 * source-quality dashboard. Public-safe: error codes only, no error text or credentials.
 */
export const GET = apiHandler(
  { cache: 'public', rateLimit: { bucket: 'freshness', limit: 120, windowSec: 60 } },
  async () => {
    const opts = { includeFixtures: getEnv().SHOW_FIXTURES };
    const [freshness, quality] = await Promise.all([
      getFreshnessReport(getPrisma(), opts),
      getSourceQuality(getPrisma(), opts),
    ]);
    return { ...freshness, quality };
  },
);
