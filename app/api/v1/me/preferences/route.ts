import { NextResponse } from 'next/server';
import { ApiError, apiHandler, parseJsonBody } from '@/lib/api/handler';
import { assertSameOrigin } from '@/lib/auth/admin';
import { sessionFromRequest } from '@/lib/auth/session';
import { getPrisma } from '@/lib/db/client';
import {
  readServerPreferences,
  serverPreferencesSchema,
  writeServerPreferences,
} from '@/lib/preferences/server';

/**
 * Opt-in preference sync for signed-in users only. Anonymous requests are rejected; identity is
 * never inferred from IP or fingerprints. Writes require same-origin requests (CSRF defence).
 *   GET    -> stored preferences (?download=1 for a JSON export)
 *   PUT    -> replace stored preferences
 *   DELETE -> erase the stored copy
 */
function requireUser(req: Request): string {
  const s = sessionFromRequest(req);
  if (!s) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to sync preferences');
  return s.userId;
}

const limits = { rateLimit: { bucket: 'prefs', limit: 60, windowSec: 60 } } as const;

export const GET = apiHandler(limits, async (req) => {
  const userId = requireUser(req);
  const prefs = await readServerPreferences(getPrisma(), userId);
  if (!prefs) throw new ApiError(404, 'NOT_FOUND', 'No preferences stored for this account');
  if (req.nextUrl.searchParams.get('download') === '1') {
    return new NextResponse(
      JSON.stringify({ userId, preferences: prefs, exportedAt: new Date().toISOString() }, null, 2),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="frealgo-preferences.json"',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  return { preferences: prefs };
});

export const PUT = apiHandler(limits, async (req) => {
  const userId = requireUser(req);
  assertSameOrigin(req);
  const body = await parseJsonBody(serverPreferencesSchema, req);
  return { preferences: await writeServerPreferences(getPrisma(), userId, body) };
});

export const DELETE = apiHandler(limits, async (req) => {
  const userId = requireUser(req);
  assertSameOrigin(req);
  const { count } = await getPrisma().userPreference.deleteMany({ where: { userId } });
  return { deleted: count > 0 };
});
