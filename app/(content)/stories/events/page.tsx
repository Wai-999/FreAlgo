import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EventCard, EventPager } from '@/components/events/event-card';
import { getPrisma } from '@/lib/db/client';
import { decodeEventCursor, listEvents } from '@/lib/db/events';
import { getEnv } from '@/lib/env';
import type { RawSearchParams } from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';

export const metadata: Metadata = {
  title: 'Events',
  description: 'Reports grouped into events by shared headline wording, newest first.',
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Every event cluster, ordered by its latest report (never by size or attention). */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('stories') || !isEnabled('eventClustering')) notFound();
  const sp = await searchParams;
  const raw = one(sp.cursor);
  const cursor = raw && decodeEventCursor(raw) ? raw : null;
  const page = await listEvents(getPrisma(), {
    includeFixtures: getEnv().SHOW_FIXTURES,
    cursor,
    limit: 12,
  });
  const perspectives = isEnabled('perspectives');
  return (
    <>
      <p className="text-sm text-muted">
        <Link href="/stories">Stories</Link> <span aria-hidden="true">›</span> Events
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Events</h1>
      <p className="measure mt-2 text-muted">
        Reports grouped automatically because their headlines share distinctive wording. Each event
        keeps every report with its own headline, outlet and time. Ordered by the latest report,
        newest first; size and attention play no part.{' '}
        <Link href="/methodology#events">How grouping works</Link>.
      </p>
      {raw && !cursor ? (
        <p role="status" className="mt-3 rounded-md border border-warning/50 px-3 py-2 text-sm">
          That page link is invalid; showing the first page.
        </p>
      ) : null}
      <section aria-labelledby="events-h" className="mt-6">
        <h2 id="events-h" className="sr-only">
          Event list
        </h2>
        {page.items.length ? (
          <div data-testid="event-list">
            {page.items.map((e) => (
              <EventCard key={e.id} event={e} showPerspectives={perspectives} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-muted" data-testid="events-empty">
            No events yet. An event appears when at least two reports share distinctive headline
            wording within 72 hours.
          </p>
        )}
        <EventPager
          isFirst={!cursor}
          firstHref="/stories/events"
          nextHref={
            page.nextCursor ? `/stories/events?cursor=${encodeURIComponent(page.nextCursor)}` : null
          }
        />
      </section>
    </>
  );
}
