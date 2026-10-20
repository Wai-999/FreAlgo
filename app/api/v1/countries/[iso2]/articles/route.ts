import { ApiError, apiHandler } from '@/lib/api/handler';
import { articlesResponse } from '@/lib/api/articles-endpoint';

/** GET /api/v1/countries/:iso2/articles?sector=&outlet=&orientation=&language=&from=&to=&period=&sort=&cursor=&limit= */
export const GET = apiHandler<{ iso2: string }>(
  { cache: 'public', rateLimit: { bucket: 'read', limit: 300, windowSec: 60 } },
  async (req, { params }) => {
    if (!/^[A-Za-z]{2}$/.test(params.iso2))
      throw new ApiError(400, 'VALIDATION_ERROR', 'iso2 must be a 2-letter ISO code');
    return articlesResponse(req, { country: params.iso2.toUpperCase() });
  },
);
