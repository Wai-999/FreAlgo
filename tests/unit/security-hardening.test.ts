import { describe, expect, it } from 'vitest';
import { labelUpdateSchema, sourceUpdateSchema } from '@/lib/admin/service';
import { isAllowedByRobots } from '@/lib/ingest/robots';
import { safeHref } from '@/lib/security/safe-url';

const label = {
  orientation: 'CENTER',
  status: 'PROVISIONAL',
  confidence: 0.5,
  methodology: 'm',
  reviewedAt: null,
  context: null,
  changeReason: 'test change',
};

describe('URL scheme restrictions (stored XSS defence)', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'file:///etc/passwd',
  ])('rejects %s for admin-entered links', (url) => {
    expect(labelUpdateSchema.safeParse({ ...label, sourceUrl: url }).success).toBe(false);
    expect(
      sourceUpdateSchema.safeParse({
        termsReviewed: { licenseNotes: 'reviewed the terms', termsUrl: url, excerptAllowed: true },
      }).success,
    ).toBe(false);
  });

  it('accepts ordinary https links', () => {
    expect(
      labelUpdateSchema.safeParse({ ...label, sourceUrl: 'https://example.org/method' }).success,
    ).toBe(true);
  });

  it('safeHref only lets http(s) through at render time', () => {
    expect(safeHref('https://a.example/x')).toBe('https://a.example/x');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('/relative')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe('robots.txt pattern limits (ReDoS defence)', () => {
  it('ignores pathological patterns quickly instead of backtracking', () => {
    const evil = `User-agent: *\nDisallow: /${'*a'.repeat(40)}*b`;
    const started = performance.now();
    expect(isAllowedByRobots(evil, 'x', `/${'a'.repeat(5000)}`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('still honours normal wildcard rules', () => {
    expect(isAllowedByRobots('User-agent: *\nDisallow: /*.xml$', 'x', '/feed.xml')).toBe(false);
  });
});
