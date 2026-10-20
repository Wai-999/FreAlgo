import { assertSameOrigin } from '@/lib/auth/admin';
import { sessionCookieName } from '@/lib/auth/session';
import { apiHandler, seeOther } from '@/lib/api/handler';

export const POST = apiHandler({}, async (req) => {
  assertSameOrigin(req);
  const res = seeOther('/account');
  res.cookies.delete(sessionCookieName());
  return res;
});
