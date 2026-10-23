'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { orientationToSlug } from '@/lib/domain/orientation';
import { usePreferences } from '@/lib/preferences/store';
import type { Preferences } from '@/lib/preferences/schema';

/** URL for the reader's explicit choices. Nothing is sent anywhere else. */
export function myWorldHref(p: Preferences): string | null {
  const q = new URLSearchParams();
  p.pinnedCountries.slice(0, 10).forEach((c) => q.append('country', c));
  p.sectors.forEach((s) => q.append('sector', s));
  p.languages.forEach((l) => q.append('language', l));
  p.orientations.forEach((o) => q.append('orientation', orientationToSlug(o)));
  p.outletIds.forEach((o) => q.append('outlet', o));
  if (p.preferredSort !== 'newest') q.set('sort', p.preferredSort);
  return [...q.keys()].length ? `/my-world?${q.toString()}` : null;
}

/**
 * My World without parameters: read the choices saved in this browser and open the page for
 * them. If there are none, explain how to make some. The choices never leave the browser except
 * as this page's own address.
 */
export function MyWorldBootstrap() {
  const [prefs, , hydrated] = usePreferences();
  const router = useRouter();
  const target = hydrated ? myWorldHref(prefs) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  if (!hydrated || target) {
    return (
      <p className="mt-6 text-muted" role="status">
        Loading your choices…
      </p>
    );
  }
  return (
    <div className="mt-6 rounded-lg border border-border p-4" data-testid="my-world-empty">
      <p className="text-text">You have not chosen anything yet.</p>
      <p className="measure mt-2 text-sm text-muted">
        My World shows the latest stories for the countries, sectors, languages and outlets you
        choose, in the order you choose. Your choices are stored only in this browser.
      </p>
      <p className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href="/settings">Choose countries and topics</Link>
        <Link href="/stories">Browse all stories</Link>
      </p>
    </div>
  );
}
