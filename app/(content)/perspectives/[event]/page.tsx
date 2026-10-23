import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SourceLabel } from '@/components/news/source-label';
import { Badge, FixtureBadge } from '@/components/ui/badge';
import { ExternalIcon } from '@/components/ui/icons';
import { getPrisma } from '@/lib/db/client';
import { corpusOutlets, getEvent } from '@/lib/db/events';
import { buildPerspectives, type OutletColumn } from '@/lib/events/perspectives';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';
import { formatUtc } from '@/lib/format';
import { safeHref } from '@/lib/security/safe-url';

type Params = Promise<{ event: string }>;

async function load(slug: string) {
  if (!isEnabled('perspectives') || !isEnabled('eventClustering')) return null;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const includeFixtures = getEnv().SHOW_FIXTURES;
  const detail = await getEvent(getPrisma(), slug, { includeFixtures });
  if (!detail) return null;
  return buildPerspectives(detail, await corpusOutlets(getPrisma(), { includeFixtures }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load((await params).event);
  return p
    ? { title: `Perspectives: ${p.event.title}`, description: 'Outlets side by side.' }
    : { title: 'Event not found' };
}

const TYPE_TEXT = { NEWS: 'news', OPINION: 'opinion', ANALYSIS: 'analysis', UNKNOWN: 'unknown' };

function typeSummary(t: OutletColumn['types']): string {
  return (Object.keys(TYPE_TEXT) as (keyof typeof TYPE_TEXT)[])
    .filter((k) => t[k])
    .map((k) => `${t[k]} ${TYPE_TEXT[k]}`)
    .join(', ');
}

/**
 * Perspective Explorer (FreAlgo 2.0, spec §3): the same event, outlet by outlet. Columns are in
 * order of each outlet's first report; nothing is ranked, scored or declared correct.
 */
export default async function PerspectiveEventPage({ params }: { params: Params }) {
  const p = await load((await params).event);
  if (!p) notFound();
  const { event, columns } = p;
  return (
    <article>
      <p className="text-sm text-muted">
        <Link href="/perspectives">Perspectives</Link> <span aria-hidden="true">›</span> Compare
        outlets
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
      <p className="measure mt-2 text-muted">
        Headline as published{event.titleOutlet ? ` by ${event.titleOutlet}` : ''}. {event.reports}{' '}
        reports from {event.outlets} {event.outlets === 1 ? 'outlet' : 'outlets'}, shown in order of
        each outlet’s first report. <Link href={`/stories/${event.slug}`}>Open Story Mode</Link>.
      </p>
      {event.isFixture ? (
        <p className="mt-2">
          <FixtureBadge />
        </p>
      ) : null}

      <section aria-labelledby="shared-h" className="mt-8">
        <h2 id="shared-h" className="text-xl font-semibold">
          Shared wording
        </h2>
        <p className="measure mt-1 text-sm text-muted">
          Words used by at least half of the headlines. Shared wording is not a verified fact:
          FreAlgo does not check what the outlets agree on.
        </p>
        <p className="mt-2 text-sm" data-testid="shared-wording">
          {p.sharedWording.length ? p.sharedWording.join(', ') : 'None.'}
        </p>
      </section>

      <section aria-labelledby="side-h" className="mt-8">
        <h2 id="side-h" className="text-xl font-semibold">
          Side by side
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2" data-testid="perspective-columns">
          {columns.map((c) => (
            <section
              key={c.outlet.id}
              aria-labelledby={`outlet-${c.outlet.id}`}
              className="min-w-0 rounded-lg border border-border bg-surface p-4"
              data-testid="perspective-column"
            >
              <h3 id={`outlet-${c.outlet.id}`} className="text-lg font-medium">
                {c.outlet.name}
              </h3>
              <p className="text-sm text-muted">
                {c.outlet.country ? `Based in ${c.outlet.country.name}. ` : ''}
                {c.reports.length} {c.reports.length === 1 ? 'piece' : 'pieces'}:{' '}
                {typeSummary(c.types)}.
              </p>
              <div className="mt-3">
                <SourceLabel
                  compact
                  outletName={c.outlet.name}
                  label={{
                    orientation: c.outlet.label.orientation,
                    labelStatus: c.outlet.label.status,
                    labelConfidence: c.outlet.label.confidence,
                    ideologyTags: c.outlet.label.ideologyTags,
                    labelMethodology: c.outlet.label.methodology,
                    labelSourceUrl: c.outlet.label.sourceUrl,
                    labelReviewedAt: c.outlet.label.reviewedAt,
                    labelContext: c.outlet.label.context,
                    labelIsMachine: c.outlet.label.isMachine,
                  }}
                />
              </div>
              <ol className="mt-3 space-y-3">
                {c.reports.map((r) => {
                  const href = safeHref(r.url);
                  return (
                    <li key={r.id}>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <time dateTime={r.publishedAt}>{formatUtc(r.publishedAt)}</time>
                        {r.articleType === 'OPINION' || r.articleType === 'ANALYSIS' ? (
                          <Badge tone="info">
                            {r.articleType === 'OPINION' ? 'Opinion' : 'Analysis'}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {r.title}
                            <ExternalIcon className="ml-1 inline-block size-4 align-baseline text-muted" />
                            <span className="sr-only"> (opens the original in a new tab)</span>
                          </a>
                        ) : (
                          r.title
                        )}
                      </p>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-sm">
                <span className="text-muted">Wording only this outlet used: </span>
                {c.distinctWording.length ? c.distinctWording.join(', ') : 'none'}
              </p>
            </section>
          ))}
        </div>
      </section>

      <section aria-labelledby="claims-h" className="mt-8">
        <h2 id="claims-h" className="text-xl font-semibold">
          Claims in dispute
        </h2>
        <p className="measure mt-2 text-sm" data-testid="claims">
          {p.claimsInDispute.note}
        </p>
      </section>

      <section aria-labelledby="gaps-h" className="mt-8">
        <h2 id="gaps-h" className="text-xl font-semibold">
          Coverage gaps in FreAlgo’s sources
        </h2>
        <p className="measure mt-1 text-sm text-muted">
          Measured against the {p.corpus.outlets} outlets with reports in FreAlgo in the last{' '}
          {p.corpus.days} days. A gap here is a gap in what FreAlgo ingests, not proof that a
          perspective does not exist: other outlets may have covered this event.
        </p>
        {p.gaps.length ? (
          <ul className="measure mt-2 list-disc space-y-1 pl-5 text-sm" data-testid="gaps">
            {p.gaps.map((g) => (
              <li key={g.message}>{g.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No gaps that FreAlgo can measure.</p>
        )}
      </section>

      <section aria-labelledby="labels-h" className="mt-8">
        <h2 id="labels-h" className="text-xl font-semibold">
          Labels in this comparison
        </h2>
        <ul className="mt-2 space-y-1 text-sm" data-testid="label-summary">
          {p.labels.orientations.map((o) => (
            <li key={o.orientation}>
              {o.label}: {o.outlets} {o.outlets === 1 ? 'outlet' : 'outlets'}
            </li>
          ))}
          <li>
            Not rated: {p.labels.unrated}. Disputed: {p.labels.disputed}. Machine-generated:{' '}
            {p.labels.machine}.
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted">
          Labels describe outlets, not these reports.{' '}
          <Link href="/methodology#labels">Label methodology</Link>.
        </p>
      </section>
    </article>
  );
}
