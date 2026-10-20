import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/headers';

describe('content security policy', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'abc', isDev: false, upgradeInsecure: true });
  const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

  it('allows scripts only via nonce/strict-dynamic in production', () => {
    expect(directive('script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(directive('script-src')).not.toContain('unsafe-inline');
    expect(directive('script-src')).not.toContain('unsafe-eval');
  });

  it('blocks framing, plugins and foreign form targets', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('only upgrades insecure requests when served over https', () => {
    expect(csp).toContain('upgrade-insecure-requests');
    expect(
      buildContentSecurityPolicy({ nonce: 'x', isDev: false, upgradeInsecure: false }),
    ).not.toContain('upgrade-insecure-requests');
  });

  it('generates unpredictable nonces', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, 'base64')).toHaveLength(16);
  });
});
