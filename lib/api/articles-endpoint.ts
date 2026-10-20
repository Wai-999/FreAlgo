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
        explanation:
          result.page.sort === 'relevance'
            ? 'Ordered by how closely the headline and excerpt match your words (text relevance only, never popularity, engagement or political lean); ties broken by newest first.'
            : result.page.sort === 'outlet'
              ? 'Ordered alphabetically by outlet name, then newest first.'
              : result.page.sort === 'oldest'
                ? 'Ordered by publication time, oldest first.'
                : 'Ordered by publication time, newest first.',
      },
    };
  } catch (err) {
    if (err instanceof InvalidCursorError) throw new ApiError(400, 'INVALID_CURSOR', err.message);
    if (err instanceof UnknownCountryError) throw new ApiError(404, 'NOT_FOUND', err.message);
    throw err;
  }
}
