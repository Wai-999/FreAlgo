'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FOCUS_SHEET_KEY } from '@/components/news/country-sheet';
import { useWorkspaceNav } from '@/components/news/nav-anchor';

export const WORLD_MAP_URL = '/geo/world-map.v1.svg';

/**
 * Flat 2D map (no-JS / no-WebGL fallback and globe skeleton), embedded from a static, immutable
 * SVG so it is not inlined into every page. Without JavaScript its country links navigate the
 * top window; with JavaScript, clicks become client navigations that keep the current filters,
 * and countries with stories / the selected country are highlighted.
 * Pointer-only by design: keyboard and screen-reader users have the equivalent country list.
 */
export function WorldMapFrame({
  selectedIso2,
  countriesWithNews,
  hrefBase,
  className,
}: {
  selectedIso2: string | null;
  countriesWithNews: string[];
  hrefBase: string;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const nav = useWorkspaceNav();
  const router = useRouter();
  const news = useMemo(() => new Set(countriesWithNews), [countriesWithNews]);
  const attached = useRef<Document | null>(null);

  // Latest navigation callback; the in-frame listener is attached once and reads it from here,
  // so it never uses stale filters.
  const pickRef = useRef<(iso2: string) => void>(() => {});
  useEffect(() => {
    pickRef.current = (iso2: string) => {
      const p = new URLSearchParams(hrefBase);
      p.set('country', iso2);
      try {
        sessionStorage.setItem(FOCUS_SHEET_KEY, '1');
      } catch {
        // ignore
      }
      const href = `/?${p.toString()}`;
      if (nav) nav.navigate(href);
      else router.push(href, { scroll: false });
    };
  }, [hrefBase, nav, router]);

  const apply = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc || doc.readyState !== 'complete') return;
    for (const a of Array.from(doc.querySelectorAll<SVGAElement>('a[data-iso2]'))) {
      const iso2 = a.getAttribute('data-iso2')!;
      a.toggleAttribute('data-news', news.has(iso2));
      a.toggleAttribute('data-selected', iso2 === selectedIso2);
    }
    if (attached.current === doc) return;
    attached.current = doc;
    doc.addEventListener('click', (e) => {
      const link = (e.target as Element | null)?.closest?.('a[data-iso2]');
      if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      pickRef.current(link.getAttribute('data-iso2')!);
    });
  }, [news, selectedIso2]);

  // The frame may finish loading before hydration; apply on mount and whenever state changes.
  useEffect(() => {
    apply();
  }, [apply]);

  return (
    <iframe
      ref={ref}
      src={WORLD_MAP_URL}
      title="World map"
      aria-hidden="true"
      tabIndex={-1}
      onLoad={apply}
      className={className}
      data-testid="world-map-svg"
    />
  );
}
