// The same cron library BullMQ 5 uses to compute job-scheduler fire times.
import cronParser from 'cron-parser';
import { describe, expect, it } from 'vitest';
import { circuitDelayMs, jobBackoffMs, shouldOpenCircuit } from '@/lib/ingest/backoff';
import { isAllowedByRobots, productToken, robotsDecision } from '@/lib/ingest/robots';
import { fetchJobId, manualJobId, windowStart } from '@/lib/queue/ingest-queue';

describe('robots.txt', () => {
  const robots = `
User-agent: *
Disallow: /private/
Allow: /private/feed.xml

User-agent: FreAlgoFeedReader
Disallow: /blocked-for-us/

User-agent: BadBot
Disallow: /
`;
  const ua = productToken('FreAlgoFeedReader/0.1 (personal reader)');

  it('matches groups by exact product token, not substrings', () => {
    const tricky = 'User-agent: re\nDisallow: /\n\nUser-agent: *\nAllow: /';
    expect(isAllowedByRobots(tricky, ua, '/rss/feed.xml')).toBe(true);
    expect(isAllowedByRobots(tricky, 're', '/rss/feed.xml')).toBe(false);
  });

  it('uses the group for our product token', () => {
    expect(isAllowedByRobots(robots, ua, '/blocked-for-us/rss')).toBe(false);
    // Our group does not disallow /private/, and groups do not merge with "*".
    expect(isAllowedByRobots(robots, ua, '/private/x')).toBe(true);
    expect(isAllowedByRobots(robots, 'otherbot', '/private/x')).toBe(false);
  });

  it('applies longest-match with Allow winning ties, wildcards and $ anchors', () => {
    expect(isAllowedByRobots(robots, 'otherbot', '/private/feed.xml')).toBe(true);
    const wild = 'User-agent: *\nDisallow: /*.php$\nDisallow: /tmp*';
    expect(isAllowedByRobots(wild, 'x', '/index.php')).toBe(false);
    expect(isAllowedByRobots(wild, 'x', '/index.php?a=1')).toBe(true);
    expect(isAllowedByRobots(wild, 'x', '/tmpfile')).toBe(false);
    expect(isAllowedByRobots('User-agent: *\nDisallow:', 'x', '/anything')).toBe(true);
  });

  it('follows RFC 9309 availability rules', () => {
    expect(robotsDecision({ kind: 'unavailable' }, ua, '/feed')).toBe(true);
    expect(robotsDecision({ kind: 'unreachable' }, ua, '/feed')).toBe(false);
  });
});

describe('retry and circuit-breaker policy', () => {
  it('backs off exponentially with jitter and a cap', () => {
    expect(jobBackoffMs(1, () => 0.5)).toBe(30_000);
    expect(jobBackoffMs(2, () => 0.5)).toBe(60_000);
    expect(jobBackoffMs(10, () => 0.5)).toBe(600_000);
    expect(jobBackoffMs(1, () => 0)).toBe(15_000);
    expect(jobBackoffMs(1, () => 0.999)).toBeLessThan(45_000);
  });

  it('pushes the next eligible fetch out from the 3-hour cadence and opens after 8 failures', () => {
    expect(circuitDelayMs(1)).toBe(3 * 3_600_000);
    expect(circuitDelayMs(2)).toBe(6 * 3_600_000);
    expect(circuitDelayMs(5)).toBe(48 * 3_600_000);
    expect(circuitDelayMs(20)).toBe(48 * 3_600_000);
    expect(shouldOpenCircuit(7)).toBe(false);
    expect(shouldOpenCircuit(8)).toBe(true);
  });
});

describe('3-hour cadence (mocked clock)', () => {
  it('assigns every instant to its 3-hour UTC window', () => {
    expect(windowStart(new Date('2026-10-19T00:00:00Z')).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    expect(windowStart(new Date('2026-10-19T02:59:59Z')).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    expect(windowStart(new Date('2026-10-19T03:00:00Z')).toISOString()).toBe(
      '2026-10-19T03:00:00.000Z',
    );
    expect(windowStart(new Date('2026-10-19T23:30:00Z')).toISOString()).toBe(
      '2026-10-19T21:00:00.000Z',
    );
  });

  it('produces the same job id for repeated ticks in one window and a new id in the next', () => {
    const t0 = windowStart(new Date('2026-10-19T06:00:01Z'));
    const t1 = windowStart(new Date('2026-10-19T08:59:00Z'));
    const t2 = windowStart(new Date('2026-10-19T09:00:00Z'));
    expect(fetchJobId('src1', t0)).toBe(fetchJobId('src1', t1));
    expect(fetchJobId('src1', t2)).not.toBe(fetchJobId('src1', t0));
    expect(fetchJobId('src1', t0)).not.toContain(':');
    expect(manualJobId('src1', new Date('2026-10-19T06:00:10Z'))).toBe(
      manualJobId('src1', new Date('2026-10-19T06:00:50Z')),
    );
  });

  it('the default cron fires exactly every 3 hours, 8 times a day, in UTC', () => {
    const it = cronParser.parseExpression('0 */3 * * *', {
      currentDate: new Date('2026-10-19T00:00:01Z'),
      tz: 'UTC',
    });
    const fires = Array.from({ length: 9 }, () => it.next().toDate().toISOString());
    expect(fires.slice(0, 8)).toEqual([
      '2026-10-19T03:00:00.000Z',
      '2026-10-19T06:00:00.000Z',
      '2026-10-19T09:00:00.000Z',
      '2026-10-19T12:00:00.000Z',
      '2026-10-19T15:00:00.000Z',
      '2026-10-19T18:00:00.000Z',
      '2026-10-19T21:00:00.000Z',
      '2026-10-20T00:00:00.000Z',
    ]);
    const gaps = fires.slice(1).map((f, i) => Date.parse(f) - Date.parse(fires[i]!));
    expect(new Set(gaps)).toEqual(new Set([3 * 3_600_000]));
  });
});
