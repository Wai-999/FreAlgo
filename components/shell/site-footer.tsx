import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="safe-bottom border-t border-border px-4 pt-6 text-sm text-muted lg:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2">
        <p>FreAlgo: no ads, no tracking, no engagement ranking.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4">
          <Link href="/methodology" className="inline-flex min-h-11 items-center">
            Methodology
          </Link>
          <Link href="/methodology#corrections" className="inline-flex min-h-11 items-center">
            Corrections &amp; takedowns
          </Link>
          <Link href="/settings" className="inline-flex min-h-11 items-center">
            Settings
          </Link>
          <Link href="/account" className="inline-flex min-h-11 items-center">
            Account
          </Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center">
            Privacy
          </Link>
          <Link href="/about#attribution" className="inline-flex min-h-11 items-center">
            Attribution
          </Link>
        </nav>
      </div>
    </footer>
  );
}
