import { z } from 'zod';
import { ORIENTATIONS, orientationFromSlug, type Orientation } from '@/lib/domain/orientation';
import { SECTOR_SLUGS } from '@/lib/domain/sectors';

/**
 * Versioned (v1) request contracts for list/search endpoints and the server-rendered pages.
 * Query-cost limits are part of the contract: bounded list sizes, bounded text, bounded dates.
 *
 * Semantics: different filter dimensions combine with AND; several values inside one dimension
 * match ANY of them (e.g. sector=politics&sector=education = politics OR education).
 */
export const PAGE_SIZE_DEFAULT = 24;
export const PAGE_SIZE_MAX = 30;

export const SORTS = ['newest', 'oldest', 'alphabetical', 'outlet', 'relevance'] as const;
export type Sort = (typeof SORTS)[number];

export const PERIODS = ['any', '24h', '3d', '7d', '30d', '365d'] as const;

/**
 * Country scope (FreAlgo 2.0): `about` (default) = stories about the country (text evidence or the
 * feed's declared scope); `all` also includes stories from publishers based there.
 */
export const SCOPES = ['about', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

/** Article type filter; `unknown` = the publisher gave no signal. */
export const ARTICLE_TYPES = ['news', 'opinion', 'analysis', 'unknown'] as const;
export type ArticleTypeSlug = (typeof ARTICLE_TYPES)[number];
export type Period = (typeof PERIODS)[number];

const toArray = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const multi = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess(toArray, z.array(item).max(max).optional());

const iso2 = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code')
  .transform((s) => s.toUpperCase());
const slug = z.string().regex(/^[a-z0-9-]{2,80}$/, 'Expected an outlet slug');
const lang = z
  .string()
  .regex(/^[A-Za-z]{2,3}$/, 'Expected a language code like "en"')
  .transform((s) => s.toLowerCase());
const orientation = z.string().transform((s, ctx) => {
  const o = orientationFromSlug(s);
  if (!o) {
    ctx.addIssue({ code: 'custom', message: `Unknown orientation "${s}"` });
    return z.NEVER;
  }
  return o;
}) as unknown as z.ZodType<Orientation>;
const date = z.iso.date().transform((d) => new Date(`${d}T00:00:00Z`));

export const articleQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    country: iso2.optional(),
    region: z.string().trim().min(2).max(40).optional(),
    sector: multi(z.enum(SECTOR_SLUGS as [string, ...string[]]), 7),
    outlet: multi(slug, 20),
    orientation: multi(orientation, ORIENTATIONS.length),
    language: multi(lang, 10),
    period: z.enum(PERIODS).optional(),
    scope: z.enum(SCOPES).optional(),
    type: multi(z.enum(ARTICLE_TYPES), ARTICLE_TYPES.length),
    from: date.optional(),
    to: date.optional(),
    sort: z.enum(SORTS).optional(),
    cursor: z.string().max(512).optional(),
    limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  })
  .superRefine((v, ctx) => {
    if (v.sort === 'relevance' && !v.q) {
      ctx.addIssue({
        code: 'custom',
        path: ['sort'],
        message: 'sort=relevance requires a search query (q)',
      });
    }
    if (v.from && v.to && v.from > v.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be on or before to' });
    }
    if (v.from && v.to && v.to.getTime() - v.from.getTime() > 10 * 365 * 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Date range is limited to 10 years' });
    }
  });

export type ArticleQueryInput = z.input<typeof articleQuerySchema>;
export type ArticleQuery = z.output<typeof articleQuerySchema>;

/** Default sort: relevance when searching, otherwise newest first. */
export function effectiveSort(q: ArticleQuery): Sort {
  return q.sort ?? (q.q ? 'relevance' : 'newest');
}

const PERIOD_MS: Record<Exclude<Period, 'any'>, number> = {
  '24h': 86_400_000,
  '3d': 3 * 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '365d': 365 * 86_400_000,
};

/** Resolves period/from/to into a half-open [from, to) UTC interval. */
export function resolveDateRange(q: ArticleQuery, now = new Date()): { from?: Date; to?: Date } {
  if (q.from || q.to) {
    return {
      from: q.from,
      // `to` is an inclusive calendar day in the UI; make it exclusive at the next midnight.
      to: q.to ? new Date(q.to.getTime() + 86_400_000) : undefined,
    };
  }
  if (q.period && q.period !== 'any')
    return { from: new Date(now.getTime() - PERIOD_MS[q.period]) };
  return {};
}

/** Serialises a query back to URL params (stable order), e.g. for links and cursors. */
export function toSearchParams(
  q: Partial<ArticleQuery>,
  overrides: Record<string, string | null> = {},
): URLSearchParams {
  const p = new URLSearchParams();
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((x) => add(k, x));
    else if (v instanceof Date) p.append(k, v.toISOString().slice(0, 10));
    else p.append(k, String(v));
  };
  add('q', q.q);
  add('country', q.country);
  add('region', q.region);
  add('sector', q.sector);
  add('outlet', q.outlet);
  add(
    'orientation',
    q.orientation?.map((o) => o.toLowerCase().replace(/_/g, '-')),
  );
  add('language', q.language);
  add('period', q.period);
  add('scope', q.scope);
  add('type', q.type);
  add('from', q.from);
  add('to', q.to);
  add('sort', q.sort);
  if (q.limit !== undefined && q.limit !== PAGE_SIZE_DEFAULT) add('limit', q.limit);
  add('cursor', q.cursor);
  for (const [k, v] of Object.entries(overrides)) {
    p.delete(k);
    if (v !== null) p.set(k, v);
  }
  return p;
}
