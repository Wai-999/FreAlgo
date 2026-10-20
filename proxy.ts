import { NextResponse, type NextRequest } from 'next/server';
import {
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  generateNonce,
} from '@/lib/security/headers';

/**
 * Next.js 16 proxy (formerly middleware): per-request CSP nonce + security headers for pages.
 * API routes set their own headers in lib/api/handler.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === 'development';
  const baseUrl = process.env.APP_BASE_URL ?? '';
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev,
    upgradeInsecure: baseUrl.startsWith('https://'),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) response.headers.set(k, v);
  if (baseUrl.startsWith('https://')) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|geo/|robots.txt).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
