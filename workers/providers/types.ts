import type { RawFeedItem } from '@/lib/ingest/feed-parser';
import type { SafeFetchOptions } from '@/lib/ingest/safe-fetch';

export interface SourceForFetch {
  id: string;
  url: string;
  kind: 'RSS' | 'ATOM' | 'LICENSED_API';
  etag: string | null;
  lastModifiedHeader: string | null;
  providerConfig: unknown;
}

export interface ProviderContext {
  /** Base fetch options (UA, limits, test seams). Conditional headers are added per source. */
  fetchOptions: Omit<SafeFetchOptions, 'etag' | 'lastModified'>;
  env: Record<string, string | undefined>;
  /** Whether to consult robots.txt (always true in production). */
  respectRobots: boolean;
}

export interface ProviderResult {
  notModified: boolean;
  httpStatus: number;
  etag: string | null;
  lastModified: string | null;
  feedLanguage: string | null;
  format: string;
  bytes: number;
  items: RawFeedItem[];
  finalUrl: string;
}

export interface FeedProvider {
  fetch(source: SourceForFetch, ctx: ProviderContext): Promise<ProviderResult>;
}

/** Thrown when the payload was fetched but could not be parsed; carries an excerpt for quarantine. */
export class PayloadError extends Error {
  readonly payloadExcerpt: string;
  readonly code: string;
  constructor(code: string, message: string, payloadExcerpt: string) {
    super(message);
    this.name = 'PayloadError';
    this.code = code;
    this.payloadExcerpt = payloadExcerpt.slice(0, 2_000);
  }
}
