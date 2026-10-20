import type { ArticleQuery } from '@/lib/api/contracts';
import { getPrisma } from '@/lib/db/client';
import { getCountryCoverage } from '@/lib/db/coverage';
import { getEnv } from '@/lib/env';
import { SORT_LABEL, exploreHref, filterSummary } from '@/lib/explore/params';
import { languageName } from '@/lib/format';
import { listArticles } from '@/lib/search/articles';
import { InvalidCursorError } from '@/lib/search/cursor';
import { CountrySheet } from './country-sheet';
import { CoverageNotice } from './coverage-notice';
import { FilterForm } from './filter-form';
import { NavAnchor } from './nav-anchor';
import { Pagination } from './pagination';
import { SectorNav } from './sector-nav';
import { StoryCard } from './story-card';

/** Server-rendered contents of the country sheet for the current URL state. */
export async function CountryWorkspace({
  query,
  ignored,
}: {
  query: ArticleQuery & { country: string };
  ignored: string[];
}) {
  const env = getEnv();
  const prisma = getPrisma();
  const coverage = await getCountryCoverage(prisma, query.country, {
    includeFixtures: env.SHOW_FIXTURES,
  });
  if (!coverage) return null;

  const { result, staleCursor } = await listWithCursorFallback(query, env.SHOW_FIXTURES);

  const sector = query.sector?.length === 1 ? query.sector[0]! : null;
  const summary = filterSummary({ ...query, sector: undefined });
  const listKey = `${query.country}|${(query.sector ?? []).join(',')}|${summary.text}|${query.sort ?? ''}|${query.cursor ?? ''}`;
  // Closing keeps sector and filters (so the next country opens with the same view).
  const closeHref = exploreHref({ ...query, country: undefined, cursor: undefined });
  const sectorHref = (slug: string | null) =>
    exploreHref({ ...query, sector: slug ? [slug] : undefined, cursor: undefined });
  const pageHref = (cursor: string | null) =>
    exploreHref({ ...query, cursor: cursor ?? undefined });
  const hasExtraFilters = summary.count > 0 || (query.sort && query.sort !== 'newest');

  const header = (
    <>
      <CoverageNotice coverage={coverage} />
      <SectorNav selected={sector} hrefFor={sectorHref} />
      <details className="rounded-md border border-border" data-testid="filters-panel">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-medium text-text">Filters</span>
            <span className="text-muted">
              {' '}
              · {summary.count ? summary.text : 'none'} · {SORT_LABEL[result.page.sort]}
            </span>
          </span>
          <span className="text-muted" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="border-t border-border p-3">
          <FilterForm
            action="/"
            values={{
              orientation: query.orientation?.map((o) => o.toLowerCase().replace(/_/g, '-')),
              outlet: query.outlet,
              language: query.language,
              period: query.period,
              from: query.from?.toISOString().slice(0, 10),
              to: query.to?.toISOString().slice(0, 10),
              sort: query.sort,
            }}
            hidden={{ country: query.country, sector: sector ?? undefined }}
            outlets={coverage.outlets.map((o) => ({ slug: o.slug, name: o.name }))}
            languages={coverage.languagesAvailable.map((code) => ({
              code,
              name: languageName(code),
            }))}
            resetHref={exploreHref({ country: query.country, sector: query.sector })}
          />
        </div>
      </details>
    </>
  );

  return (
    <CountrySheet
      key="sheet"
      iso2={coverage.country.iso2}
      title={coverage.country.name}
      subtitle={[
        coverage.country.subregion ?? coverage.country.region,
        `ISO ${coverage.country.iso2}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      closeHref={closeHref}
      contentKey={listKey}
      header={header}
    >
      {ignored.length || staleCursor ? (
        <p role="status" className="mt-3 rounded-md border border-warning/50 px-3 py-2 text-sm">
          {staleCursor
            ? 'That page link has expired, so the list starts again from the beginning. '
            : ''}
          {ignored.length
            ? `Some link parameters were invalid and were ignored (${ignored.join(', ')}).`
            : ''}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-muted" data-testid="ordering-note">
        {result.page.total} {result.page.total === 1 ? 'story' : 'stories'}
        {result.page.totalIsCapped ? '+' : ''} · {SORT_LABEL[result.page.sort]}. Ordered only by the
        rule you chose. No ranking by popularity or engagement.
      </p>
      {result.items.length === 0 ? (
        <div className="py-10 text-center text-muted" data-testid="empty-state">
          <p>No stories match {hasExtraFilters ? 'these filters' : 'here yet'}.</p>
          {hasExtraFilters ? (
            <p className="mt-2">
              <NavAnchor href={exploreHref({ country: query.country, sector: query.sector })}>
                Clear filters
              </NavAnchor>
            </p>
          ) : null}
        </div>
      ) : (
        <div data-testid="story-list">
          {result.items.map((a) => (
            <StoryCard key={a.id} article={a} />
          ))}
        </div>
      )}
      <Pagination page={result.page} hrefFor={pageHref} shownCount={result.items.length} />
      <div className="h-6" />
    </CountrySheet>
  );
}

/** An expired/foreign cursor (e.g. a stale bookmark) restarts the list instead of erroring. */
async function listWithCursorFallback(query: ArticleQuery, includeFixtures: boolean) {
  const prisma = getPrisma();
  try {
    return { result: await listArticles(prisma, query, { includeFixtures }), staleCursor: false };
  } catch (err) {
    if (!(err instanceof InvalidCursorError)) throw err;
    return {
      result: await listArticles(prisma, { ...query, cursor: undefined }, { includeFixtures }),
      staleCursor: true,
    };
  }
}
