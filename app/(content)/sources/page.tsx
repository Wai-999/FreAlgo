import type { Metadata } from 'next';
import Link from 'next/link';
import { FixtureBadge, Badge } from '@/components/ui/badge';
import { SourceLabel } from '@/components/news/source-label';
import { getPrisma } from '@/lib/db/client';
import { listOutlets } from '@/lib/db/outlets';
import { getEnv } from '@/lib/env';
import { languageName } from '@/lib/format';

export const metadata: Metadata = { title: 'Source registry' };

const OWNERSHIP: Record<string, string> = {
  PRIVATE: 'Private',
  PUBLIC_SERVICE: 'Public service',
  STATE: 'State',
  NONPROFIT: 'Non-profit',
  COOPERATIVE: 'Co-operative',
  UNKNOWN: 'Ownership not yet reviewed',
};
const PAYWALL: Record<string, string> = {
  NONE: 'No paywall',
  METERED: 'Metered paywall',
  HARD: 'Paywall',
  UNKNOWN: 'Paywall unknown',
};

export default async function SourcesPage() {
  const outlets = await listOutlets(getPrisma(), { includeFixtures: getEnv().SHOW_FIXTURES });
  const real = outlets.filter((o) => !o.isFixture);
  const active = real.filter((o) => o.feeds.some((f) => f.status === 'ACTIVE')).length;
  const countries = new Set(real.map((o) => o.country?.iso2).filter(Boolean)).size;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Source registry</h1>
      <p className="measure mt-3 text-muted">
        Every outlet FreAlgo can show, with its country, language, ownership, paywall, feed status
        and source-level orientation label with provenance. {real.length} real outlets from{' '}
        {countries} countries are registered; {active} have an active feed. Real feeds stay paused
        until their publisher terms are reviewed. Coverage is uneven, and the gaps are shown rather
        than hidden. See the <Link href="/methodology#sources">source policy</Link>.
      </p>
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {outlets.map((o) => {
          const feedActive = o.feeds.some((f) => f.status === 'ACTIVE');
          return (
            <li
              key={o.id}
              className="rounded-lg border border-border bg-surface p-4"
              data-testid="outlet-card"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">
                  <Link href={`/sources/${o.slug}`} className="text-text">
                    {o.name}
                  </Link>
                </h2>
                {o.isFixture ? <FixtureBadge /> : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {o.country?.name ?? 'No country'} · {languageName(o.primaryLanguage)} ·{' '}
                {OWNERSHIP[o.ownershipType]} · {PAYWALL[o.paywall]}
              </p>
              <p className="mt-2 flex flex-wrap gap-2 text-sm">
                {o.isFixture ? (
                  <Badge>Not fetched</Badge>
                ) : feedActive ? (
                  <Badge tone="success">Active feed</Badge>
                ) : (
                  <Badge>Paused: terms review pending</Badge>
                )}
                <Badge>{o._count.articles} stories stored</Badge>
              </p>
              <div className="mt-3">
                <SourceLabel label={o} outletName={o.name} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
