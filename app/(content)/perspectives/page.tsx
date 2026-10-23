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
  title: 'Perspectives',
  description: 'Compare how different outlets reported the same event, with labelled sources.',
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const DISTINCTIONS = [
  [
    'Outlet orientation',
    'A label on the outlet, with its status, methodology, source and review date. It is not a rating of any one story.',
  ],
  [
    'News, opinion or analysis',
    'Shown only when the publisher says so. Most feeds do not, and those pieces are marked unknown.',
  ],
  [
    'Article framing',
    'Not classified. FreAlgo shows the words each outlet chose rather than judging its framing.',
  ],
  [
    'National political vocabulary',
    'Left and right mean different things in different countries. Each label names its national context.',
  ],
  [
    'Unknown or disputed',
    'Unrated means not assessed, not neutral. Disputed labels say so and link to the disagreement.',
  ],
] as const;

/** Perspectives (FreAlgo 2.0, spec §3): events reported by at least two outlets. */
export default async function PerspectivesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('perspectives') || !isEnabled('eventClustering')) notFound();
  const sp = await searchParams;
  const raw = one(sp.cursor);
  const cursor = raw && decodeEventCursor(raw) ? raw : null;
  const page = await listEvents(getPrisma(), {
    includeFixtures: getEnv().SHOW_FIXTURES,
    cursor,
    limit: 12,
    minOutlets: 2,
  });
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Perspectives</h1>
      <p className="measure mt-2 text-muted">
        See how different outlets reported the same event, side by side. FreAlgo shows each outlet’s
        own headlines and its source label with provenance. It does not verify facts, judge framing
        or decide who is right.
      </p>
      <section aria-labelledby="distinctions-h" className="mt-6">
        <h2 id="distinctions-h" className="text-lg font-semibold">
          What is compared, and what is not
        </h2>
        <dl className="measure mt-2 space-y-2 text-sm">
          {DISTINCTIONS.map(([term, text]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm">
          <Link href="/methodology#perspectives">How Perspectives work</Link> ·{' '}
          <Link href="/methodology#labels">How outlet labels work</Link>
        </p>
      </section>
      <section aria-labelledby="comparable-h" className="mt-8">
        <h2 id="comparable-h" className="text-lg font-semibold">
          Events reported by two or more outlets
        </h2>
        {raw && !cursor ? (
          <p role="status" className="mt-3 rounded-md border border-warning/50 px-3 py-2 text-sm">
            That page link is invalid; showing the first page.
          </p>
        ) : null}
        {page.items.length ? (
          <div data-testid="event-list">
            {page.items.map((e) => (
              <EventCard key={e.id} event={e} showPerspectives />
            ))}
          </div>
        ) : (
          <p className="py-6 text-muted" data-testid="events-empty">
            No event in FreAlgo’s sources has reports from two or more outlets yet. That says
            something about FreAlgo’s coverage, not about the news.
          </p>
        )}
        <EventPager
          isFirst={!cursor}
          firstHref="/perspectives"
          nextHref={
            page.nextCursor ? `/perspectives?cursor=${encodeURIComponent(page.nextCursor)}` : null
          }
        />
      </section>
    </>
  );
}
