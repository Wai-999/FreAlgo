import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getLogger } from '@/lib/log';
import { checkRateLimit, clientKey } from './rate-limit';

/**
 * Route-handler wrapper: stable error envelope, Zod validation errors, rate limits, cache and
 * security headers. Every /api/v1 handler goes through this.
 *
 * Error envelope: { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...], "requestId": "..." } }
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found`);

export type CachePolicy = 'public' | 'public-long' | 'no-store';

const CACHE_HEADERS: Record<CachePolicy, string> = {
  // Shared caches may serve for 60s and revalidate in the background for 5 minutes.
  public: 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
  'public-long': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  'no-store': 'no-store',
};

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSec: number;
}

export interface HandlerContext<P> {
  params: P;
  requestId: string;
}

type Handler<P> = (req: NextRequest, ctx: HandlerContext<P>) => Promise<unknown>;

function errorResponse(err: ApiError, requestId: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        requestId,
      },
    },
    { status: err.status, headers: { 'Cache-Control': 'no-store', ...err.headers } },
  );
}

export function apiHandler<P = Record<string, never>>(
  opts: { cache?: CachePolicy; rateLimit?: RateLimitRule },
  handler: Handler<P>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }) => {
    const requestId = crypto.randomUUID();
    let response: NextResponse;
    try {
      const rlHeaders: Record<string, string> = {};
      if (opts.rateLimit) {
        const rl = await checkRateLimit(opts.rateLimit, clientKey(req));
        rlHeaders['RateLimit-Limit'] = String(opts.rateLimit.limit);
        rlHeaders['RateLimit-Remaining'] = String(Math.max(0, rl.remaining));
        rlHeaders['RateLimit-Reset'] = String(rl.resetSec);
        if (!rl.ok) {
          throw new ApiError(
            429,
            'RATE_LIMITED',
            'Too many requests; please slow down.',
            undefined,
            {
              ...rlHeaders,
              'Retry-After': String(rl.resetSec),
            },
          );
        }
      }
      const params = (await routeCtx?.params) ?? ({} as P);
      const result = await handler(req, { params, requestId });
      response =
        result instanceof NextResponse
          ? result
          : result instanceof Response
            ? new NextResponse(result.body, result)
            : NextResponse.json(result);
      if (!response.headers.has('Cache-Control')) {
        response.headers.set('Cache-Control', CACHE_HEADERS[opts.cache ?? 'no-store']);
      }
      for (const [k, v] of Object.entries(rlHeaders)) response.headers.set(k, v);
    } catch (err) {
      if (err instanceof ApiError) response = errorResponse(err, requestId);
      else if (err instanceof ZodError) {
        response = errorResponse(
          new ApiError(
            400,
            'VALIDATION_ERROR',
            'Invalid request parameters',
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
          requestId,
        );
      } else {
        getLogger().error(
          {
            err: err instanceof Error ? err.message : String(err),
            requestId,
            path: req.nextUrl.pathname,
          },
          'unhandled API error',
        );
        response = errorResponse(
          new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'),
          requestId,
        );
      }
    }
    response.headers.set('X-Request-Id', requestId);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  };
}

/** 303 See Other with a relative Location: correct behind any host, port or reverse proxy. */
export function seeOther(path: string): NextResponse {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('seeOther expects a site-relative path');
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/** Parses URLSearchParams with a Zod schema. Repeated keys become arrays; empty values are dropped. */
export function parseSearchParams<T>(schema: ZodType<T>, params: URLSearchParams): T {
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key).filter((v) => v !== '');
    if (values.length === 0) continue;
    raw[key] = values.length === 1 ? values[0]! : values;
  }
  return schema.parse(raw);
}

export async function parseJsonBody<T>(
  schema: ZodType<T>,
  req: Request,
  maxBytes = 16_384,
): Promise<T> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.includes('application/json'))
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Expected application/json');
  const text = await req.text();
  if (text.length > maxBytes)
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Body is not valid JSON');
  }
  return schema.parse(data);
}
