import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MyWorldBootstrap } from '@/components/my-world/my-world-bootstrap';
import { WorkspaceNavProvider } from '@/components/news/nav-anchor';
import { ReadingDepthNav } from '@/components/news/reading-depth-nav';
import { StoryCard } from '@/components/news/story-card';
import { toSearchParams, type ArticleQuery } from '@/lib/api/contracts';
import { getPrisma } from '@/lib/db/client';
import { getEnv } from '@/lib/env';
import {
  SORT_LABEL,
  exploreHref,
  filterSummary,
  parseExploreQuery,
  type RawSearchParams,
} from '@/lib/explore/params';
import { isEnabled } from '@/lib/flags';
import { listArticles } from '@/lib/search/articles';

export const metadata: Metadata = {
  title: 'My World',
  description: 'The latest stories for the countries and topics you chose. Your choices only.',
  robots: { index: false },
};

const PER_COUNTRY = 5;
const MAX_COUNTRIES = 10;

/**
 * My World (FreAlgo 2.0, spec §3): built only from explicit choices carried in the URL. The
 * choices come from this browser's local preferences (MyWorldBootstrap) or from a shared link;
 * nothing is stored on the server and no behaviour is used.
 */
export default async function MyWorldPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  if (!isEnabled('myWorld')) notFound();
  const sp = await searchParams;
  const rawCountries = sp.country === undefined ? [] : [sp.country].flat();
  const countries = [...new Set(rawCountries.filter((c) => /^[A-Za-z]{2}$/.test(c)))]
    .map((c) => c.toUpperCase())
    .slice(0, MAX_COUNTRIES);
  const hasChoices = Object.keys(sp).some((k) => k !== 'depth');

  if (!hasChoices) {
    return (
      <>
        <h1 className="text-3xl font-semibold tracking-tight">My World</h1>
        <MyWorldBootstrap />
        <noscript>
          <p className="mt-4 text-sm text-muted">
            Without JavaScript, browse <Link href="/stories">Stories</Link> with filters instead.
          </p>
        </noscript>
      </>
    );
  }

  const env = getEnv();
  const prisma = getPrisma();
  // Shared filters (everything except the countries), validated by the public contract.
  const { query: base } = parseExploreQuery({ ...sp, country: undefined, cursor: undefined });
  const depth = base.depth ?? 'deep';
  const summary = filterSummary(base);
  const names = new Map(
    (
      await prisma.country.findMany({
        where: { iso2: { in: countries } },
        select: { iso2: true, name: true },
      })
    ).map((c) => [c.iso2, c.name]),
  );
  const sections = await Promise.all(
    (countries.length ? countries : [null]).map(async (iso2) => {
      const query: ArticleQuery = { ...base, country: iso2 ?? undefined, limit: PER_COUNTRY };
      try {
        const result = await listArticles(prisma, query, { includeFixtures: env.SHOW_FIXTURES });
        return { iso2, name: (iso2 && names.get(iso2)) ?? iso2, query, result };
      } catch {
        return { iso2, name: iso2, query, result: null }; // unknown country code in a shared link
      }
    }),
  );
  const depthHref = (d: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp))
      if (k !== 'depth') [v].flat().forEach((x) => x && p.append(k, x));
    if (d !== 'deep') p.set('depth', d);
    return `/my-world?${p.toString()}`;
  };

  return (
    <WorkspaceNavProvider>
      <h1 className="text-3xl font-semibold tracking-tight">My World</h1>
      <p className="measure mt-2 text-muted">
        Built only from the choices in this page&apos;s address
        {countries.length
          ? `: ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}`
          : ''}
        {summary.count ? `, ${summary.text}` : ''}. Order: {SORT_LABEL[base.sort ?? 'newest']}.
        Nothing about your reading is used or stored.{' '}
        <Link href="/settings">Change your choices</Link>.
      </p>
      <div className="mt-4">
        <ReadingDepthNav current={depth} hrefFor={depthHref} />
      </div>
      {sections.map(({ iso2, name, query, result }) => (
        <section
          key={iso2 ?? 'all'}
          aria-labelledby={`mw-${iso2 ?? 'all'}`}
          className="mt-8"
          data-testid="my-world-section"
        >
          <h2 id={`mw-${iso2 ?? 'all'}`} className="text-xl font-semibold">
            {iso2 ? name : 'Your topics, all countries'}
          </h2>
          {!result ? (
            <p className="mt-2 text-sm text-muted">Unknown country code “{iso2}”.</p>
          ) : result.items.length === 0 ? (
            <p className="mt-2 text-sm text-muted" data-testid="empty-state">
              No stories match your choices{iso2 ? ` for ${name}` : ''} yet. That reflects what
              FreAlgo has collected, not the news there.
            </p>
          ) : (
            <>
              {result.items.map((a) => (
                <StoryCard
                  key={a.id}
                  article={a}
                  depth={depth}
                  why={{
                    query,
                    sort: result.page.sort,
                    reasons: iso2 ? [`${name} is one of the countries you chose.`] : [],
                  }}
                />
              ))}
              <p className="mt-3 text-sm">
                <Link
                  href={
                    iso2
                      ? exploreHref({ ...query, limit: undefined, depth: undefined })
                      : `/stories?${toSearchParams({ ...query, limit: undefined }).toString()}`
                  }
                >
                  {result.page.total > PER_COUNTRY
                    ? `All ${result.page.total}${result.page.totalIsCapped ? '+' : ''} stories${iso2 ? ` about ${name}` : ''}`
                    : `Open ${iso2 ? name : 'Stories'}`}
                </Link>
              </p>
            </>
          )}
        </section>
      ))}
    </WorkspaceNavProvider>
  );
}
