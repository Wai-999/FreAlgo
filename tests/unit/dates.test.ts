import { describe, expect, it } from 'vitest';
import { decidePublishedAt, parsePublicationDate } from '@/lib/ingest/dates';

const iso = (raw: string) => parsePublicationDate(raw)?.utc.toISOString();

describe('parsePublicationDate', () => {
  it('parses RFC 822 with numeric offsets and keeps the offset', () => {
    const d = parsePublicationDate('Mon, 19 Oct 2026 08:30:00 +0630');
    expect(d?.utc.toISOString()).toBe('2026-10-19T02:00:00.000Z');
    expect(d?.offsetMinutes).toBe(390);
    expect(d?.assumedUtc).toBe(false);
  });

  it('parses named zones, missing weekday/seconds and two-digit years', () => {
    expect(iso('Sun, 18 Oct 2026 22:15:00 GMT')).toBe('2026-10-18T22:15:00.000Z');
    expect(iso('18 Oct 2026 17:15 EST')).toBe('2026-10-18T22:15:00.000Z');
    expect(iso('Sat, 17 Oct 26 10:00:00 PDT')).toBe('2026-10-17T17:00:00.000Z');
    expect(iso('19 Sept 2026 12:00:00 JST')).toBe('2026-09-19T03:00:00.000Z');
  });

  it('parses ISO 8601 / RFC 3339 variants', () => {
    expect(iso('2026-10-19T06:00:00+02:00')).toBe('2026-10-19T04:00:00.000Z');
    expect(iso('2026-10-19T06:00:00.123Z')).toBe('2026-10-19T06:00:00.123Z');
    expect(iso('2026-10-19 06:00:00-0500')).toBe('2026-10-19T11:00:00.000Z');
    expect(iso('2026-10-19T06:00+09')).toBe('2026-10-18T21:00:00.000Z');
  });

  it('assumes UTC (and says so) when no zone is given', () => {
    const d = parsePublicationDate('2026-10-19T06:00:00');
    expect(d?.utc.toISOString()).toBe('2026-10-19T06:00:00.000Z');
    expect(d?.offsetMinutes).toBeNull();
    expect(d?.assumedUtc).toBe(true);
  });

  it.each([
    '',
    'yesterday',
    '31 Feb 2026 10:00:00 GMT',
    '2026-13-01T00:00:00Z',
    'Mon, 19 Foo 2026 08:30:00 GMT',
    '19 Oct 2026 08:30:00 XYZT',
  ])('rejects invalid input %j', (raw) => {
    expect(parsePublicationDate(raw)).toBeNull();
  });
});

describe('decidePublishedAt', () => {
  const seen = new Date('2026-10-19T12:00:00Z');

  it('uses first-seen time and marks it estimated when the date is missing or bad', () => {
    expect(decidePublishedAt(null, seen)).toMatchObject({
      kind: 'ok',
      estimated: true,
      publishedAt: seen,
    });
    expect(decidePublishedAt('garbage', seen)).toMatchObject({
      kind: 'ok',
      estimated: true,
      note: 'unparseable-date',
    });
    expect(decidePublishedAt('1 Jan 1970 00:00:00 GMT', seen)).toMatchObject({ estimated: true });
  });

  it('clamps small future skew and quarantines far-future timestamps', () => {
    expect(decidePublishedAt('2026-10-19T12:10:00Z', seen)).toMatchObject({
      kind: 'ok',
      estimated: false,
    });
    expect(decidePublishedAt('2026-10-19T18:00:00Z', seen)).toMatchObject({
      kind: 'ok',
      estimated: true,
      note: 'future-clamped',
    });
    expect(decidePublishedAt('2100-01-01T00:00:00Z', seen)).toMatchObject({
      kind: 'quarantine',
      reason: 'future-timestamp',
    });
  });

  it('keeps valid past timestamps exactly', () => {
    const d = decidePublishedAt('Mon, 19 Oct 2026 08:30:00 +0630', seen);
    expect(d).toMatchObject({ kind: 'ok', estimated: false, offsetMinutes: 390 });
    expect(d.publishedAt.toISOString()).toBe('2026-10-19T02:00:00.000Z');
  });
});
