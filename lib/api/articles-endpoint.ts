import { SORT_EXPLANATION } from '@/lib/explore/params';
import type { NextRequest } from 'next/server';
import { articleQuerySchema } from '@/lib/api/contracts';
import { ApiError, parseSearchParams } from '@/lib/api/handler';
import { getPrisma } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import { listArticles, UnknownCountryError } from '@/lib/search/articles';
import { InvalidCursorError } from '@/lib/search/cursor';

/** Shared implementation for /countries/:iso2/articles and /articles/search. */
export async function articlesResponse(req: NextRequest, overrides: { country?: string } = {}) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  if (overrides.country) params.set('country', overrides.country);
  const query = parseSearchParams(articleQuerySchema, params);
  try {
    const result = await listArticles(getPrisma(), query, {
      includeFixtures: getEnv().SHOW_FIXTURES,
    });
    return {
      ...result,
      ordering: {
        sort: result.page.sort,
        explanation: SORT_EXPLANATION[result.page.sort],
      },
    };
  } catch (err) {
    if (err instanceof InvalidCursorError) throw new ApiError(400, 'INVALID_CURSOR', err.message);
    if (err instanceof UnknownCountryError) throw new ApiError(404, 'NOT_FOUND', err.message);
    throw err;
  }
}
