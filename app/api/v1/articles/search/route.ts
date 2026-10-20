import { apiHandler } from '@/lib/api/handler';
import { articlesResponse } from '@/lib/api/articles-endpoint';

/** GET /api/v1/articles/search?q=&country=&region=&sector=&outlet=&orientation=&language=&from=&to=&period=&sort=&cursor=&limit= */
export const GET = apiHandler(
  { cache: 'public', rateLimit: { bucket: 'search', limit: 120, windowSec: 60 } },
  async (req) => articlesResponse(req),
);
