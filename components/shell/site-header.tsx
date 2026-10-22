import Link from 'next/link';
import { connection } from 'next/server';
import { MenuIcon } from '@/components/ui/icons';
import { isEnabled, type FlagName } from '@/lib/flags';
import { NavLinks } from './nav-links';

/**
 * FreAlgo 2.0 information architecture (ADR V2-001): five primary sections, with the transparency
 * pages kept one click away rather than buried. Primary sections follow their feature flags.
 */
const PRIMARY: { href: string; label: string; flag?: FlagName }[] = [
  { href: '/', label: 'Explore' },
  { href: '/stories', label: 'Stories', flag: 'stories' },
  { href: '/discover', label: 'Discover', flag: 'discover' },
  { href: '/perspectives', label: 'Perspectives', flag: 'perspectives' },
  { href: '/my-world', label: 'My World', flag: 'myWorld' },
];

export const SECONDARY_NAV = [
  { href: '/search', label: 'Search' },
  { href: '/sources', label: 'Sources' },
  { href: '/status', label: 'Freshness' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/about', label: 'About' },
  { href: '/settings', label: 'Settings' },
] as const;

export async function SiteHeader() {
  await connection(); // flags are read per request, so an operator change needs no rebuild
  const primary = PRIMARY.filter((i) => !i.flag || isEnabled(i.flag));
  return (
    <header
      data-inert-under-sheet
      className="sticky top-0 z-40 h-[var(--header-h)] border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80"
    >
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-3 px-4 lg:px-6">
        <Link
          href="/"
          prefetch={false}
          className="flex min-h-11 items-center gap-2 font-semibold tracking-tight text-text no-underline"
          aria-label="FreAlgo home"
        >
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-accent" />
          FreAlgo
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <NavLinks items={primary} className="flex items-center gap-0.5" />
        </nav>

        <nav aria-label="Transparency and settings" className="ml-auto hidden xl:block">
          <NavLinks items={SECONDARY_NAV} className="flex items-center" small />
        </nav>

        {/* Tablet: transparency pages behind a visible "More" menu (works without JavaScript). */}
        <details className="group relative ml-auto hidden md:block xl:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-md px-3 text-sm text-muted hover:text-text [&::-webkit-details-marker]:hidden">
            More<span aria-hidden="true">&nbsp;▾</span>
          </summary>
          <nav
            aria-label="Transparency and settings"
            className="absolute right-0 mt-2 w-56 rounded-lg border border-border-strong bg-surface-raised p-2 shadow-xl"
          >
            <NavLinks items={SECONDARY_NAV} className="flex flex-col" />
          </nav>
        </details>

        {/* Phone menu: <details> works without JavaScript and is keyboard accessible. */}
        <details className="group relative ml-auto md:hidden">
          <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border-strong text-text [&::-webkit-details-marker]:hidden">
            <MenuIcon />
            <span className="sr-only">Menu</span>
          </summary>
          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border-strong bg-surface-raised p-2 shadow-xl">
            <nav aria-label="Primary">
              <NavLinks items={primary} className="flex flex-col" />
            </nav>
            <p className="mt-2 border-t border-border px-3 pt-2 text-xs tracking-wide text-muted uppercase">
              Transparency
            </p>
            <nav aria-label="Transparency and settings">
              <NavLinks items={SECONDARY_NAV} className="flex flex-col" />
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
