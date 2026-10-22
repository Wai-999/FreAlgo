import type { ArticleQuery, Sort } from '@/lib/api/contracts';
import { ORIENTATION_INFO } from '@/lib/domain/orientation';
import type { ArticleListItem } from '@/lib/search/articles';
import { formatUtc, languageName } from '@/lib/format';
import { SORT_EXPLANATION } from './params';

/**
 * "Why am I seeing this?" (FreAlgo 2.0, spec §3 My World). Explains a story's presence purely from
 * the reader's explicit choices, the stored tag evidence and the ordering rule: the same inputs
 * always give the same explanation. There is no behavioural signal to explain, because none exists.
 */
export const READING_DEPTHS = ['quick', 'deep', 'original'] as const;
export type ReadingDepth = (typeof READING_DEPTHS)[number];

export const DEPTH_INFO: Record<ReadingDepth, { label: string; description: string }> = {
  quick: { label: 'Quick overview', description: 'Headline, outlet, time and source label only' },
  deep: {
    label: 'Deep context',
    description: 'Adds the excerpt, tags with their evidence and why each story is shown',
  },
  original: {
    label: 'Original reporting',
    description: 'The publisher’s own headline and excerpt, with a direct link to the report',
  },
};

export interface WhyContext {
  query: Partial<ArticleQuery>;
  sort: Sort;
  /** Page-specific reasons first, e.g. "One of the countries you chose in My World". */
  reasons?: string[];
}

const PERIOD_TEXT: Record<string, string> = {
  '24h': 'the last 24 hours',
  '3d': 'the last 3 days',
  '7d': 'the last 7 days',
  '30d': 'the last 30 days',
  '365d': 'the last year',
};

const stripRules = (term: string) => term.replace(/\s*\(rules v\d+\)$/, '');

export function whyReasons(article: ArticleListItem, ctx: WhyContext): string[] {
  const q = ctx.query;
  const out = [...(ctx.reasons ?? [])];
  if (q.q) {
    out.push(
      `Its headline, excerpt or outlet name matches your search “${q.q}”` +
        (article.relevance !== undefined ? ` (text-match score ${article.relevance}).` : '.'),
    );
  }
  if (q.country) {
    const c = article.countries.find((x) => x.iso2 === q.country);
    if (c?.role === 'SUBJECT') {
      out.push(
        c.matchedTerm
          ? `It is about ${c.name}: the text mentions “${stripRules(c.matchedTerm)}”.`
          : `An editor tagged it as being about ${c.name}.`,
      );
    } else if (c?.role === 'FEED_SCOPE') {
      out.push(`It comes from a feed that covers ${c.name} (assumed from the feed, not the text).`);
    } else if (c?.role === 'PUBLISHER_HOME') {
      out.push(
        `Its outlet is based in ${c.name}. It is shown because you included stories from publishers based there.`,
      );
    }
  }
  if (q.region) out.push(`It is about a country in ${q.region}.`);
  for (const slug of q.sector ?? []) {
    const s = article.sectors.find((x) => x.slug === slug);
    if (s)
      out.push(
        `Sector ${s.name}: ${s.basis === 'KEYWORD_RULE' ? 'a keyword rule matched' : s.basis === 'FEED_CATEGORY' ? 'the publisher’s own category' : s.basis === 'FEED_DEFAULT' ? 'the feed’s declared section' : 'tagged by an editor'}${s.ruleId ? ` (${s.ruleId})` : ''}.`,
      );
  }
  if (q.outlet?.length) out.push(`It is from ${article.outlet.name}, an outlet you selected.`);
  if (q.orientation?.length) {
    const info = ORIENTATION_INFO[article.outlet.label.orientation];
    out.push(`Its outlet’s source label is ${info.label}, one of the labels you selected.`);
  }
  if (q.language?.length) out.push(`It is published in ${languageName(article.language)}.`);
  if (q.type?.length) {
    out.push(
      article.articleType === 'UNKNOWN'
        ? 'The publisher does not label its type, and you included unlabelled stories.'
        : `The publisher labels it ${article.articleType.toLowerCase()} (${article.articleTypeBasis ?? 'publisher signal'}).`,
    );
  }
  if (q.period && q.period !== 'any') out.push(`It was published within ${PERIOD_TEXT[q.period]}.`);
  if (q.from || q.to) out.push('It was published within the dates you chose.');
  if (out.length === 0)
    out.push('No filters are applied: every stored story appears, in this order.');
  out.push(`${SORT_EXPLANATION[ctx.sort]} Published ${formatUtc(article.publishedAt)}.`);
  out.push('Nothing about you, and no popularity or engagement data, affects what appears here.');
  return out;
}
