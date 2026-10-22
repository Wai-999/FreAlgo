import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilterForm } from '@/components/news/filter-form';
import { WorkspaceNavProvider } from '@/components/news/nav-anchor';
import { Pagination } from '@/components/news/pagination';
import { ReadingDepthNav } from '@/components/news/reading-depth-nav';
import { SectorNav } from '@/components/news/sector-nav';
import { StoryCard } from '@/components/news/story-card';
import { toSearchParams, type ArticleQuery } from '@/lib/api/contracts';
import { getPrisma } from '@/lib/db/client';
import { listCountrySummaries } from '@/lib/db/countries';
import { getEnv } from '@/lib/env';
import {
  SORT_EXPLANATION,
  filterSummary,
  parseExploreQuery,
  type RawSearchParams,
} from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';
import { languageName } from '@/lib/format';
import { listArticles } from '@/lib/search/articles';
import { InvalidCursorError } from '@/lib/search/cursor';

export const metadata: Metadata = {
  title: 'Stories',
  description: 'Every stored story in the order you choose: finite pages, no ranking.',
};

const LANGUAGES = ['en', 'pt', 'es', 'fr', 'de', 'ar', 'ja', 'my', 'ru', 'bn', 'it'];

/**
 * Stories (FreAlgo 2.0, spec §3): calm, finite, chronological collections across every country.
 * Collections are the sectors; reading depth and every filter live in the URL.
 */
export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('stories')) notFound();
  const env = getEnv();
  const { query: parsed, ignored } = parseExploreQuery(await searchParams);
  // Free-text search lives on /search; Stories is browsing by explicit filters only.
  const query: ArticleQuery = { ...parsed, q: undefined };
  const depth = query.depth ?? 'deep';
  const href = (q: Partial<ArticleQuery>, overrides: Record<string, string | null> = {}) => {
    const p = toSearchParams(q, overrides).toString();
    return p ? `/stories?${p}` : '/stories';
  };

  const [countries, outlets] = await Promise.all([
    listCountrySummaries({ includeFixtures: env.SHOW_FIXTURES }),
    getPrisma().mediaOutlet.findMany({
      where: env.SHOW_FIXTURES ? {} : { isFixture: false },
      orderBy: { name: 'asc' },
      select: { slug: true, name: true },
    }),
  ]);
  const regions = [
    ...new Set(countries.flatMap((c) => [c.region, c.subregion]).filter((r): r is string => !!r)),
  ].sort();

  let staleCursor = false;
  let result;
  try {
    result = await listArticles(getPrisma(), query, { includeFixtures: env.SHOW_FIXTURES });
  } catch (err) {
    if (!(err instanceof InvalidCursorError)) throw err;
    staleCursor = true;
    result = await listArticles(
      getPrisma(),
      { ...query, cursor: undefined },
      { includeFixtures: env.SHOW_FIXTURES },
    );
  }
  const sector = query.sector?.length === 1 ? query.sector[0]! : null;
  const summary = filterSummary({ ...query, sector: undefined });

  const filters = (
    <FilterForm
      action="/stories"
      countryOptions={countries.map((c) => ({ iso2: c.iso2, name: c.name }))}
      regionOptions={regions}
      values={{
        country: query.country,
        region: query.region,
        orientation: query.orientation?.map((o) => o.toLowerCase().replace(/_/g, '-')),
        outlet: query.outlet,
        language: query.language,
        period: query.period,
        from: query.from?.toISOString().slice(0, 10),
        to: query.to?.toISOString().slice(0, 10),
        sort: query.sort,
        type: query.type,
        scope: query.scope,
      }}
      showScope
      hidden={{ sector: sector ?? undefined, depth: query.depth }}
      outlets={outlets}
      languages={LANGUAGES.map((code) => ({ code, name: languageName(code) }))}
      resetHref={href({ sector: query.sector, depth: query.depth })}
    />
  );

  return (
    <WorkspaceNavProvider>
      <h1 className="text-3xl font-semibold tracking-tight">Stories</h1>
      <p className="measure mt-2 text-muted">
        Every stored story, in the order you choose. Pages are finite, nothing is ranked by
        popularity, and each story links to the original publisher. Open{' '}
        <strong className="text-text">Why this story?</strong> on any card to see exactly why it is
        here. <Link href="/methodology#tagging">How stories are tagged</Link>.
      </p>
      <div className="mt-6 space-y-3">
        <SectorNav
          selected={sector}
          hrefFor={(slug) =>
            href({ ...query, sector: slug ? [slug] : undefined, cursor: undefined })
          }
        />
        <ReadingDepthNav
          current={depth}
          hrefFor={(d) => href(query, { depth: d === 'deep' ? null : d })}
        />
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <details className="rounded-lg border border-border bg-surface lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-text">Filters</span>
            <span className="ml-2 text-muted">{summary.count ? summary.text : 'none'}</span>
          </summary>
          <div className="border-t border-border p-3">{filters}</div>
        </details>
        <aside aria-label="Filters" className="hidden lg:block">
          {filters}
        </aside>
        <section aria-labelledby="stories-h" className="min-w-0">
          <h2 id="stories-h" className="sr-only">
            Story list
          </h2>
          {ignored.length || staleCursor ? (
            <p role="status" className="mb-3 rounded-md border border-warning/50 px-3 py-2 text-sm">
              {staleCursor ? 'That page link has expired; showing the first page. ' : ''}
              {ignored.length ? `Ignored invalid parameters: ${ignored.join(', ')}.` : ''}
            </p>
          ) : null}
          <p className="text-sm text-muted" data-testid="ordering-note">
            {result.page.total}
            {result.page.totalIsCapped ? '+' : ''} {result.page.total === 1 ? 'story' : 'stories'}
            {summary.count ? ` for ${summary.text}` : ''}. {SORT_EXPLANATION[result.page.sort]}
          </p>
          {result.items.length === 0 ? (
            <div className="py-10 text-muted" data-testid="empty-state">
              <p>No stories match these choices.</p>
              <p className="mt-2">
                <Link href={href({ depth: query.depth })}>Clear all filters</Link>
              </p>
            </div>
          ) : (
            <div data-testid="story-list">
              {result.items.map((a) => (
                <StoryCard
                  key={a.id}
                  article={a}
                  depth={depth}
                  why={{ query, sort: result.page.sort }}
                />
              ))}
            </div>
          )}
          <Pagination
            page={result.page}
            hrefFor={(cursor) => href(query, { cursor })}
            shownCount={result.items.length}
          />
        </section>
      </div>
    </WorkspaceNavProvider>
  );
}
