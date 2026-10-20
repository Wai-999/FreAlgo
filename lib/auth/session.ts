import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Minimal signed session cookie: base64url(JSON payload) "." base64url(HMAC-SHA256).
 * Only an opaque user id and expiry are stored. HttpOnly, SameSite=Lax, Secure on https.
 * No session is ever created for anonymous visitors.
 */
export interface SessionPayload {
  uid: string;
  exp: number; // epoch seconds
  v: 1;
}

const TTL_DAYS = 30;
let ephemeralSecret: string | undefined;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is required');
  // Development without a configured secret: sessions last until the process restarts.
  ephemeralSecret ??= randomBytes(32).toString('base64url');
  return ephemeralSecret;
}

export function isSecureOrigin(): boolean {
  return (process.env.APP_BASE_URL ?? '').startsWith('https://');
}

export function sessionCookieName(): string {
  // The __Host- prefix requires Secure; plain-http localhost uses an unprefixed name.
  return isSecureOrigin() ? '__Host-frealgo_session' : 'frealgo_session';
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

export function signSession(payload: SessionPayload, key = secret()): string {
  const body = b64(JSON.stringify(payload));
  const sig = createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  key = secret(),
  now = Date.now(),
): SessionPayload | null {
  if (!token || token.length > 2048) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', key).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.v !== 1 || typeof payload.uid !== 'string' || typeof payload.exp !== 'number')
      return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ userId: string } | null> {
  const jar = await cookies();
  const payload = verifySession(jar.get(sessionCookieName())?.value);
  return payload ? { userId: payload.uid } : null;
}

export function sessionFromRequest(req: Request): { userId: string } | null {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const name = sessionCookieName();
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  const payload = verifySession(match?.slice(name.length + 1));
  return payload ? { userId: payload.uid } : null;
}

export function sessionCookie(uid: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_DAYS * 86_400;
  return {
    name: sessionCookieName(),
    value: signSession({ uid, exp, v: 1 }),
    options: {
      httpOnly: true,
      secure: isSecureOrigin(),
      sameSite: 'lax' as const,
      path: '/',
      maxAge: TTL_DAYS * 86_400,
    },
  };
}
