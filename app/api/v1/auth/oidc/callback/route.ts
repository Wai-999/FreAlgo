import { ApiError, apiHandler, seeOther } from '@/lib/api/handler';
import {
  OIDC_COOKIE,
  completeAuthorization,
  oidcEnabled,
  openTransient,
  redirectUri,
} from '@/lib/auth/oidc';
import { sessionCookie } from '@/lib/auth/session';
import { getLogger } from '@/lib/log';

/** OIDC redirect target: validates state/nonce/PKCE, then issues the FreAlgo session cookie. */
export const GET = apiHandler(
  { rateLimit: { bucket: 'auth', limit: 20, windowSec: 60 } },
  async (req) => {
    if (!oidcEnabled()) throw new ApiError(404, 'NOT_FOUND', 'No identity provider is configured');
    const transient = openTransient(req.cookies.get(OIDC_COOKIE)?.value);
    if (!transient)
      throw new ApiError(400, 'OIDC_STATE_MISSING', 'Sign-in session expired; please try again');
    // Validate against the registered redirect URI (not the internal request host).
    const current = new URL(redirectUri());
    current.search = req.nextUrl.search;
    let uid: string;
    try {
      uid = await completeAuthorization(current, transient);
    } catch (err) {
      getLogger().warn(
        { err: err instanceof Error ? err.message : String(err) },
        'oidc callback rejected',
      );
      throw new ApiError(400, 'OIDC_FAILED', 'Sign-in could not be completed');
    }
    const res = seeOther('/account');
    const c = sessionCookie(uid);
    res.cookies.set(c.name, c.value, c.options);
    res.cookies.delete({ name: OIDC_COOKIE, path: '/api/v1/auth/oidc' });
    return res;
  },
);
