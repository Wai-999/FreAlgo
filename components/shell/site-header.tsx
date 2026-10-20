import Link from 'next/link';
import { MenuIcon } from '@/components/ui/icons';
import { NavLinks } from './nav-links';

export const NAV_ITEMS = [
  { href: '/', label: 'Explore' },
  { href: '/search', label: 'Search' },
  { href: '/sources', label: 'Sources' },
  { href: '/status', label: 'Freshness' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/about', label: 'About' },
  { href: '/settings', label: 'Settings' },
] as const;

export function SiteHeader() {
  return (
    <header
      data-inert-under-sheet
      className="sticky top-0 z-40 h-[var(--header-h)] border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80"
    >
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-4 px-4 lg:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 font-semibold tracking-tight text-text no-underline"
          aria-label="FreAlgo home"
        >
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-accent" />
          FreAlgo
        </Link>
        <span className="hidden text-sm text-muted xl:inline">
          No ads. No engagement ranking. You choose the order.
        </span>

        <nav aria-label="Primary" className="ml-auto hidden md:block">
          <NavLinks items={NAV_ITEMS} className="flex items-center gap-1" />
        </nav>

        {/* Mobile menu: <details> works without JavaScript and is keyboard accessible. */}
        <details className="group relative ml-auto md:hidden">
          <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-border-strong text-text [&::-webkit-details-marker]:hidden">
            <MenuIcon />
            <span className="sr-only">Menu</span>
          </summary>
          <nav
            aria-label="Primary"
            className="absolute right-0 mt-2 w-56 rounded-lg border border-border-strong bg-surface-raised p-2 shadow-xl"
          >
            <NavLinks items={NAV_ITEMS} className="flex flex-col" />
          </nav>
        </details>
      </div>
    </header>
  );
}
