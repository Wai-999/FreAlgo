'use client';

import { useId } from 'react';
import { ORIENTATIONS, ORIENTATION_INFO, orientationToSlug } from '@/lib/domain/orientation';
import { NavAnchor, useGetFormSubmit } from './nav-anchor';

export interface FilterFormValues {
  q?: string;
  country?: string;
  region?: string;
  sector?: string[];
  outlet?: string[];
  orientation?: string[]; // slugs
  language?: string[];
  period?: string;
  from?: string;
  to?: string;
  sort?: string;
}

/**
 * Transparent, explicit filters as a GET form (works without JavaScript). Choices are
 * reversible; "Reset" clears everything. Nothing is applied that the user did not choose.
 */
export function FilterForm({
  action,
  values,
  outlets,
  languages,
  hidden,
  showQuery = false,
  showSector = false,
  sectors = [],
  countryOptions,
  regionOptions,
  resetHref,
}: {
  action: string;
  values: FilterFormValues;
  outlets: { slug: string; name: string }[];
  languages: { code: string; name: string }[];
  hidden: Record<string, string | undefined>;
  showQuery?: boolean;
  showSector?: boolean;
  sectors?: { slug: string; name: string }[];
  countryOptions?: { iso2: string; name: string }[];
  regionOptions?: string[];
  resetHref: string;
}) {
  const id = useId();
  const onSubmit = useGetFormSubmit(action);
  const has = (list: string[] | undefined, v: string) => !!list?.includes(v);
  const fieldset = 'space-y-1 rounded-md border border-border p-3';
  const legend = 'px-1 text-sm font-medium text-text';
  const check = 'flex min-h-11 items-center gap-3 text-sm text-text';

  return (
    <form
      action={action}
      method="get"
      onSubmit={onSubmit}
      className="space-y-4"
      data-testid="filter-form"
    >
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}

      {showQuery ? (
        <label className="block text-sm">
          <span className="font-medium text-text">Keywords</span>
          <input
            type="search"
            name="q"
            defaultValue={values.q}
            maxLength={200}
            placeholder="Words in headline, excerpt or outlet name"
            className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text"
          />
        </label>
      ) : null}

      {countryOptions || regionOptions ? (
        <fieldset className={fieldset}>
          <legend className={legend}>Place</legend>
          {countryOptions ? (
            <label className="block text-sm text-text">
              Country
              <select
                name="country"
                defaultValue={values.country ?? ''}
                className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text"
              >
                <option value="">Any country</option>
                {countryOptions.map((c) => (
                  <option key={c.iso2} value={c.iso2}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {regionOptions ? (
            <label className="mt-2 block text-sm text-text">
              Region
              <select
                name="region"
                defaultValue={values.region ?? ''}
                className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text"
              >
                <option value="">Any region</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>
      ) : null}

      {showSector ? (
        <fieldset className={fieldset}>
          <legend className={legend}>Sector (any of)</legend>
          {sectors.map((s) => (
            <label key={s.slug} className={check}>
              <input
                type="checkbox"
                name="sector"
                value={s.slug}
                defaultChecked={has(values.sector, s.slug)}
                className="size-5"
              />
              {s.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className={fieldset}>
        <legend className={legend}>Source orientation (any of)</legend>
        <p className="text-xs text-muted">
          Outlet-level labels with provenance. Not a rating of individual stories.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {ORIENTATIONS.map((o) => (
            <label key={o} className={check}>
              <input
                type="checkbox"
                name="orientation"
                value={orientationToSlug(o)}
                defaultChecked={has(values.orientation, orientationToSlug(o))}
                className="size-5"
              />
              {ORIENTATION_INFO[o].label}
            </label>
          ))}
        </div>
      </fieldset>

      {outlets.length ? (
        <fieldset className={fieldset}>
          <legend className={legend}>Outlet (any of)</legend>
          {outlets.map((o) => (
            <label key={o.slug} className={check}>
              <input
                type="checkbox"
                name="outlet"
                value={o.slug}
                defaultChecked={has(values.outlet, o.slug)}
                className="size-5"
              />
              {o.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {languages.length ? (
        <fieldset className={fieldset}>
          <legend className={legend}>Language (any of)</legend>
          <div className="grid grid-cols-2">
            {languages.map((l) => (
              <label key={l.code} className={check}>
                <input
                  type="checkbox"
                  name="language"
                  value={l.code}
                  defaultChecked={has(values.language, l.code)}
                  className="size-5"
                />
                {l.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className={fieldset}>
        <legend className={legend}>Publication period</legend>
        <label className="block text-sm" htmlFor={`${id}-period`}>
          <span className="sr-only">Period</span>
        </label>
        <select
          id={`${id}-period`}
          name="period"
          defaultValue={values.period ?? 'any'}
          className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text"
        >
          <option value="any">Any time</option>
          <option value="24h">Last 24 hours</option>
          <option value="3d">Last 3 days</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="365d">Last year</option>
        </select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            From (UTC date)
            <input
              type="date"
              name="from"
              defaultValue={values.from}
              className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-2 text-text"
            />
          </label>
          <label className="text-xs text-muted">
            To (inclusive)
            <input
              type="date"
              name="to"
              defaultValue={values.to}
              className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-2 text-text"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Order</legend>
        {[
          ...(showQuery
            ? [['', 'Automatic (text relevance when searching, otherwise newest)']]
            : []),
          ['newest', 'Newest first'],
          ['oldest', 'Oldest first'],
          ['alphabetical', 'Headline (A–Z)'],
          ['outlet', 'Outlet name (A–Z)'],
          ...(showQuery ? [['relevance', 'Text relevance (search only)']] : []),
        ].map(([value, label]) => (
          <label key={value} className={check}>
            <input
              type="radio"
              name="sort"
              value={value}
              defaultChecked={(values.sort ?? (showQuery ? '' : 'newest')) === value}
              className="size-5"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="min-h-11 rounded-md border border-accent bg-surface-raised px-4 text-text hover:bg-surface"
        >
          Apply filters
        </button>
        <NavAnchor
          href={resetHref}
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm"
        >
          Reset filters
        </NavAnchor>
      </div>
    </form>
  );
}
