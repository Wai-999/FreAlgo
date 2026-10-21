import { z } from 'zod';
import { configError } from '@/lib/ingest/errors';
import type { RawFeedItem } from '@/lib/ingest/feed-parser';
import { safeFetch } from '@/lib/ingest/safe-fetch';
import {
  PayloadError,
  type FeedProvider,
  type ProviderContext,
  type SourceForFetch,
} from './types';

/**
 * Generic adapter for licensed JSON news APIs. Each source declares how to map the provider's
 * response in FeedSource.providerConfig. The API key is read from the server environment variable
 * named in `apiKeyEnv`. It is never stored in the database and never reaches the browser.
 *
 * Using any third-party news API requires a licence and cost review (docs/data/source-methodology.md).
 * Without the key, the source fails with CONFIG_ERROR, which shows up on the freshness page.
 */
export const licensedConfigSchema = z.object({
  apiKeyEnv: z
    .string()
    .regex(/^LICENSED_API_[A-Z0-9_]+$/, 'apiKeyEnv must start with LICENSED_API_'),
  authHeader: z.string().default('Authorization'),
  authScheme: z.string().default('Bearer'),
  itemsPath: z.string().default('articles'),
  fields: z.object({
    id: z.string().optional(),
    url: z.string(),
    title: z.string(),
    summary: z.string().optional(),
    publishedAt: z.string().optional(),
    author: z.string().optional(),
    language: z.string().optional(),
    categories: z.string().optional(),
  }),
});
export type LicensedConfig = z.infer<typeof licensedConfigSchema>;

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

const str = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;

export function mapLicensedItems(json: unknown, config: LicensedConfig): RawFeedItem[] {
  const items = get(json, config.itemsPath);
  if (!Array.isArray(items)) throw new Error(`itemsPath "${config.itemsPath}" is not an array`);
  return items.slice(0, 300).map((it) => {
    const cats = config.fields.categories ? get(it, config.fields.categories) : undefined;
    return {
      guid: config.fields.id ? str(get(it, config.fields.id)) : null,
      guidIsPermaLink: false,
      link: str(get(it, config.fields.url)),
      title: str(get(it, config.fields.title)),
      summary: config.fields.summary ? str(get(it, config.fields.summary)) : null,
      content: null,
      published: config.fields.publishedAt ? str(get(it, config.fields.publishedAt)) : null,
      updated: null,
      author: config.fields.author ? str(get(it, config.fields.author)) : null,
      categories: Array.isArray(cats) ? cats.map(str).filter((c): c is string => !!c) : [],
      imageUrl: null,
      language: config.fields.language ? str(get(it, config.fields.language)) : null,
    };
  });
}

export const licensedJsonProvider: FeedProvider = {
  async fetch(source: SourceForFetch, ctx: ProviderContext) {
    const parsed = licensedConfigSchema.safeParse(source.providerConfig);
    if (!parsed.success)
      throw configError(`Invalid providerConfig: ${parsed.error.issues[0]?.message}`);
    const config = parsed.data;
    const key = ctx.env[config.apiKeyEnv];
    if (!key)
      throw configError(
        `Missing API key: set ${config.apiKeyEnv} on the worker (licence required)`,
      );

    const res = await safeFetch(source.url, {
      ...ctx.fetchOptions,
      accept: 'application/json',
      etag: source.etag,
      lastModified: source.lastModifiedHeader,
      extraHeaders: { [config.authHeader.toLowerCase()]: `${config.authScheme} ${key}`.trim() },
    });
    if (res.notModified || res.body === null) {
      return {
        notModified: true,
        httpStatus: 304,
        etag: res.etag,
        lastModified: res.lastModified,
        feedLanguage: null,
        format: 'json',
        bytes: 0,
        items: [],
        finalUrl: res.finalUrl,
      };
    }
    try {
      const items = mapLicensedItems(JSON.parse(res.body), config);
      return {
        notModified: false,
        httpStatus: res.status,
        etag: res.etag,
        lastModified: res.lastModified,
        feedLanguage: null,
        format: 'json',
        bytes: res.bytes,
        items,
        finalUrl: res.finalUrl,
      };
    } catch (err) {
      throw new PayloadError('PARSE_ERROR', (err as Error).message, res.body);
    }
  },
};
