import { z } from 'zod';
import { ApiError, apiHandler, parseSearchParams } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { SECTOR_SLUGS } from '@/lib/domain/sectors';
import { SEED_RE, newSeed, surprise } from '@/lib/discover/select';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';

const schema = z.object({
  seed: z.string().regex(SEED_RE).optional(),
  region: z.string().trim().min(2).max(40).optional(),
  language: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .optional(),
  sector: z.enum(SECTOR_SLUGS as [string, ...string[]]).optional(),
});

/**
 * Surprise Me as an API (spec §7 `GET /api/discover/random`). Returns the method, seed, eligible
 * pool size and the pick; the same seed and constraints always return the same country.
 */
export const GET = apiHandler(
  { rateLimit: { bucket: 'discover', limit: 60, windowSec: 60 } },
  async (req) => {
    if (!isEnabled('discover')) throw new ApiError(404, 'NOT_FOUND', 'Discover is disabled');
    const q = parseSearchParams(schema, req.nextUrl.searchParams);
    const seed = q.seed ?? newSeed();
    return surprise(getPrisma(), seed, q, { includeFixtures: getEnv().SHOW_FIXTURES });
  },
);
