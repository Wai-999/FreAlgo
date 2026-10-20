import { apiHandler } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { getFreshnessReport } from '@/lib/db/freshness';
import { getEnv } from '@/lib/env';

/** Public, truthful per-source freshness: last attempt, last success, state and error code. */
export const GET = apiHandler(
  { cache: 'public', rateLimit: { bucket: 'freshness', limit: 120, windowSec: 60 } },
  async () => getFreshnessReport(getPrisma(), { includeFixtures: getEnv().SHOW_FIXTURES }),
);
