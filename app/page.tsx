import Link from 'next/link';
import { Suspense } from 'react';
import { CountryPicker } from '@/components/globe/country-picker';
import { WorldMapSvg } from '@/components/globe/world-map-svg';
import { SheetPresence } from '@/components/news/country-sheet';
import { CountryWorkspace } from '@/components/news/country-workspace';
import { ApplyPreferredSort } from '@/components/news/apply-preferred-sort';
import { FocusRestorer } from '@/components/news/focus-restorer';
import { WorkspaceNavProvider } from '@/components/news/nav-anchor';
import { GlobeIcon, ListIcon } from '@/components/ui/icons';
import { toSearchParams } from '@/lib/api/contracts';
import { listCountrySummaries, numericToIso2Map } from '@/lib/db/countries';
import { getEnv } from '@/lib/env';
import { exploreHref, parseExploreQuery, type RawSearchParams } from '@/lib/explore/params';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const env = getEnv();
  const { query, ignored } = parseExploreQuery(sp);
  const countries = await listCountrySummaries({ includeFixtures: env.SHOW_FIXTURES });
  const selected = query.country ? (countries.find((c) => c.iso2 === query.country) ?? null) : null;
  const view = sp.view === 'list' ? 'list' : 'map';

  // Switching country keeps the sector and filters (spatial memory) but starts at page 1.
  const carry = { ...query, country: undefined, cursor: undefined };
  const hrefBase = toSearchParams(carry).toString();
  const hrefForCountry = (iso2: string) => exploreHref(carry, { country: iso2 });
  const viewHref = (v: 'map' | 'list') =>
    exploreHref({ ...query, cursor: undefined }, { view: v === 'list' ? 'list' : null });

  const pickerCountries = countries.map((c) => ({
    iso2: c.iso2,
    iso3: c.iso3,
    name: c.name,
    region: c.region,
    articleCount: c.articleCount,
    outletCount: c.outletCount,
  }));
  const counts = new Map(countries.map((c) => [c.iso2, c.articleCount]));
  const covered = countries.filter((c) => c.outletCount > 0).length;
  const switchClass = (active: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border text-sm no-underline ${
      active ? 'border-accent bg-surface-raised text-text' : 'border-border-strong text-muted'
    }`;

  return (
    <WorkspaceNavProvider>
      <main
        id="main"
        className="relative grid min-h-0 flex-1 grid-rows-[auto_1fr] lg:grid-cols-[var(--rail-w)_1fr] lg:grid-rows-1"
      >
        <h1 className="sr-only">Explore news by country</h1>

        {/* Mobile view switch (map vs. accessible list). Plain links: works without JavaScript. */}
        <nav
          aria-label="View"
          className="flex gap-2 border-b border-border px-4 py-2 lg:hidden"
          data-testid="view-switch"
          data-inert-under-sheet
        >
          <Link
            href={viewHref('map')}
            scroll={false}
            prefetch={false}
            aria-current={view === 'map' ? 'page' : undefined}
            className={switchClass(view === 'map')}
          >
            <GlobeIcon /> Map
          </Link>
          <Link
            href={viewHref('list')}
            scroll={false}
            prefetch={false}
            aria-current={view === 'list' ? 'page' : undefined}
            className={switchClass(view === 'list')}
          >
            <ListIcon /> Country list
          </Link>
        </nav>

        {/* Country rail: always shown on desktop; on mobile it is the "Country list" view. */}
        <aside
          aria-label="Countries"
          data-testid="country-rail"
          data-inert-under-sheet
          className={`${view === 'list' ? 'block' : 'hidden'} h-[calc(100dvh-var(--header-h)-61px)] border-border bg-bg lg:sticky lg:top-[var(--header-h)] lg:block lg:h-[calc(100dvh-var(--header-h))] lg:border-r`}
        >
          <CountryPicker
            countries={pickerCountries}
            selectedIso2={selected?.iso2 ?? null}
            hrefBase={hrefBase}
          />
        </aside>

        <section
          aria-label="World map"
          tabIndex={-1}
          data-focus-fallback
          data-inert-under-sheet
          className={`relative min-h-[60dvh] overflow-hidden outline-none lg:h-[calc(100dvh-var(--header-h))] ${view === 'list' ? 'hidden lg:block' : ''}`}
        >
          <div
            className={`absolute inset-0 flex items-center justify-center p-4 lg:p-8 ${selected ? 'lg:pr-[calc(var(--sheet-w)+1rem)]' : ''}`}
          >
            <WorldMapSvg
              numericToIso2={numericToIso2Map(countries)}
              countsByIso2={counts}
              selectedIso2={selected?.iso2 ?? null}
              hrefForCountry={hrefForCountry}
              className="h-full max-h-full w-full max-w-[1200px]"
            />
          </div>
          <p className="absolute bottom-4 left-4 max-w-md text-sm text-muted">
            {covered} of {countries.length} countries have registered sources. Boundaries: Natural
            Earth (public domain).
          </p>
        </section>

        <SheetPresence>
          {selected && query.country ? (
            <CountryWorkspace
              key="sheet"
              query={{ ...query, country: query.country }}
              ignored={ignored}
            />
          ) : null}
        </SheetPresence>
        <FocusRestorer sheetOpen={!!selected} />
        {/* useSearchParams needs a Suspense boundary; it renders nothing, so no-JS output is unaffected. */}
        <Suspense fallback={null}>
          <ApplyPreferredSort />
        </Suspense>
      </main>
    </WorkspaceNavProvider>
  );
}
