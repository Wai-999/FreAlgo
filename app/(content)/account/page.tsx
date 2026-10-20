import type { Metadata } from 'next';
import Link from 'next/link';
import { isAdminUser } from '@/lib/auth/admin';
import { getSession } from '@/lib/auth/session';
import { getEnv, isLocalHostname } from '@/lib/env';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };

export default async function AccountPage() {
  const env = getEnv();
  const session = await getSession();
  const devLogin = env.AUTH_DEV_LOGIN && isLocalHostname(new URL(env.APP_BASE_URL).hostname);
  const oidc = !!(env.OIDC_ISSUER && env.OIDC_CLIENT_ID);

  return (
    <div className="measure space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
      <p className="text-muted">
        You do not need an account. Preferences are stored in this browser. Signing in is only for
        optional preference sync and for administrators.
      </p>
      {session ? (
        <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p>
            Signed in as <code className="text-text">{session.userId}</code>
            {isAdminUser(session.userId) ? ' (administrator)' : ''}.
          </p>
          {isAdminUser(session.userId) ? (
            <p>
              <Link href="/admin">Open the admin console</Link>
            </p>
          ) : null}
          <form method="post" action="/api/v1/auth/logout">
            <button
              type="submit"
              className="min-h-11 rounded-md border border-border-strong px-4 hover:bg-surface-raised"
            >
              Sign out
            </button>
          </form>
        </section>
      ) : (
        <section className="space-y-4">
          {oidc ? (
            <p>
              <a
                href="/api/v1/auth/oidc/start"
                className="inline-flex min-h-11 items-center rounded-md border border-accent px-4"
              >
                Sign in with your identity provider
              </a>
            </p>
          ) : (
            <p className="text-sm text-muted">
              No identity provider is configured (set <code>OIDC_ISSUER</code>,{' '}
              <code>OIDC_CLIENT_ID</code> and <code>OIDC_CLIENT_SECRET</code>).
            </p>
          )}
          {devLogin ? (
            <form
              method="post"
              action="/api/v1/auth/dev-login"
              className="space-y-3 rounded-lg border border-warning/60 p-4"
            >
              <p className="text-sm text-warning">
                Local development sign-in: creates a test identity without a password. Only
                available on localhost.
              </p>
              <label className="block text-sm">
                <span className="text-text">Test identity name</span>
                <input
                  name="name"
                  required
                  pattern="[a-z0-9-]{2,32}"
                  defaultValue="local-admin"
                  className="mt-1 min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-text"
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-md border border-accent px-4 text-text hover:bg-surface-raised"
              >
                Sign in (development)
              </button>
            </form>
          ) : null}
        </section>
      )}
    </div>
  );
}
