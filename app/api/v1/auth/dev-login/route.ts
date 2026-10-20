import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/auth/admin';
import { sessionCookie } from '@/lib/auth/session';
import { ApiError, apiHandler, seeOther } from '@/lib/api/handler';
import { getEnv, isLocalHostname } from '@/lib/env';

const form = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,32}$/, 'Use 2–32 lowercase letters, digits or hyphens'),
});

/**
 * Local-development sign-in: creates a session for the test identity "dev:<name>" without a
 * password. Disabled unless AUTH_DEV_LOGIN=true AND the app runs on a localhost origin.
 */
export const POST = apiHandler(
  { rateLimit: { bucket: 'auth', limit: 10, windowSec: 60 } },
  async (req: NextRequest) => {
    const env = getEnv();
    if (!env.AUTH_DEV_LOGIN || !isLocalHostname(new URL(env.APP_BASE_URL).hostname)) {
      throw new ApiError(404, 'NOT_FOUND', 'Not available');
    }
    assertSameOrigin(req);
    const data = await req.formData();
    const { name } = form.parse({ name: data.get('name') });
    const cookie = sessionCookie(`dev:${name}`);
    const res = seeOther('/account');
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  },
);
