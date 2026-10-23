import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { getPrisma } from '@/lib/db/client';
import { FRESHNESS_LABEL, getFreshnessReport, type FreshnessState } from '@/lib/db/freshness';
import { getEnv } from '@/lib/env';
import { getSourceQuality, type SourceQuality } from '@/lib/db/quality';
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

const pct = (x: number) => `${Math.round(x * 100)} %`;
const orDash = (x: number | null, unit: string) => (x === null ? '—' : `${x} ${unit}`);

/** Measured source-quality figures, each with its window (spec §12 dashboard). */
function qualityRows(q: SourceQuality): [string, string, string][] {
  const langs = Object.entries(q.articles7d.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l} ${n}`)
    .join(', ');
  return [
    [
      'Enabled sources',
      `${q.sources.enabled}`,
      `${q.sources.reachable} reachable at last attempt; ${q.sources.failing} failing; ${q.sources.paused} paused`,
    ],
    [
      'Countries with stories about them',
      `${q.coverage.countriesAbout24h} (24 h) · ${q.coverage.countriesAbout7d} (7 days)`,
      `Publishers’ home countries are not counted. Enabled sources are based in ${q.coverage.countriesWithEnabledSource} countries.`,
    ],
    [
      'Stories, last 7 days',
      `${q.articles7d.total}`,
      langs ? `By language: ${langs}` : 'No stories in this window',
    ],
    [
      'Duplicate ratio',
      pct(q.articles7d.duplicateRatio),
      'Stories whose headline and excerpt also appear on another stored story',
    ],
    [
      'Not linked to any country',
      pct(q.articles7d.withoutAboutCountry),
      'No country named in the headline or excerpt and no feed scope',
    ],
    [
      'No sector',
      pct(q.articles7d.withoutSector),
      'No sector rule, category or feed default applied',
    ],
    [
      'Type not signalled',
      pct(q.articles7d.typeUnknown),
      'Publisher gave no opinion/analysis signal (normal for most news)',
    ],
    [
      'Newest story per source',
      `median ${orDash(q.freshness.newestArticleAgeHoursP50, 'h')} · p90 ${orDash(q.freshness.newestArticleAgeHoursP90, 'h')}`,
      'Age of each enabled source’s newest story',
    ],
    [
      'Time to visible',
      `median ${orDash(q.freshness.timeToVisibleMinutesP50, 'min')} · p90 ${orDash(q.freshness.timeToVisibleMinutesP90, 'min')}`,
      'From publication to first seen by FreAlgo (feeds are fetched every 3 hours)',
    ],
    [
      'Fetch runs, last 24 h',
      `${q.ingestion24h.runs}`,
      `${q.ingestion24h.failed} failed; ${q.ingestion24h.retried} were retries`,
    ],
  ];
}

export default async function StatusPage() {
  const opts = { includeFixtures: getEnv().SHOW_FIXTURES };
  const [report, quality] = await Promise.all([
    getFreshnessReport(getPrisma(), opts),
    getSourceQuality(getPrisma(), opts),
  ]);
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
      <h2 id="quality" className="mt-10 text-xl font-semibold">
        Source quality
      </h2>
      <p className="measure mt-2 text-sm text-muted">
        Measured from stored stories at {formatUtc(quality.generatedAt)}. These describe what
        FreAlgo has ingested, not the world: a country with no stories here may still have plenty of
        news. Also available as JSON at <code>/api/v1/sources/health</code>.
      </p>
      <div
        className="mt-3 overflow-x-auto rounded-lg border border-border"
        role="region"
        aria-label="Source quality"
        tabIndex={0}
      >
        <table className="w-full min-w-[560px] text-left text-sm" data-testid="source-quality">
          <caption className="sr-only">Source quality measures</caption>
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Measure
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Value
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                What it means
              </th>
            </tr>
          </thead>
          <tbody>
            {qualityRows(quality).map(([measure, value, note]) => (
              <tr key={measure} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-medium text-text">
                  {measure}
                </th>
                <td className="px-3 py-2 whitespace-nowrap">{value}</td>
                <td className="px-3 py-2 text-muted">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 id="sources" className="mt-10 text-xl font-semibold">
        Sources
      </h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
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
