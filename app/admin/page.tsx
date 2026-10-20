import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/shell/site-footer';
import { Badge, FixtureBadge } from '@/components/ui/badge';
import { listSourcesForAdmin } from '@/lib/admin/service';
import { getAdminActor } from '@/lib/auth/admin';
import { getPrisma } from '@/lib/db/client';
import { FRESHNESS_LABEL, classifyFreshness } from '@/lib/db/freshness';
import { formatAge, formatUtc } from '@/lib/format';
import {
  activateSourceAction,
  articleStatusAction,
  pauseSourceAction,
  refetchSourceAction,
  resetCircuitAction,
  resolveQuarantineAction,
} from './actions';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

const btn = 'min-h-11 rounded-md border border-border-strong px-3 text-sm hover:bg-surface-raised';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await getAdminActor();
  if (!actor) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-3 text-muted">
          Administrator access required. <Link href="/account">Sign in</Link> with an account listed
          in <code>ADMIN_USER_IDS</code>.
        </p>
      </main>
    );
  }
  const sp = await searchParams;
  const prisma = getPrisma();
  const [sources, quarantine, quarantinedArticles, runs, auditLog, appeals] = await Promise.all([
    listSourcesForAdmin(prisma),
    prisma.ingestionQuarantine.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { feedSource: { select: { url: true } } },
    }),
    prisma.article.findMany({
      where: { status: 'QUARANTINED' },
      orderBy: { firstSeenAt: 'desc' },
      take: 25,
    }),
    prisma.ingestionRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
      include: { feedSource: { select: { outlet: { select: { name: true } } } } },
    }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.labelAppeal.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { outlet: { select: { name: true, slug: true } } },
    }),
  ]);

  return (
    <>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 space-y-10 px-4 py-8 lg:px-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Admin console</h1>
          <p className="text-muted">
            Signed in as {actor}. Every action below is written to the audit log.
          </p>
          {sp.ok ? (
            <p role="status" className="mt-3 rounded-md border border-success/60 p-3 text-success">
              {sp.ok}
            </p>
          ) : null}
          {sp.error ? (
            <p role="alert" className="mt-3 rounded-md border border-danger/60 p-3 text-danger">
              {sp.error}
            </p>
          ) : null}
        </header>

        <section aria-labelledby="sources-h">
          <h2 id="sources-h" className="mb-3 text-xl font-semibold">
            Sources ({sources.length})
          </h2>
          <ul className="space-y-3">
            {sources.map((s) => {
              const state = classifyFreshness(s);
              return (
                <li
                  key={s.id}
                  className="rounded-lg border border-border bg-surface p-4"
                  data-testid="admin-source"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{s.outlet.name}</strong>
                    <span className="text-sm text-muted">{s.outlet.country?.name}</span>
                    {s.isFixture ? <FixtureBadge /> : null}
                    <Badge>{s.status}</Badge>
                    <Badge>{FRESHNESS_LABEL[state]}</Badge>
                    <Badge>{s._count.articles} articles</Badge>
                    {s.failureCount ? (
                      <Badge tone="danger">{s.failureCount} consecutive failures</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm break-all text-muted">{s.url}</p>
                  <p className="mt-1 text-xs text-muted">
                    Last attempt {formatAge(s.lastAttemptAt)} · last success{' '}
                    {formatAge(s.lastSuccessfulSyncAt)} · terms{' '}
                    {s.termsReviewedAt
                      ? `reviewed ${formatUtc(s.termsReviewedAt)}`
                      : 'not reviewed'}
                    {s.lastError ? ` · ${s.lastError}` : ''}
                  </p>
                  {!s.isFixture ? (
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      {s.status !== 'ACTIVE' ? (
                        <details className="rounded-md border border-border p-2">
                          <summary className="cursor-pointer text-sm">Activate…</summary>
                          <form action={activateSourceAction} className="mt-2 space-y-2">
                            <input type="hidden" name="id" value={s.id} />
                            <label className="block text-sm">
                              Terms review notes{' '}
                              {s.termsReviewedAt ? '(optional, already reviewed)' : '(required)'}
                              <textarea
                                name="licenseNotes"
                                required={!s.termsReviewedAt}
                                minLength={10}
                                rows={2}
                                className="mt-1 w-full rounded-md border border-border-strong bg-bg p-2"
                              />
                            </label>
                            <label className="block text-sm">
                              Terms URL
                              <input
                                name="termsUrl"
                                type="url"
                                className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-bg px-2"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                name="excerptAllowed"
                                defaultChecked={s.excerptAllowed}
                                className="size-5"
                              />{' '}
                              Terms allow showing feed summaries
                            </label>
                            <button className={btn} type="submit">
                              Record review &amp; activate
                            </button>
                          </form>
                        </details>
                      ) : (
                        <form action={pauseSourceAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className={btn} type="submit">
                            Pause
                          </button>
                        </form>
                      )}
                      <form action={refetchSourceAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className={btn} type="submit">
                          Re-fetch now
                        </button>
                      </form>
                      {s.failureCount > 0 || s.status === 'ERROR' ? (
                        <form action={resetCircuitAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className={btn} type="submit">
                            Reset circuit
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="appeals-h">
          <h2 id="appeals-h" className="mb-3 text-xl font-semibold">
            Open label appeals ({appeals.length})
          </h2>
          {appeals.length === 0 ? (
            <p className="text-muted">None.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {appeals.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3">
                  <Link href={`/sources/${a.outlet.slug}`}>{a.outlet.name}</Link>,{' '}
                  {formatUtc(a.createdAt)}
                  <p className="mt-1 whitespace-pre-wrap text-muted">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="q-h">
          <h2 id="q-h" className="mb-3 text-xl font-semibold">
            Quarantine ({quarantine.length} items, {quarantinedArticles.length} articles)
          </h2>
          <ul className="space-y-2 text-sm">
            {quarantine.map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <Badge tone="warning">{q.reason}</Badge>
                <span className="text-muted">{q.detail}</span>
                <span className="text-xs break-all text-muted">
                  {q.itemUrl ?? q.feedSource.url}
                </span>
                <form action={resolveQuarantineAction} className="ml-auto">
                  <input type="hidden" name="id" value={q.id} />
                  <button className={btn} type="submit">
                    Dismiss
                  </button>
                </form>
              </li>
            ))}
            {quarantinedArticles.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <Badge tone="warning">{a.statusReason ?? 'quarantined'}</Badge>
                <span>{a.title}</span>
                <span className="text-xs text-muted">raw date: {a.publishedAtRaw ?? '—'}</span>
                <form action={articleStatusAction} className="ml-auto flex gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="reason" value="Reviewed in admin console" />
                  <button className={btn} type="submit" name="status" value="PUBLISHED">
                    Release
                  </button>
                  <button className={btn} type="submit" name="status" value="REMOVED">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="runs-h">
          <h2 id="runs-h" className="mb-3 text-xl font-semibold">
            Recent ingestion runs
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Outlet</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Fetched / new / updated / quarantined</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{formatUtc(r.startedAt)}</td>
                    <td className="px-3 py-2">{r.feedSource.outlet.name}</td>
                    <td className="px-3 py-2">
                      {r.trigger} #{r.attempt}
                    </td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">
                      {r.fetchedCount} / {r.insertedCount} / {r.updatedCount} / {r.quarantinedCount}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.errorCode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="audit-h">
          <h2 id="audit-h" className="mb-3 text-xl font-semibold">
            Audit log
          </h2>
          <ul className="space-y-1 font-mono text-xs text-muted">
            {auditLog.map((a) => (
              <li key={a.id}>
                {formatUtc(a.createdAt)} {a.actor} {a.action} {a.targetType}:{a.targetId}
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
