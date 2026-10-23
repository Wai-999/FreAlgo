import { describe, expect, it } from 'vitest';
import { FLAG_NAMES, FLAGS, flagEnvName, flagSnapshot, isEnabled } from '@/lib/flags';

describe('feature flags', () => {
  it('maps flag names to FEATURE_* environment variables', () => {
    expect(flagEnvName('stories')).toBe('FEATURE_STORIES');
    expect(flagEnvName('myWorld')).toBe('FEATURE_MY_WORLD');
    expect(flagEnvName('countryConnections')).toBe('FEATURE_COUNTRY_CONNECTIONS');
  });

  it('uses the documented default when unset, empty or unrecognised', () => {
    for (const name of FLAG_NAMES) {
      const expected = 'locked' in FLAGS[name] ? false : FLAGS[name].default;
      expect(isEnabled(name, {})).toBe(expected);
      expect(isEnabled(name, { [flagEnvName(name)]: '' })).toBe(expected);
      expect(isEnabled(name, { [flagEnvName(name)]: 'maybe' })).toBe(expected);
    }
  });

  it('lets an operator switch features off and on', () => {
    expect(isEnabled('stories', { FEATURE_STORIES: 'false' })).toBe(false);
    expect(isEnabled('stories', { FEATURE_STORIES: '0' })).toBe(false);
    expect(isEnabled('journeys', { FEATURE_JOURNEYS: 'on' })).toBe(true);
  });

  it('never enables a locked flag (AI summaries are not implemented)', () => {
    expect(isEnabled('aiSummaries', { FEATURE_AI_SUMMARIES: 'true' })).toBe(false);
  });

  it('defaults features that need review or curated content to off', () => {
    const snap = flagSnapshot({});
    expect(snap.journeys).toBe(false);
    expect(snap.worldPulse).toBe(false);
    expect(snap.aiSummaries).toBe(false);
  });
});
