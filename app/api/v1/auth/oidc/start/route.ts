import { NextResponse } from 'next/server';
import { ApiError, apiHandler } from '@/lib/api/handler';
import {
  OIDC_COOKIE,
  oidcEnabled,
  startAuthorization,
  transientCookieOptions,
} from '@/lib/auth/oidc';

/** Begins OpenID Connect sign-in (authorization code + PKCE). */
export const GET = apiHandler(
  { rateLimit: { bucket: 'auth', limit: 20, windowSec: 60 } },
  async () => {
    if (!oidcEnabled()) throw new ApiError(404, 'NOT_FOUND', 'No identity provider is configured');
    const { url, cookie } = await startAuthorization();
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(OIDC_COOKIE, cookie, transientCookieOptions());
    return res;
  },
);
