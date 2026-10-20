'use client';

import Link from 'next/link';
import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';
import { SearchIcon } from '@/components/ui/icons';
import { FOCUS_SHEET_KEY } from '@/components/news/country-sheet';
import { usePreferences } from '@/lib/preferences/store';

export interface PickerCountry {
  iso2: string;
  iso3: string;
  name: string;
  region: string | null;
  articleCount: number;
  outletCount: number;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Searchable, keyboard-operable country list — a fully capable alternative to the globe/map.
 * Each entry is a real link, so it also works before hydration and without JavaScript.
 */
export function CountryPicker({
  countries,
  selectedIso2,
  hrefBase,
  autoFocus = false,
}: {
  countries: PickerCountry[];
  selectedIso2: string | null;
  /** Query string (without `country`) to preserve when picking, e.g. "sector=agriculture". */
  hrefBase: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [onlyCovered, setOnlyCovered] = useState(false);
  const deferred = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const statusId = useId();

  const filtered = useMemo(() => {
    const q = fold(deferred.trim());
    return countries.filter((c) => {
      if (onlyCovered && c.outletCount === 0) return false;
      if (!q) return true;
      return fold(c.name).includes(q) || c.iso2.toLowerCase() === q || c.iso3.toLowerCase() === q;
    });
  }, [countries, deferred, onlyCovered]);

  const [prefs] = usePreferences();
  const groups = useMemo(() => {
    const map = new Map<string, PickerCountry[]>();
    for (const c of filtered) {
      const key = c.region ?? 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    // Explicitly pinned countries (local preference) are listed first; they also stay in place.
    const pinned = prefs.pinnedCountries
      .map((iso2) => filtered.find((c) => c.iso2 === iso2))
      .filter((c): c is PickerCountry => !!c);
    return pinned.length
      ? ([['Pinned', pinned], ...sorted] as [string, PickerCountry[]][])
      : sorted;
  }, [filtered, prefs.pinnedCountries]);

  const covered = countries.filter((c) => c.outletCount > 0).length;

  function href(iso2: string) {
    const params = new URLSearchParams(hrefBase);
    params.set('country', iso2);
    return `/?${params.toString()}`;
  }

  function focusItem(delta: number, from?: HTMLElement) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-picker-item]') ?? [],
    );
    if (!items.length) return;
    const idx = from ? items.indexOf(from as HTMLAnchorElement) : -1;
    const next = items[Math.min(items.length - 1, Math.max(0, idx + delta))];
    next?.focus();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border p-4">
        <label htmlFor={inputId} className="block text-sm font-medium text-text">
          Find a country
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            id={inputId}
            type="search"
            value={query}
            autoFocus={autoFocus}
            autoComplete="off"
            spellCheck={false}
            placeholder="Name or ISO code, e.g. Myanmar or MM"
            aria-describedby={statusId}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusItem(1);
              }
            }}
            className="min-h-11 w-full rounded-md border border-border-strong bg-surface py-2 pr-3 pl-10 text-base text-text placeholder:text-muted/80"
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={onlyCovered}
            onChange={(e) => setOnlyCovered(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Only countries with registered sources ({covered} of {countries.length})
        </label>
        <p id={statusId} className="text-sm text-muted" aria-live="polite" aria-atomic="true">
          {filtered.length === countries.length
            ? `${countries.length} countries`
            : `${filtered.length} of ${countries.length} countries match`}
        </p>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6"
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusItem(1, target);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusItem(-1, target);
          } else if (e.key === 'Home') {
            e.preventDefault();
            focusItem(-Infinity, target);
          } else if (e.key === 'End') {
            e.preventDefault();
            focusItem(Infinity, target);
          }
        }}
      >
        {groups.length === 0 ? (
          <p className="p-4 text-muted">No country matches “{query}”.</p>
        ) : (
          groups.map(([region, items]) => (
            <section key={region} aria-labelledby={`${inputId}-${region}`} className="pt-4">
              <h3
                id={`${inputId}-${region}`}
                className="px-2 pb-1 text-xs font-semibold tracking-wider text-muted uppercase"
              >
                {region}
              </h3>
              <ul>
                {items.map((c) => {
                  const itemKey = `${region}-${c.iso2}`;
                  const selected = c.iso2 === selectedIso2;
                  return (
                    <li key={itemKey}>
                      <Link
                        href={href(c.iso2)}
                        scroll={false}
                        prefetch={false}
                        data-picker-item
                        data-country={region === 'Pinned' ? undefined : c.iso2}
                        onClick={() => {
                          try {
                            sessionStorage.setItem(FOCUS_SHEET_KEY, '1');
                          } catch {
                            // storage unavailable: focus simply stays put
                          }
                        }}
                        aria-current={selected ? 'true' : undefined}
                        className={`flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 no-underline ${
                          selected
                            ? 'bg-surface-raised text-text ring-1 ring-accent'
                            : 'text-text hover:bg-surface'
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {c.name}
                          <span className="ml-2 font-mono text-xs text-muted">{c.iso2}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {c.outletCount === 0
                            ? 'No sources'
                            : `${c.articleCount} ${c.articleCount === 1 ? 'story' : 'stories'}`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
