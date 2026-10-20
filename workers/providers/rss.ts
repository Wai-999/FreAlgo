import { IngestError, robotsDisallowed, robotsUnreachable } from '@/lib/ingest/errors';
import { parseFeed } from '@/lib/ingest/feed-parser';
import { productToken, robotsDecision, type RobotsAvailability } from '@/lib/ingest/robots';
import { assertFetchableUrl, safeFetch } from '@/lib/ingest/safe-fetch';
import {
  PayloadError,
  type FeedProvider,
  type ProviderContext,
  type SourceForFetch,
} from './types';

const ROBOTS_TTL_MS = 24 * 3_600_000;
/** Failed robots lookups are cached briefly so a transient outage doesn't block a host all day. */
const ROBOTS_FAILURE_TTL_MS = 10 * 60_000;
const robotsCache = new Map<string, { at: number; availability: RobotsAvailability }>();

export function clearRobotsCache(): void {
  robotsCache.clear();
}

async function robotsFor(origin: string, ctx: ProviderContext): Promise<RobotsAvailability> {
  const cached = robotsCache.get(origin);
  const ttl = cached?.availability.kind === 'unreachable' ? ROBOTS_FAILURE_TTL_MS : ROBOTS_TTL_MS;
  if (cached && Date.now() - cached.at < ttl) return cached.availability;
  let availability: RobotsAvailability;
  try {
    const res = await safeFetch(`${origin}/robots.txt`, {
      ...ctx.fetchOptions,
      maxBytes: 512 * 1024,
      accept: 'text/plain, */*;q=0.1',
    });
    availability = { kind: 'ok', body: res.body ?? '' };
  } catch (err) {
    const status = err instanceof IngestError ? err.httpStatus : undefined;
    // RFC 9309: 4xx => no robots restrictions; 5xx/network => treat as complete disallow.
    if (status && status >= 400 && status < 500 && status !== 429)
      availability = { kind: 'unavailable' };
    else if (err instanceof IngestError && err.code === 'UNSUPPORTED_CONTENT_TYPE')
      availability = { kind: 'unavailable' };
    else availability = { kind: 'unreachable' };
  }
  robotsCache.set(origin, { at: Date.now(), availability });
  return availability;
}

/** Official publisher RSS 2.0 / RSS 1.0 / Atom feeds. */
export const rssProvider: FeedProvider = {
  async fetch(source: SourceForFetch, ctx: ProviderContext) {
    // Validate the target before anything else (including the robots.txt request).
    const url = assertFetchableUrl(source.url, ctx.fetchOptions.allowedPorts);
    if (ctx.respectRobots) {
      const availability = await robotsFor(url.origin, ctx);
      const allowed = robotsDecision(
        availability,
        productToken(ctx.fetchOptions.userAgent),
        `${url.pathname}${url.search}`,
      );
      if (!allowed) {
        if (availability.kind === 'unreachable') {
          throw robotsUnreachable(
            'robots.txt unreachable (5xx/network); per RFC 9309 nothing is fetched until it can be read',
          );
        }
        throw robotsDisallowed('robots.txt disallows this feed for our user agent');
      }
    }

    const res = await safeFetch(source.url, {
      ...ctx.fetchOptions,
      etag: source.etag,
      lastModified: source.lastModifiedHeader,
    });
    if (res.notModified || res.body === null) {
      return {
        notModified: true,
        httpStatus: 304,
        etag: res.etag,
        lastModified: res.lastModified,
        feedLanguage: null,
        format: 'unknown',
        bytes: 0,
        items: [],
        finalUrl: res.finalUrl,
      };
    }
    try {
      const feed = parseFeed(res.body);
      return {
        notModified: false,
        httpStatus: res.status,
        etag: res.etag,
        lastModified: res.lastModified,
        feedLanguage: feed.language,
        format: feed.format,
        bytes: res.bytes,
        items: feed.items,
        finalUrl: res.finalUrl,
      };
    } catch (err) {
      const e = err as IngestError;
      throw new PayloadError(e.code ?? 'PARSE_ERROR', e.message, res.body);
    }
  },
};
