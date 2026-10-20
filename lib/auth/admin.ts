import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/api/handler';
import { getSession, sessionFromRequest } from './session';

/**
 * Server-side admin authorization. Hidden UI is never the control: every admin route and server
 * action calls one of these. Two credentials are accepted:
 *  - Authorization: Bearer <ADMIN_API_TOKEN>        (automation / CLI)
 *  - a session whose user id is in ADMIN_USER_IDS   (admin UI; same-origin required for writes)
 */

function adminIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenMatches(given: string): boolean {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdminUser(userId: string | null | undefined): boolean {
  return !!userId && adminIds().includes(userId);
}

/** For route handlers. Returns the actor id for audit logs or throws 401/403. */
export function requireAdminRequest(req: Request): string {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    if (tokenMatches(auth.slice(7).trim())) return 'token:admin-api';
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid admin token');
  }
  const session = sessionFromRequest(req);
  if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in as an administrator');
  if (!isAdminUser(session.userId)) throw new ApiError(403, 'FORBIDDEN', 'Not an administrator');
  if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
  return session.userId;
}

/** Cookie-authenticated writes must come from our own origin (CSRF defence with SameSite=Lax). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const allowed = new Set<string>();
  if (process.env.APP_BASE_URL) allowed.add(new URL(process.env.APP_BASE_URL).origin);
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!origin || !allowed.has(origin))
    throw new ApiError(403, 'CSRF_REJECTED', 'Cross-origin request rejected');
}

/** For server components / server actions. */
export async function getAdminActor(): Promise<string | null> {
  const session = await getSession();
  return session && isAdminUser(session.userId) ? session.userId : null;
}

export async function requireAdminActor(): Promise<string> {
  const actor = await getAdminActor();
  if (!actor) throw new Error('Not authorized');
  return actor;
}
