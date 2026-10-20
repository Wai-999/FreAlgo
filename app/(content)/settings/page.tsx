import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsPanel } from '@/components/settings/settings-panel';
import { getSession } from '@/lib/auth/session';
import { listCountrySummaries } from '@/lib/db/countries';
import { getEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Settings', robots: { index: false } };

export default async function SettingsPage() {
  const [session, countries] = await Promise.all([
    getSession(),
    listCountrySummaries({ includeFixtures: getEnv().SHOW_FIXTURES }),
  ]);
  return (
    <div className="measure">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-muted">
        Settings are saved in this browser by default.{' '}
        {session ? (
          'You are signed in, so you can also save them to your account.'
        ) : (
          <>
            <Link href="/account">Sign in</Link> only if you want to sync them across devices.
          </>
        )}{' '}
        See <Link href="/privacy">privacy</Link>.
      </p>
      <div className="mt-6">
        <noscript>
          <p className="rounded-md border border-warning/50 p-3">
            Settings are stored in your browser and need JavaScript. Everything else works without
            it.
          </p>
        </noscript>
        <SettingsPanel
          signedIn={!!session}
          countries={countries.map((c) => ({ iso2: c.iso2, name: c.name }))}
        />
      </div>
    </div>
  );
}
