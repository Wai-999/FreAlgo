import { describe, expect, it } from 'vitest';
import { pulseBucket } from '@/lib/db/pulse';
import {
  countriesConflict,
  idfFrom,
  names,
  representative,
  shareName,
  terms,
  type ClusterInput,
} from '@/lib/events/cluster';
import { eventSlug } from '@/lib/events/job';
import { FLAGS, isEnabled } from '@/lib/flags';
import { formatPrecise } from '@/lib/format';
import { methodology } from '@/lib/methodology';

const input = (id: string, title: string, countries: string[] = [], h = 0): ClusterInput => ({
  id,
  publishedAt: new Date(Date.UTC(2026, 9, 20, h)),
  language: 'en',
  terms: terms(title, 'en', countries),
  names: names(title, 'en', countries),
  outletId: id,
});

describe('event evidence rules', () => {
  it('takes capitalised words after the first as names, plus named countries', () => {
    expect(names('Rescuers search homes after Nepal earthquake in Jumla', 'en', ['NP'])).toEqual([
      '@NP',
      'jumla',
      'nepal',
    ]);
    expect(names('Fixture: Myanmar portal', 'en')).toEqual(['myanmar']); // marker word ignored
    expect(names('中国の経済', 'ja')).toEqual([]);
  });

  it('requires a shared name, so common words alone never group reports', () => {
    const a = input('a', 'Eleitores do DF voltam às urnas para escolher', [], 1);
    const b = input('b', 'No Amazonas, eleitores vão escolher entre candidatos', [], 2);
    expect(shareName(a, b)).toBe(false);
    const c = input('c', 'Nigeria confirms Ebola case in Abuja', ['NG']);
    const d = input('d', 'First Ebola patient in Nigeria had travelled', ['NG']);
    expect(shareName(c, d)).toBe(true);
  });

  it('treats reports naming different countries as different events', () => {
    expect(countriesConflict(['@KE', 'bank'], ['@US', 'bank'])).toBe(true);
    expect(countriesConflict(['@KE', 'bank'], ['@KE', '@UG'])).toBe(false);
    expect(countriesConflict(['bank'], ['@US', 'bank'])).toBe(false); // one names none
  });

  it('shows the most representative member headline; ties go to the earliest', () => {
    const m = [
      input('envoy', 'US envoy arrives in Russia ahead of meeting with Putin', ['RU', 'US'], 1),
      input('h1', 'Russia releases US citizen Stephen Hubbard', ['RU', 'US'], 2),
      input(
        'h2',
        'US citizen Stephen Hubbard freed by Russia as envoy meets Putin',
        ['RU', 'US'],
        3,
      ),
    ];
    const idf = idfFrom(m.map((x) => x.terms));
    expect(m[representative(m, idf)]!.id).toBe('h2');
    const twins = [
      input('later', 'Same words here', [], 5),
      input('early', 'Same words here', [], 1),
    ];
    expect(twins[representative(twins, idfFrom(twins.map((x) => x.terms)))]!.id).toBe('early');
  });

  it('builds stable, readable event addresses', () => {
    const s = eventSlug(
      'Nigeria confirms an Ebola case in Abuja!',
      new Date('2026-10-20T20:19:16Z'),
      'a1',
    );
    expect(s).toMatch(/^2026-10-20-nigeria-confirms-an-ebola-case-in-abuja-[0-9a-f]{6}$/);
    expect(eventSlug('Ação é já', new Date('2026-10-20T00:00:00Z'), 'x')).toMatch(
      /^2026-10-20-acao-e-ja-/,
    );
    expect(eventSlug('???', new Date('2026-10-20T00:00:00Z'), 'x')).toMatch(/^2026-10-20-event-/);
  });
});

describe('World Pulse and curated dates', () => {
  it('bands raw counts with zero kept separate', () => {
    expect([0, 1, 2, 3, 9, 10, 29, 30, 500].map(pulseBucket)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('shows a curated date only as precisely as it is known', () => {
    expect(formatPrecise('2025-10-05T00:00:00Z', 'DAY')).toBe('2025-10-05');
    expect(formatPrecise('2025-10-05T00:00:00Z', 'MONTH')).toBe('October 2025');
    expect(formatPrecise('2025-10-05T00:00:00Z', 'YEAR')).toBe('2025');
  });
});

describe('M4 flags and methodology', () => {
  it('turns Perspectives on by default and keeps the unreviewed extras off', () => {
    expect(isEnabled('perspectives', {})).toBe(true);
    expect(isEnabled('eventClustering', {})).toBe(true);
    for (const f of ['journeys', 'worldPulse', 'countryConnections'] as const)
      expect(isEnabled(f, {})).toBe(false);
    expect(isEnabled('aiSummaries', { FEATURE_AI_SUMMARIES: 'true' })).toBe(false);
    expect(FLAGS.aiSummaries.locked).toBeTruthy();
  });

  it('publishes every rule with its version and the live flag state', () => {
    const m = methodology({ FEATURE_JOURNEYS: 'true' });
    expect(m.events.version).toBe(1);
    expect(m.events.thresholds).toEqual({
      join: 0.3,
      joinMean: 0.25,
      minSharedDistinctiveWords: 2,
    });
    expect(m.aiSummaries.enabled).toBe(false);
    expect(m.features.find((f) => f.name === 'journeys')?.enabled).toBe(true);
    // Only the allow-listed, reader-chosen orderings exist.
    expect(Object.keys(m.ordering.sorts).sort()).toEqual([
      'alphabetical',
      'newest',
      'oldest',
      'outlet',
      'relevance',
    ]);
  });
});
