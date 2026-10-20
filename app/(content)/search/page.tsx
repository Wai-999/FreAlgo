import type { Metadata } from 'next';
import Link from 'next/link';
import { FilterForm } from '@/components/news/filter-form';
import { WorkspaceNavProvider } from '@/components/news/nav-anchor';
import { Pagination } from '@/components/news/pagination';
import { StoryCard } from '@/components/news/story-card';
import { toSearchParams } from '@/lib/api/contracts';
import { getPrisma } from '@/lib/db/client';
import { listCountrySummaries } from '@/lib/db/countries';
import { SECTORS } from '@/lib/domain/sectors';
import { getEnv } from '@/lib/env';
import {
  SORT_LABEL,
  filterSummary,
  parseExploreQuery,
  type RawSearchParams,
} from '@/lib/explore/params';
import { languageName } from '@/lib/format';
import { listArticles } from '@/lib/search/articles';
import { InvalidCursorError } from '@/lib/search/cursor';

export const metadata: Metadata = { title: 'Search' };

const SEARCH_LANGUAGES = ['en', 'fr', 'de', 'es', 'pt', 'ar', 'ja', 'zh', 'my', 'ru', 'hi', 'sw'];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const env = getEnv();
  const { query, ignored } = parseExploreQuery(sp);
  const countries = await listCountrySummaries({ includeFixtures: env.SHOW_FIXTURES });
  const regions = [
    ...new Set(countries.flatMap((c) => [c.region, c.subregion]).filter((r): r is string => !!r)),
  ].sort();
  const outlets = await getPrisma().mediaOutlet.findMany({
    where: env.SHOW_FIXTURES ? {} : { isFixture: false },
    orderBy: { name: 'asc' },
    select: { slug: true, name: true },
  });

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
  const summary = filterSummary(query);
  const searchForm = (
    <FilterForm
      action="/search"
      showQuery
      showSector
      sectors={SECTORS.map((s) => ({ slug: s.slug, name: s.name }))}
      countryOptions={countries.map((c) => ({ iso2: c.iso2, name: c.name }))}
      regionOptions={regions}
      values={{
        q: query.q,
        country: query.country,
        region: query.region,
        sector: query.sector,
        orientation: query.orientation?.map((o) => o.toLowerCase().replace(/_/g, '-')),
        outlet: query.outlet,
        language: query.language,
        period: query.period,
        from: query.from?.toISOString().slice(0, 10),
        to: query.to?.toISOString().slice(0, 10),
        sort: query.sort,
      }}
      hidden={{}}
      outlets={outlets}
      languages={SEARCH_LANGUAGES.map((code) => ({ code, name: languageName(code) }))}
      resetHref="/search"
    />
  );
  const pageHref = (cursor: string | null) => {
    const p = toSearchParams(query, { cursor });
    return `/search?${p.toString()}`;
  };

  return (
    <WorkspaceNavProvider>
      <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
      <p className="measure mt-2 text-muted">
        Search headlines, licensed excerpts and outlet names across every registered source. Results
        are ordered only by the rule you choose.{' '}
        <strong className="text-text">Text relevance</strong> measures how closely the words match,
        never popularity, engagement or political lean.{' '}
        <Link href="/methodology">How sources are labelled</Link>.
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        <details className="rounded-lg border border-border bg-surface lg:hidden" open={!query.q}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm [&::-webkit-details-marker]:hidden">
            <span className="font-medium text-text">Search &amp; filters</span>
            <span className="ml-2 text-muted">{summary.count ? summary.text : 'none'}</span>
          </summary>
          <div className="border-t border-border p-3">{searchForm}</div>
        </details>
        <aside aria-label="Search and filters" className="hidden lg:block">
          {searchForm}
        </aside>
        <section aria-labelledby="results-h" className="min-w-0">
          <h2 id="results-h" className="sr-only">
            Results
          </h2>
          {ignored.length || staleCursor ? (
            <p role="status" className="mb-3 rounded-md border border-warning/50 px-3 py-2 text-sm">
              {staleCursor ? 'That page link has expired; showing the first page. ' : ''}
              {ignored.length ? `Ignored invalid parameters: ${ignored.join(', ')}.` : ''}
            </p>
          ) : null}
          <p className="text-sm text-muted" data-testid="ordering-note" aria-live="polite">
            {result.page.total}
            {result.page.totalIsCapped ? '+' : ''} {result.page.total === 1 ? 'story' : 'stories'}
            {summary.count ? ` for ${summary.text}` : ''} · {SORT_LABEL[result.page.sort]}
            {result.page.sort === 'relevance' ? ' (textual match; ties broken by newest)' : ''}
          </p>
          {result.items.length === 0 ? (
            <p className="py-10 text-muted" data-testid="empty-state">
              No stories match. Try fewer words, a longer period or fewer filters. Phrase search
              uses &quot;quotes&quot;; exclude words with -minus.
            </p>
          ) : (
            <div data-testid="story-list">
              {result.items.map((a) => (
                <StoryCard key={a.id} article={a} headingLevel={3} />
              ))}
            </div>
          )}
          <Pagination page={result.page} hrefFor={pageHref} shownCount={result.items.length} />
        </section>
      </div>
    </WorkspaceNavProvider>
  );
}
