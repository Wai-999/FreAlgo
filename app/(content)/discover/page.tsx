import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceNavProvider } from '@/components/news/nav-anchor';
import { StoryCard } from '@/components/news/story-card';
import { getPrisma } from '@/lib/db/client';
import { listCountrySummaries } from '@/lib/db/countries';
import { listJourneys } from '@/lib/db/journeys';
import { SECTORS, SECTOR_SLUGS } from '@/lib/domain/sectors';
import {
  SEED_RE,
  WINDOW_DAYS,
  dailyDiscovery,
  latestCompleteDay,
  newSeed,
  surprise,
  type DiscoverConstraints,
} from '@/lib/discover/select';
import { getEnv } from '@/lib/env';
import type { RawSearchParams } from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';
import { languageName } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Discover',
  description:
    'Explicit, explained ways to find places and stories you would not have searched for.',
};

const LANGUAGES = ['en', 'pt', 'es', 'fr', 'de', 'ar', 'ja', 'my', 'ru', 'bn', 'it'];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads only valid, bounded constraints; anything else is ignored. */
function readConstraints(sp: RawSearchParams, regions: Set<string>): DiscoverConstraints {
  const region = one(sp.region);
  const language = one(sp.language);
  const sector = one(sp.sector);
  return {
    region: region && regions.has(region) ? region : undefined,
    language: language && /^[a-z]{2,3}$/.test(language) ? language : undefined,
    sector: sector && (SECTOR_SLUGS as readonly string[]).includes(sector) ? sector : undefined,
  };
}

function discoverHref(seed: string, c: DiscoverConstraints): string {
  const p = new URLSearchParams({ seed });
  if (c.region) p.set('region', c.region);
  if (c.language) p.set('language', c.language);
  if (c.sector) p.set('sector', c.sector);
  return `/discover?${p.toString()}`;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('discover')) notFound();
  const env = getEnv();
  const opts = { includeFixtures: env.SHOW_FIXTURES };
  const sp = await searchParams;
  const countries = await listCountrySummaries(opts);
  const regionList = [
    ...new Set(countries.flatMap((c) => [c.region, c.subregion]).filter((r): r is string => !!r)),
  ].sort();
  const constraints = readConstraints(sp, new Set(regionList));
  const rawSeed = one(sp.seed);
  const seed = rawSeed && SEED_RE.test(rawSeed) ? rawSeed : null;
  const prisma = getPrisma();
  const [result, daily, journeys] = await Promise.all([
    seed ? surprise(prisma, seed, constraints, opts) : null,
    dailyDiscovery(prisma, latestCompleteDay(), opts),
    isEnabled('journeys') ? listJourneys(prisma, opts) : null,
  ]);
  const nextSeed = newSeed();
  const select = 'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-text';

  return (
    <WorkspaceNavProvider>
      <h1 className="text-3xl font-semibold tracking-tight">Discover</h1>
      <p className="measure mt-2 text-muted">
        Ways to meet places and stories you might not search for. Every choice here is made by a
        published, seeded method that you can check and repeat. Nothing is “trending”, and there are
        no streaks or scores. <Link href="/methodology#discover">How selection works</Link>.
      </p>

      <section aria-labelledby="surprise-h" className="mt-8">
        <h2 id="surprise-h" className="text-xl font-semibold">
          Surprise me
        </h2>
        <p className="measure mt-1 text-sm text-muted">
          Picks one country at random from those with stories about them in the last {WINDOW_DAYS}{' '}
          days. Every eligible country has the same chance, however much coverage it has.
        </p>
        <form
          action="/discover"
          method="get"
          className="mt-3 grid gap-3 sm:grid-cols-3"
          data-testid="surprise-form"
        >
          <input type="hidden" name="seed" value={nextSeed} />
          <label className="text-sm text-muted">
            Region (optional)
            <select name="region" defaultValue={constraints.region ?? ''} className={select}>
              <option value="">Anywhere</option>
              {regionList.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Language (optional)
            <select name="language" defaultValue={constraints.language ?? ''} className={select}>
              <option value="">Any language</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Sector (optional)
            <select name="sector" defaultValue={constraints.sector ?? ''} className={select}>
              <option value="">Any sector</option>
              {SECTORS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="min-h-11 rounded-md border border-accent bg-surface-raised px-5 text-text hover:bg-surface"
            >
              {result ? 'Surprise me again' : 'Surprise me'}
            </button>
          </div>
        </form>

        {result ? (
          <div className="mt-6 rounded-lg border border-border p-4" data-testid="surprise-result">
            {result.pick ? (
              <>
                <p className="text-sm text-muted">Your surprise country</p>
                <p className="mt-1 text-2xl font-semibold">
                  <Link href={`/?country=${result.pick.iso2}`}>{result.pick.name}</Link>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {result.pick.stories} {result.pick.stories === 1 ? 'story' : 'stories'} about it
                  in the last {WINDOW_DAYS} days.{' '}
                  <Link href={`/?country=${result.pick.iso2}`}>Explore {result.pick.name}</Link>
                </p>
                <details className="mt-3 text-sm" data-testid="selection-method" open>
                  <summary className="min-h-11 cursor-pointer text-text">
                    How this was chosen
                  </summary>
                  <p className="measure mt-1 text-muted">
                    {result.method.description} Seed <code>{result.seed}</code> gave position{' '}
                    {result.pick.index + 1} of {result.eligible.count}.{' '}
                    <Link href={discoverHref(result.seed, constraints)}>
                      Permanent link to this result
                    </Link>
                    .
                  </p>
                </details>
                <div className="mt-2" data-testid="story-list">
                  {result.stories.map((a) => (
                    <StoryCard
                      key={a.id}
                      article={a}
                      depth="quick"
                      why={{
                        query: { country: result.pick!.iso2, period: '7d' },
                        sort: 'newest',
                        reasons: [
                          `${result.pick!.name} was chosen by Surprise me (seed ${result.seed}).`,
                        ],
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p data-testid="empty-state">
                No country has stories about it in the last {WINDOW_DAYS} days with these choices.
                Try fewer constraints. (That says nothing about the news there, only about what
                FreAlgo has collected.)
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="daily-h" className="mt-10">
        <h2 id="daily-h" className="text-xl font-semibold">
          Daily discovery
        </h2>
        <p className="measure mt-1 text-sm text-muted">
          One story from {daily.date} (UTC), the latest complete day, chosen by a fixed method so
          the pick never changes. <Link href={`/discover/daily/${daily.date}`}>Archive</Link>.
        </p>
        <div className="mt-3" data-testid="daily-discovery">
          {daily.story ? (
            <>
              <StoryCard
                article={daily.story}
                depth="deep"
                why={{
                  query: {},
                  sort: 'newest',
                  reasons: [
                    `Daily discovery for ${daily.date}: story ${daily.index! + 1} of ${daily.poolSize} published that day about at least one country, chosen by SHA-256("daily:${daily.date}").`,
                  ],
                }}
              />
            </>
          ) : (
            <p className="text-muted" data-testid="daily-empty">
              No story published on {daily.date} qualifies, so there is no daily discovery for that
              day. FreAlgo does not invent one.
            </p>
          )}
        </div>
      </section>

      {journeys ? (
        <section aria-labelledby="journeys-h" className="mt-10" data-testid="journeys">
          <h2 id="journeys-h" className="text-xl font-semibold">
            Story Journeys
          </h2>
          <p className="measure mt-1 text-sm text-muted">
            Curated sequences of connected places. Each step says how it connects to the last,
            whether that is a fact or an interpretation, and cites its evidence. Journeys open only
            when you choose one, and never play by themselves.
          </p>
          {journeys.length ? (
            <ul className="mt-3 space-y-2">
              {journeys.map((j) => (
                <li key={j.slug}>
                  <Link href={`/discover/journeys/${j.slug}`}>{j.title}</Link>{' '}
                  <span className="text-sm text-muted">
                    ({j.steps} steps{j.isFixture ? ', fixture' : ''})
                  </span>
                  <p className="text-sm text-muted">{j.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-muted">No journeys have been curated yet.</p>
          )}
        </section>
      ) : null}

      {isEnabled('worldPulse') || isEnabled('countryConnections') ? (
        <section aria-labelledby="more-h" className="mt-10">
          <h2 id="more-h" className="text-xl font-semibold">
            More ways to explore
          </h2>
          <ul className="mt-2 space-y-1">
            {isEnabled('worldPulse') ? (
              <li>
                <Link href="/world-pulse">World Pulse</Link>{' '}
                <span className="text-sm text-muted">
                  how many reports in FreAlgo are about each country
                </span>
              </li>
            ) : null}
            {isEnabled('countryConnections') ? (
              <li>
                <Link href="/connections">Country connections</Link>{' '}
                <span className="text-sm text-muted">countries named in the same events</span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </WorkspaceNavProvider>
  );
}
