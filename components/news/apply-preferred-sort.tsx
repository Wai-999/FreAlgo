'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { usePreferences } from '@/lib/preferences/store';

/**
 * Applies the user's explicitly chosen default order when the URL does not specify one.
 * The order then shows in the URL and filter summary, so nothing happens invisibly.
 */
export function ApplyPreferredSort() {
  const [prefs, , hydrated] = usePreferences();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    if (params.has('sort') || params.has('q') || params.has('cursor')) return;
    if (prefs.preferredSort === 'newest') return;
    const next = new URLSearchParams(params);
    next.set('sort', prefs.preferredSort);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [hydrated, params, pathname, prefs.preferredSort, router]);
  return null;
}
