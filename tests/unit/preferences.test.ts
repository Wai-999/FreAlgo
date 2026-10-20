import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_BOOT_SCRIPT,
  parsePreferences,
  serializePreferences,
} from '@/lib/preferences/schema';

describe('preference serialization', () => {
  it('round-trips a full preference object', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      showIntro: false,
      motion: 'reduce' as const,
      pinnedCountries: ['MM', 'KE'],
      sectors: ['agriculture'],
      orientations: ['CENTER' as const, 'UNRATED' as const],
      languages: ['en', 'my'],
      preferredSort: 'oldest' as const,
    };
    expect(parsePreferences(serializePreferences(prefs))).toEqual(prefs);
  });

  it('returns defaults for missing or corrupt storage', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{not json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('42')).toEqual(DEFAULT_PREFERENCES);
  });

  it('salvages valid fields when one field is invalid', () => {
    const parsed = parsePreferences(
      JSON.stringify({ showIntro: false, sectors: ['not-a-sector'], pinnedCountries: ['mm'] }),
    );
    expect(parsed.showIntro).toBe(false);
    expect(parsed.sectors).toEqual([]);
    expect(parsed.pinnedCountries).toEqual(['MM']);
  });

  it('drops unknown keys (no smuggled tracking fields)', () => {
    const parsed = parsePreferences(JSON.stringify({ showIntro: true, readingHistory: ['x'] }));
    expect(parsed).not.toHaveProperty('readingHistory');
  });

  it('boot script is self-contained and references the storage key', () => {
    expect(PREFERENCE_BOOT_SCRIPT).toContain('frealgo:prefs:v1');
    expect(PREFERENCE_BOOT_SCRIPT).not.toMatch(/fetch|XMLHttpRequest|sendBeacon/);
  });
});
