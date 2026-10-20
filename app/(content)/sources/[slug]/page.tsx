import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SourceLabel } from '@/components/news/source-label';
import { Badge, FixtureBadge } from '@/components/ui/badge';
import { getPrisma } from '@/lib/db/client';
import { classifyFreshness, FRESHNESS_LABEL } from '@/lib/db/freshness';
import { getOutletLabelHistory } from '@/lib/db/outlets';
import { ORIENTATION_INFO, LABEL_STATUS_INFO } from '@/lib/domain/orientation';
import { formatAge, formatUtc, languageName } from '@/lib/format';
import { safeHref } from '@/lib/security/safe-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Source: ${slug}` };
}

export default async function OutletPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const prisma = getPrisma();
  const outlet = await prisma.mediaOutlet.findUnique({
    where: { slug },
    include: { country: true, feeds: { orderBy: { url: 'asc' } } },
  });
  if (!outlet) notFound();
  const history = await getOutletLabelHistory(prisma, outlet.id);

  return (
    <article className="space-y-8">
      <header>
        <p className="text-sm text-muted">
          <Link href="/sources">Source registry</Link> / {outlet.slug}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{outlet.name}</h1>
          {outlet.isFixture ? <FixtureBadge /> : null}
        </div>
        <p className="mt-2 text-muted">
          {outlet.country?.name ?? 'No country'} · {languageName(outlet.primaryLanguage)} ·{' '}
          <a
            href={safeHref(outlet.homepageUrl) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Publisher homepage
          </a>
        </p>
        {outlet.ownershipNotes ? (
          <p className="mt-1 text-sm text-muted">Ownership: {outlet.ownershipNotes}</p>
        ) : null}
      </header>

      <section aria-labelledby="label-h">
        <h2 id="label-h" className="mb-3 text-xl font-semibold">
          Orientation label
        </h2>
        <SourceLabel label={outlet} outletName={outlet.name} />
      </section>

      <section aria-labelledby="feeds-h">
        <h2 id="feeds-h" className="mb-3 text-xl font-semibold">
          Feeds &amp; freshness
        </h2>
        <ul className="space-y-3">
          {outlet.feeds.map((f) => {
            const state = classifyFreshness(f);
            return (
              <li key={f.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{f.name ?? f.url}</p>
                <p className="break-all text-muted">{f.url}</p>
                <p className="mt-2 flex flex-wrap gap-2">
                  <Badge
                    tone={
                      state === 'fresh'
                        ? 'success'
                        : state === 'error' || state === 'stale'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {FRESHNESS_LABEL[state]}
                  </Badge>
                  <Badge>Last attempt: {formatAge(f.lastAttemptAt)}</Badge>
                  <Badge>Last success: {formatAge(f.lastSuccessfulSyncAt)}</Badge>
                  <Badge>{f.excerptAllowed ? 'Excerpts shown' : 'Headlines only'}</Badge>
                  <Badge>
                    {f.termsReviewedAt
                      ? `Terms reviewed ${formatUtc(f.termsReviewedAt).slice(0, 10)}`
                      : 'Terms not yet reviewed'}
                  </Badge>
                </p>
                {f.licenseNotes ? (
                  <p className="mt-2 text-muted">Usage notes: {f.licenseNotes}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-3 text-xl font-semibold">
          Label history
        </h2>
        {history.length === 0 ? (
          <p className="text-muted">No history recorded.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border border-border p-3">
                <span className="text-text">{formatUtc(h.createdAt)}</span>:{' '}
                {ORIENTATION_INFO[h.orientation].label} ({LABEL_STATUS_INFO[h.labelStatus].label}),
                by {h.changedBy}
                {h.changeReason ? `. ${h.changeReason}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="appeal" className="measure">
        <h2 id="appeal" className="mb-2 text-xl font-semibold">
          Report a label issue
        </h2>
        {sp.appeal === 'received' ? (
          <p role="status" className="rounded-md border border-success/60 p-3 text-success">
            Thank you. Your appeal was recorded and will be reviewed against the cited methodology.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Explain what is wrong and cite evidence if you can. Email is optional and is deleted 30
          days after the appeal is resolved.
        </p>
        <form method="post" action="/api/v1/label-appeals" className="mt-3 space-y-3">
          <input type="hidden" name="outletSlug" value={outlet.slug} />
          <div className="hidden" aria-hidden="true">
            <label>
              Website <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-text">What should change, and why?</span>
            <textarea
              name="message"
              required
              minLength={20}
              maxLength={4000}
              rows={4}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-base text-text"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text">Email (optional)</span>
            <input
              type="email"
              name="contactEmail"
              autoComplete="email"
              className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-md border border-accent px-4 text-text hover:bg-surface-raised"
          >
            Send appeal
          </button>
        </form>
      </section>
    </article>
  );
}
