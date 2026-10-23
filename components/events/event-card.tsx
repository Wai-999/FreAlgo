import Link from 'next/link';
import { FixtureBadge } from '@/components/ui/badge';
import type { EventSummary } from '@/lib/db/events';
import { formatUtc, languageName } from '@/lib/format';

/**
 * One event cluster in a list. The heading is a member's own headline, attributed to its outlet;
 * FreAlgo adds only counts, dates and the evidence (shared words, named countries).
 */
export function EventCard({
  event,
  headingLevel = 3,
  showPerspectives = false,
}: {
  event: EventSummary;
  headingLevel?: 2 | 3;
  showPerspectives?: boolean;
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article
      className="border-b border-border py-4 last:border-b-0"
      data-testid="event-card"
      data-event={event.slug}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {event.reports} reports from {event.outlets} {event.outlets === 1 ? 'outlet' : 'outlets'}
        </span>
        <span aria-hidden="true">·</span>
        <span>{languageName(event.language)}</span>
        {event.isFixture ? <FixtureBadge /> : null}
      </div>
      <H className="mt-1 text-lg leading-snug font-medium">
        <Link href={`/stories/${event.slug}`} prefetch={false} className="text-text">
          {event.title}
        </Link>
      </H>
      <p className="mt-1 text-sm text-muted">
        Headline as published{event.titleOutlet ? ` by ${event.titleOutlet}` : ''}. Reports from{' '}
        <time dateTime={event.startAt}>{formatUtc(event.startAt)}</time> to{' '}
        <time dateTime={event.lastAt}>{formatUtc(event.lastAt)}</time>.
      </p>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Outlets</dt>
        <dd>{event.outletNames.join(', ')}</dd>
        {event.countries.length ? (
          <>
            <dt className="text-muted">Countries named</dt>
            <dd>{event.countries.map((c) => c.name).join(', ')}</dd>
          </>
        ) : null}
        {event.sharedTerms.length ? (
          <>
            <dt className="text-muted">Shared wording</dt>
            <dd>{event.sharedTerms.slice(0, 8).join(', ')}</dd>
          </>
        ) : null}
      </dl>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={`/stories/${event.slug}`} prefetch={false}>
          Story Mode
        </Link>
        {showPerspectives && event.outlets >= 2 ? (
          <Link href={`/perspectives/${event.slug}`} prefetch={false}>
            Compare outlets
          </Link>
        ) : null}
      </p>
    </article>
  );
}

/** Finite event pages: Next and First page links, and an explicit end. */
export function EventPager({
  nextHref,
  firstHref,
  isFirst,
}: {
  nextHref: string | null;
  firstHref: string;
  isFirst: boolean;
}) {
  const linkClass =
    'inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm no-underline text-text hover:bg-surface-raised';
  return (
    <nav aria-label="Pages" className="mt-6 space-y-3" data-testid="event-pagination">
      {!nextHref ? (
        <p className="rounded-md border border-border px-3 py-3 text-sm text-muted">
          That is every event in this list.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {isFirst ? (
          <span />
        ) : (
          <Link href={firstHref} prefetch={false} className={linkClass}>
            First page
          </Link>
        )}
        {nextHref ? (
          <Link href={nextHref} prefetch={false} className={linkClass} rel="next">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
