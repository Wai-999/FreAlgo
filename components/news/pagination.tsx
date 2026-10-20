import type { ArticleListResult } from '@/lib/search/articles';
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from '@/components/ui/icons';
import { NavAnchor } from './nav-anchor';

/**
 * Finite, explicit pagination: Previous / Next links and a deliberate end state.
 * There is no infinite scroll and no "load more" that appends forever.
 */
export function Pagination({
  page,
  hrefFor,
  shownCount,
}: {
  page: ArticleListResult['page'];
  hrefFor: (cursor: string | null) => string;
  shownCount: number;
}) {
  const pages = Math.max(1, Math.ceil(page.total / page.limit));
  const start = (page.number - 1) * page.limit + (shownCount ? 1 : 0);
  const end = (page.number - 1) * page.limit + shownCount;
  const caughtUp = !page.nextCursor;
  const linkClass =
    'inline-flex min-h-11 items-center gap-1 rounded-md border border-border-strong px-3 text-sm no-underline text-text hover:bg-surface-raised';

  return (
    <nav aria-label="Pages" className="mt-6 space-y-4" data-testid="pagination">
      {caughtUp && page.total > 0 ? (
        <p
          className="flex items-center gap-2 rounded-md border border-border px-3 py-3 text-sm text-muted"
          data-testid="caught-up"
        >
          <CheckIcon className="text-success" />
          You are caught up. That is every story matching these filters.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {page.prevCursor ? (
          <NavAnchor href={hrefFor(page.prevCursor)} className={linkClass} rel="prev">
            <ChevronLeftIcon /> Previous
          </NavAnchor>
        ) : page.number > 1 ? (
          <NavAnchor href={hrefFor(null)} className={linkClass}>
            <ChevronLeftIcon /> First page
          </NavAnchor>
        ) : (
          <span />
        )}
        <p className="text-sm text-muted" aria-live="polite">
          {page.total === 0
            ? 'No stories'
            : `Page ${page.number} of ${page.totalIsCapped ? `${pages}+` : pages} · stories ${start}–${end} of ${page.totalIsCapped ? `${page.total}+` : page.total}`}
        </p>
        {page.nextCursor ? (
          <NavAnchor href={hrefFor(page.nextCursor)} className={linkClass} rel="next">
            Next <ChevronRightIcon />
          </NavAnchor>
        ) : (
          <span />
        )}
      </div>
    </nav>
  );
}
