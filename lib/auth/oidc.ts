import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as client from 'openid-client';
import { isLocalHostname } from '@/lib/env';

/**
 * OpenID Connect (authorization code + PKCE + state + nonce) for optional accounts.
 * Requires an external identity provider (OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET):
 * an external gate, so the feature is simply hidden when unconfigured.
 *
 * The transient PKCE/state/nonce values travel in a short-lived, HMAC-signed, HttpOnly cookie
 * scoped to the callback path; nothing is stored server-side.
 */
export const OIDC_COOKIE = 'frealgo_oidc';
const MAX_AGE_SEC = 600;

let cached: { key: string; config: Promise<client.Configuration> } | undefined;

export function oidcEnabled(): boolean {
  return !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
}

export function getOidcConfig(): Promise<client.Configuration> {
  const issuer = process.env.OIDC_ISSUER!;
  const key = `${issuer}|${process.env.OIDC_CLIENT_ID}`;
  if (cached?.key === key) return cached.config;
  const url = new URL(issuer);
  // Plain-http issuers are only accepted for local development/test identity providers.
  const insecure =
    url.protocol === 'http:' &&
    isLocalHostname(url.hostname) &&
    process.env.NODE_ENV !== 'production';
  const config = client
    .discovery(
      url,
      process.env.OIDC_CLIENT_ID!,
      process.env.OIDC_CLIENT_SECRET,
      undefined,
      insecure ? { execute: [client.allowInsecureRequests] } : undefined,
    )
    .catch((err) => {
      cached = undefined;
      throw err;
    });
  cached = { key, config };
  return config;
}

export function redirectUri(): string {
  return new URL(
    '/api/v1/auth/oidc/callback',
    process.env.APP_BASE_URL ?? 'http://localhost:3000',
  ).toString();
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is required for OIDC');
  return s;
}

interface Transient {
  verifier: string;
  state: string;
  nonce: string;
  exp: number;
}

export function sealTransient(t: Omit<Transient, 'exp'>): string {
  const body = Buffer.from(
    JSON.stringify({ ...t, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret()).update(`oidc:${body}`).digest('base64url');
  return `${body}.${sig}`;
}

export function openTransient(value: string | undefined): Transient | null {
  if (!value) return null;
  const [body, sig] = value.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(`oidc:${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Transient;
    return t.exp * 1000 > Date.now() ? t : null;
  } catch {
    return null;
  }
}

export const transientCookieOptions = () => ({
  httpOnly: true,
  secure: (process.env.APP_BASE_URL ?? '').startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/api/v1/auth/oidc',
  maxAge: MAX_AGE_SEC,
});

/** Opaque, stable local user id: provider-scoped subject, never an email address. */
export function userIdFor(issuer: string, sub: string): string {
  const issuerTag = createHash('sha256').update(issuer).digest('hex').slice(0, 10);
  return `oidc:${issuerTag}:${sub}`;
}

export async function startAuthorization(): Promise<{ url: URL; cookie: string }> {
  const config = await getOidcConfig();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: 'openid',
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return { url, cookie: sealTransient({ verifier, state, nonce }) };
}

export async function completeAuthorization(
  currentUrl: URL,
  transient: Transient,
): Promise<string> {
  const config = await getOidcConfig();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: transient.verifier,
    expectedState: transient.state,
    expectedNonce: transient.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error('ID token without subject');
  return userIdFor(config.serverMetadata().issuer, claims.sub);
}
