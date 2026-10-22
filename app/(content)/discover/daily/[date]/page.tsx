import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceNavProvider } from '@/components/news/nav-anchor';
import { StoryCard } from '@/components/news/story-card';
import { getPrisma } from '@/lib/db/client';
import { dailyDiscovery, latestCompleteDay } from '@/lib/discover/select';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';

export const metadata: Metadata = { title: 'Daily discovery archive' };

const DAY = 86_400_000;
const shift = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);

/** One dated daily discovery, with previous/next navigation; never a future or invented day. */
export default async function DailyArchivePage({ params }: { params: Promise<{ date: string }> }) {
  if (!isEnabled('discover')) notFound();
  const { date } = await params;
  const latest = latestCompleteDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
    notFound();
  if (date > latest || date < '2026-01-01') notFound();
  const daily = await dailyDiscovery(getPrisma(), date, {
    includeFixtures: getEnv().SHOW_FIXTURES,
  });
  const prev = shift(date, -1);
  const next = shift(date, 1);
  return (
    <WorkspaceNavProvider>
      <p className="text-sm text-muted">
        <Link href="/discover">Discover</Link> / Daily discovery archive
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Daily discovery: {date}</h1>
      <p className="measure mt-2 text-sm text-muted">{daily.method.description}</p>
      <div className="mt-4" data-testid="daily-discovery">
        {daily.story ? (
          <StoryCard
            article={daily.story}
            why={{
              query: {},
              sort: 'newest',
              reasons: [
                `Daily discovery for ${date}: story ${daily.index! + 1} of ${daily.poolSize}.`,
              ],
            }}
          />
        ) : (
          <p className="text-muted" data-testid="daily-empty">
            No story published on {date} qualifies, so there is no daily discovery for that day.
          </p>
        )}
      </div>
      <nav aria-label="Archive" className="mt-6 flex gap-4 text-sm">
        {prev >= '2026-01-01' ? <Link href={`/discover/daily/${prev}`}>← {prev}</Link> : null}
        {next <= latest ? <Link href={`/discover/daily/${next}`}>{next} →</Link> : null}
      </nav>
    </WorkspaceNavProvider>
  );
}
