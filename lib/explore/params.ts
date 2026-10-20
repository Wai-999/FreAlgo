import { articleQuerySchema, toSearchParams, type ArticleQuery } from '@/lib/api/contracts';
import { ORIENTATION_INFO } from '@/lib/domain/orientation';
import { sectorName } from '@/lib/domain/sectors';
import { languageName } from '@/lib/format';

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Converts Next.js searchParams into URLSearchParams (repeated keys preserved). */
export function toUrlParams(sp: RawSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => x && p.append(k, x));
    else if (v) p.append(k, v);
  }
  return p;
}

/**
 * Parses page params leniently: invalid values are dropped (and reported) instead of failing
 * the page, so a stale or hand-edited link still shows something useful.
 */
export function parseExploreQuery(sp: RawSearchParams): { query: ArticleQuery; ignored: string[] } {
  const params = toUrlParams(sp);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    raw[key] = values.length === 1 ? values[0]! : values;
  }
  const strict = articleQuerySchema.safeParse(raw);
  if (strict.success) return { query: strict.data, ignored: [] };
  const ignored = new Set(strict.error.issues.map((i) => String(i.path[0] ?? 'query')));
  for (const k of ignored) delete raw[k];
  const retry = articleQuerySchema.safeParse(raw);
  return {
    query: retry.success ? retry.data : articleQuerySchema.parse({}),
    ignored: [...ignored],
  };
}

export function exploreHref(
  query: Partial<ArticleQuery>,
  overrides: Record<string, string | null> = {},
): string {
  const p = toSearchParams(query, overrides);
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

/** Short human summary of active filters, e.g. "Agriculture · Center-Left · English · Last 7 days". */
export function filterSummary(q: ArticleQuery): { text: string; count: number } {
  const parts: string[] = [];
  if (q.sector?.length) parts.push(q.sector.map(sectorName).join(' or '));
  if (q.orientation?.length)
    parts.push(q.orientation.map((o) => ORIENTATION_INFO[o].label).join(' or '));
  if (q.outlet?.length) parts.push(`${q.outlet.length} outlet${q.outlet.length > 1 ? 's' : ''}`);
  if (q.language?.length) parts.push(q.language.map((l) => languageName(l)).join(' or '));
  if (q.period && q.period !== 'any') {
    parts.push(
      {
        '24h': 'Last 24 hours',
        '3d': 'Last 3 days',
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
        '365d': 'Last year',
      }[q.period],
    );
  }
  if (q.from || q.to) {
    parts.push(
      `${q.from?.toISOString().slice(0, 10) ?? '…'} to ${q.to?.toISOString().slice(0, 10) ?? '…'}`,
    );
  }
  if (q.q) parts.push(`“${q.q}”`);
  return { text: parts.join(' · '), count: parts.length };
}

export const SORT_LABEL: Record<string, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  outlet: 'Outlet name (A–Z)',
  relevance: 'Text relevance',
};
