import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { getPrisma } from '@/lib/db/client';
import { FRESHNESS_LABEL, getFreshnessReport, type FreshnessState } from '@/lib/db/freshness';
import { getEnv } from '@/lib/env';
import { formatAge, formatUtc } from '@/lib/format';

export const metadata: Metadata = { title: 'Feed freshness' };

const TONE: Record<FreshnessState, 'success' | 'danger' | 'warning' | 'neutral'> = {
  fresh: 'success',
  stale: 'danger',
  error: 'danger',
  'never-synced': 'warning',
  paused: 'neutral',
  fixture: 'neutral',
};

export default async function StatusPage() {
  const report = await getFreshnessReport(getPrisma(), { includeFixtures: getEnv().SHOW_FIXTURES });
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Feed freshness</h1>
      <p className="measure mt-3 text-muted">
        The worker <strong className="text-text">attempts</strong> to fetch every active feed every
        3 hours (cron <code>{report.schedule.cron}</code>, UTC). An attempt does not guarantee new
        stories. Times below are what actually happened. A source is <em>stale</em> when it has had
        no successful sync for two intervals. Last scheduled run:{' '}
        <strong className="text-text">
          {report.lastScheduledRunAt
            ? `${formatUtc(report.lastScheduledRunAt)} (${formatAge(report.lastScheduledRunAt)})`
            : 'none recorded yet'}
        </strong>
        .
      </p>
      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Summary">
        {(Object.entries(report.summary) as [FreshnessState, number][]).map(([state, n]) => (
          <li key={state}>
            <Badge tone={TONE[state]}>
              {FRESHNESS_LABEL[state]}: {n}
            </Badge>
          </li>
        ))}
      </ul>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Per-source freshness</caption>
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Source
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Country
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                State
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Last attempt
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Last success
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Last error
              </th>
            </tr>
          </thead>
          <tbody>
            {report.sources.map((s) => (
              <tr key={s.id} className="border-t border-border" data-testid="freshness-row">
                <td className="px-3 py-2">
                  <Link href={`/sources/${s.outlet.slug}`}>{s.outlet.name}</Link>
                  <div className="text-xs text-muted">{s.feedName}</div>
                </td>
                <td className="px-3 py-2 text-muted">{s.country?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge tone={TONE[s.freshness]}>{FRESHNESS_LABEL[s.freshness]}</Badge>
                </td>
                <td className="px-3 py-2 text-muted">{formatAge(s.lastAttemptAt)}</td>
                <td className="px-3 py-2 text-muted">{formatAge(s.lastSuccessfulSyncAt)}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted">{s.lastErrorCode ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-muted">
        Machine-readable: <Link href="/api/v1/health/freshness">/api/v1/health/freshness</Link>
      </p>
    </div>
  );
}
