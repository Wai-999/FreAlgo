import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CuratedKind } from '@/components/events/curated-kind';
import { FixtureBadge } from '@/components/ui/badge';
import { getPrisma } from '@/lib/db/client';
import { getJourney, type JourneyStep } from '@/lib/db/journeys';
import { getEnv } from '@/lib/env';
import type { RawSearchParams } from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';
import { formatUtc } from '@/lib/format';
import { safeHref } from '@/lib/security/safe-url';

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  if (!isEnabled('journeys') || !/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  return getJourney(getPrisma(), slug, { includeFixtures: getEnv().SHOW_FIXTURES });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const j = await load((await params).slug);
  return j ? { title: j.title, description: j.description } : { title: 'Journey not found' };
}

function Step({ step, total }: { step: JourneyStep; total: number }) {
  return (
    <>
      <p className="text-sm text-muted">
        Step {step.position} of {total}
        {step.country ? ` · ${step.country.name}` : ''}
      </p>
      <h2 className="mt-1 text-xl font-semibold">{step.title}</h2>
      <p className="measure mt-2">
        <CuratedKind kind={step.kind} /> {step.explanation}
      </p>
      {step.uncertainty ? (
        <p className="measure mt-2 text-sm">
          <span className="font-medium">Uncertain: </span>
          {step.uncertainty}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-muted">
        Evidence:{' '}
        <a href={safeHref(step.evidenceUrl) ?? undefined} rel="noopener noreferrer">
          {step.evidenceName}
        </a>
        {step.occurredAt ? ` · ${formatUtc(step.occurredAt)}` : ''}
        {step.event ? (
          <>
            {' · '}
            <Link href={`/stories/${step.event.slug}`}>Related event</Link>
          </>
        ) : null}
        {step.country ? (
          <>
            {' · '}
            <Link href={`/?country=${step.country.iso2}`}>Stories about {step.country.name}</Link>
          </>
        ) : null}
      </p>
    </>
  );
}

/**
 * A Story Journey (FreAlgo 2.0, spec §3). Server-rendered and motion-free: the guided view moves
 * one step per click (Previous / Next / Skip to the full list), and the full list is the
 * plain-text alternative. Nothing advances on a timer, so there is nothing to pause.
 */
export default async function JourneyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<RawSearchParams>;
}) {
  const j = await load((await params).slug);
  if (!j) notFound();
  const sp = await searchParams;
  const raw = Array.isArray(sp.step) ? sp.step[0] : sp.step;
  const n = raw && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
  const current = n && n >= 1 && n <= j.steps.length ? j.steps[n - 1]! : null;
  const base = `/discover/journeys/${j.slug}`;
  const linkClass =
    'inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm no-underline text-text hover:bg-surface-raised';

  return (
    <article>
      <p className="text-sm text-muted">
        <Link href="/discover">Discover</Link> <span aria-hidden="true">›</span> Story Journey
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{j.title}</h1>
      <p className="measure mt-2 text-muted">{j.description}</p>
      {j.isFixture ? (
        <p className="mt-2">
          <FixtureBadge />
        </p>
      ) : null}
      <p
        className="measure mt-3 rounded-md border border-border px-3 py-2 text-sm"
        data-testid="journey-caveats"
      >
        <span className="font-medium">Before you start: </span>
        {j.caveats} Curated by {j.curatedBy}; reviewed {formatUtc(j.reviewedAt)}.
      </p>

      {current ? (
        <section aria-live="polite" className="mt-8" data-testid="journey-step">
          <Step step={current} total={j.steps.length} />
          <nav aria-label="Journey steps" className="mt-6 flex flex-wrap gap-3">
            {current.position > 1 ? (
              <Link href={`${base}?step=${current.position - 1}`} className={linkClass} rel="prev">
                Previous step
              </Link>
            ) : null}
            {current.position < j.steps.length ? (
              <Link href={`${base}?step=${current.position + 1}`} className={linkClass} rel="next">
                Next step
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center text-sm text-muted">
                That is the last step.
              </span>
            )}
            <Link href={base} className={linkClass}>
              Skip to the full list
            </Link>
          </nav>
        </section>
      ) : (
        <>
          <p className="mt-6">
            <Link href={`${base}?step=1`} className={linkClass}>
              Go step by step
            </Link>
          </p>
          <ol className="mt-6 space-y-8" data-testid="journey-list">
            {j.steps.map((s) => (
              <li key={s.position}>
                <Step step={s} total={j.steps.length} />
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}
