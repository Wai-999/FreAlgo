import { describe, expect, it } from 'vitest';
import { matchCountries, tagCountries } from '@/lib/ingest/tagging/countries';
import { tagSectors } from '@/lib/ingest/tagging/sectors';
import { SECTOR_SLUGS } from '@/lib/domain/sectors';

const iso = (text: string, lang = 'en') => matchCountries(text, lang).map((m) => m.iso2);

describe('country text matching', () => {
  it('matches names, aliases and demonyms on word boundaries', () => {
    expect(iso('Floods hit Myanmar as Thai officials meet')).toEqual(['MM', 'TH']);
    expect(iso("Burma's junta and the Kenyan delegation")).toEqual(['MM', 'KE']);
    expect(iso('Nigeria and Niger')).toEqual(['NG']); // bare "Niger" needs corroboration
  });

  it('prefers the longest name (no nested double matches)', () => {
    expect(iso('Papua New Guinea elections')).toEqual(['PG']);
    expect(iso('South Sudan peace deal')).toEqual(['SS']);
    expect(iso('Equatorial Guinea oil')).toEqual(['GQ']);
  });

  it('requires corroboration for ambiguous names', () => {
    expect(iso('Georgia voters head to the polls in Atlanta')).toEqual([]);
    expect(iso('Georgia protests continue in Tbilisi')).toEqual(['GE']);
    expect(iso('Michael Jordan documentary')).toEqual([]);
    expect(iso('Jordan and Amman officials')).toContain('JO');
    expect(iso('Congo river basin')).toEqual([]); // shared by CD and CG
    expect(iso('DR Congo talks in Kinshasa')).toEqual(['CD']);
  });

  it('is case-sensitive so common words do not match', () => {
    expect(iso('china plates and turkey dinner')).toEqual([]);
    expect(iso('CHINA AND JAPAN SIGN DEAL')).toEqual(['CN', 'JP']);
  });

  it('does not treat substrings as matches', () => {
    expect(iso('Omani dates; Indiana results; Malibu fires')).toEqual([]);
  });

  it('matches names in the article language, including scripts without spaces', () => {
    expect(iso('Allemagne et France signent un accord', 'fr')).toEqual(['DE', 'FR']);
    expect(iso('中国の経済と日本', 'ja')).toEqual(['CN', 'JP']);
    expect(iso('မြန်မာ နှင့် ထိုင်း', 'my')).toEqual(['MM', 'TH']);
  });

  it('caps the number of text matches', () => {
    const many = 'France Germany Italy Spain Portugal Poland Sweden Norway';
    expect(iso(many)).toHaveLength(5);
  });
});

describe('tagCountries', () => {
  it('records the basis of every tag and never duplicates a country', () => {
    const tags = tagCountries({
      title: 'Myanmar farmers export rice to Thailand',
      excerpt: null,
      language: 'en',
      sourceCountryIso2: 'MM',
      feedDefaultIso2: ['MM', 'BD'],
    });
    expect(tags).toEqual([
      { iso2: 'MM', basis: 'SOURCE_COUNTRY', matchedTerm: null },
      { iso2: 'BD', basis: 'FEED_DEFAULT', matchedTerm: null },
      { iso2: 'TH', basis: 'TEXT_MATCH', matchedTerm: 'Thailand' },
    ]);
  });
});

describe('tagSectors', () => {
  const valid = new Set<string>(SECTOR_SLUGS);
  it('combines feed defaults, publisher categories and keyword rules with rule ids', () => {
    const tags = tagSectors({
      title: 'Farmers protest as parliament debates rice tariffs',
      excerpt: null,
      language: 'en',
      categories: ['Culture'],
      feedDefaultSlugs: ['history-context', 'not-a-sector'],
      validSlugs: valid,
    });
    const bySlug = Object.fromEntries(tags.map((t) => [t.slug, t]));
    expect(bySlug['history-context']).toMatchObject({ basis: 'FEED_DEFAULT' });
    expect(bySlug['culture']).toMatchObject({ basis: 'FEED_CATEGORY', ruleId: 'category:culture' });
    expect(bySlug['agriculture']).toMatchObject({
      basis: 'KEYWORD_RULE',
      ruleId: 'agriculture.kw.v1',
    });
    expect(bySlug['politics']).toMatchObject({ basis: 'KEYWORD_RULE' });
    expect(bySlug['business-economics']).toMatchObject({ basis: 'KEYWORD_RULE' });
    expect(tags.find((t) => (t.slug as string) === 'not-a-sector')).toBeUndefined();
  });

  it('applies English keyword rules only to English articles but maps foreign categories', () => {
    const tags = tagSectors({
      title: 'Testdaten: Wirtschaft und Schule',
      excerpt: null,
      language: 'de',
      categories: ['Wirtschaft'],
      feedDefaultSlugs: [],
      validSlugs: valid,
    });
    expect(tags).toEqual([
      { slug: 'business-economics', basis: 'FEED_CATEGORY', ruleId: 'category:wirtschaft' },
    ]);
  });

  it('returns no sector rather than guessing', () => {
    expect(
      tagSectors({
        title: 'Fixture headline with nothing specific',
        excerpt: null,
        language: 'en',
        categories: [],
        feedDefaultSlugs: [],
        validSlugs: valid,
      }),
    ).toEqual([]);
  });
});
