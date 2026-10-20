import Link from 'next/link';
import { CountryPicker } from '@/components/globe/country-picker';
import { WorldMapSvg } from '@/components/globe/world-map-svg';
import { GlobeIcon, ListIcon } from '@/components/ui/icons';
import { listCountrySummaries, numericToIso2Map } from '@/lib/db/countries';
import { getEnv } from '@/lib/env';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const env = getEnv();
  const countries = await listCountrySummaries({ includeFixtures: env.SHOW_FIXTURES });
  const rawCountry = first(sp.country)?.toUpperCase();
  const selected = countries.find((c) => c.iso2 === rawCountry) ?? null;
  const view = first(sp.view) === 'list' ? 'list' : 'map';

  const preserved = new URLSearchParams();
  for (const key of ['sector', 'sort']) {
    const v = first(sp[key]);
    if (v) preserved.set(key, v);
  }
  const hrefBase = preserved.toString();
  const hrefFor = (iso2: string) => {
    const p = new URLSearchParams(preserved);
    p.set('country', iso2);
    return `/?${p.toString()}`;
  };
  const viewHref = (v: 'map' | 'list') => {
    const p = new URLSearchParams(preserved);
    if (selected) p.set('country', selected.iso2);
    if (v === 'list') p.set('view', 'list');
    return `/?${p.toString()}`;
  };

  const pickerCountries = countries.map((c) => ({
    iso2: c.iso2,
    iso3: c.iso3,
    name: c.name,
    region: c.region,
    articleCount: c.articleCount,
    outletCount: c.outletCount,
  }));
  const counts = new Map(countries.map((c) => [c.iso2, c.articleCount]));

  const switchClass = (active: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border text-sm no-underline ${
      active ? 'border-accent bg-surface-raised text-text' : 'border-border-strong text-muted'
    }`;

  return (
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
        className={`relative min-h-[60dvh] overflow-hidden lg:h-[calc(100dvh-var(--header-h))] ${view === 'list' ? 'hidden lg:block' : ''}`}
      >
        <div className="absolute inset-0 flex items-center justify-center p-4 lg:p-8">
          <WorldMapSvg
            numericToIso2={numericToIso2Map(countries)}
            countsByIso2={counts}
            selectedIso2={selected?.iso2 ?? null}
            hrefForCountry={hrefFor}
            className="h-full max-h-full w-full max-w-[1200px]"
          />
        </div>
        <p className="absolute bottom-4 left-4 max-w-md text-sm text-muted">
          {selected
            ? `${selected.name} selected.`
            : 'Select a country on the map or from the country list.'}{' '}
          Boundaries: Natural Earth (public domain).
        </p>
      </section>

      {selected ? (
        <aside
          aria-label={`${selected.name} summary`}
          className="absolute right-4 bottom-4 left-4 rounded-lg border border-border bg-surface-raised p-4 lg:top-4 lg:bottom-auto lg:left-auto lg:w-[var(--sheet-w)]"
          data-testid="country-summary"
        >
          <h2 className="text-xl font-semibold">{selected.name}</h2>
          <p className="text-sm text-muted">
            {selected.subregion ?? selected.region ?? 'Region unknown'} · ISO {selected.iso2}
          </p>
          <p className="mt-2">
            {selected.outletCount === 0
              ? 'No sources are registered for this country yet.'
              : `${selected.articleCount} stories from ${selected.outletCount} registered ${selected.outletCount === 1 ? 'outlet' : 'outlets'}.`}
          </p>
        </aside>
      ) : null}
    </main>
  );
}
