import { describe, expect, it } from 'vitest';
import { matchCountries, tagCountries } from '@/lib/ingest/tagging/countries';
import { tagSectors } from '@/lib/ingest/tagging/sectors';
import { classifyArticleType } from '@/lib/ingest/tagging/article-type';
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

describe('tagCountries (rules v2: roles)', () => {
  it('lets text evidence win over the publisher country and records every role', () => {
    const tags = tagCountries({
      title: 'Myanmar farmers export rice to Thailand',
      excerpt: null,
      language: 'en',
      sourceCountryIso2: 'MM',
      feedDefaultIso2: ['MM', 'BD'],
    });
    expect(tags).toEqual([
      { iso2: 'MM', basis: 'TEXT_MATCH', role: 'SUBJECT', matchedTerm: 'Myanmar' },
      { iso2: 'TH', basis: 'TEXT_MATCH', role: 'SUBJECT', matchedTerm: 'Thailand' },
      { iso2: 'BD', basis: 'FEED_DEFAULT', role: 'FEED_SCOPE', matchedTerm: null },
    ]);
  });

  it('assigns a cross-border story to its subjects, not its publisher (production example)', () => {
    const tags = tagCountries({
      title: 'US citizen Stephen Hubbard freed by Russia as Trump envoy meets Putin',
      excerpt: null,
      language: 'en',
      sourceCountryIso2: 'GB', // BBC
      feedDefaultIso2: [],
    });
    const byIso = Object.fromEntries(tags.map((t) => [t.iso2, t.role]));
    expect(byIso).toEqual({ US: 'SUBJECT', RU: 'SUBJECT', GB: 'PUBLISHER_HOME' });
  });

  it('marks a story that names no country as publisher-home only', () => {
    expect(
      tagCountries({
        title: 'Scientists discover a new species of deep-sea octopus',
        excerpt: null,
        language: 'en',
        sourceCountryIso2: 'GB',
        feedDefaultIso2: [],
      }),
    ).toEqual([{ iso2: 'GB', basis: 'SOURCE_COUNTRY', role: 'PUBLISHER_HOME', matchedTerm: null }]);
  });

  it('matches the upper-case US but not the pronoun "us" or a US$ currency amount', () => {
    expect(matchCountries('Tell us what you think', 'en')).toEqual([]);
    expect(matchCountries('Brazil borrows US$5bn from lenders', 'en').map((m) => m.iso2)).toEqual([
      'BR',
    ]);
    expect(matchCountries('US and EU agree on tariffs', 'en').map((m) => m.iso2)).toEqual(['US']);
  });
});

describe('classifyArticleType', () => {
  it('uses publisher evidence only and defaults to UNKNOWN', () => {
    expect(
      classifyArticleType({ url: 'https://ex.com/world/a', categories: ['Opinion'], title: 'x' }),
    ).toEqual({ type: 'OPINION', basis: 'category "Opinion"' });
    expect(
      classifyArticleType({
        url: 'https://ex.com/commentisfree/2026/x',
        categories: [],
        title: 'x',
      }),
    ).toMatchObject({ type: 'OPINION', basis: 'URL path /commentisfree/' });
    expect(
      classifyArticleType({
        url: 'https://ex.com/a',
        categories: [],
        title: 'Analysis: why rice matters',
      }),
    ).toMatchObject({ type: 'ANALYSIS' });
    expect(
      classifyArticleType({ url: 'https://ex.com/a', categories: ['Opinião'], title: 'x' }),
    ).toMatchObject({ type: 'OPINION' });
  });

  it('does not mistake slugs or news sections for opinion', () => {
    for (const url of [
      'https://ex.com/world/leader-of-the-opposition-resigns',
      'https://ex.com/news/comments-sought-on-plan',
      'https://ex.com/politics/2026/10/21/budget',
    ]) {
      expect(
        classifyArticleType({ url, categories: ['World', 'Politics'], title: 'Budget passes' }),
      ).toEqual({ type: 'UNKNOWN', basis: null });
    }
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

describe('tagSectors (rules v2: languages)', () => {
  const valid = new Set<string>(SECTOR_SLUGS);
  it('applies Portuguese rules to Portuguese articles only', () => {
    const pt = tagSectors({
      title: 'Senado aprova reforma tributária; inflação desacelera',
      excerpt: null,
      language: 'pt-BR',
      categories: [],
      feedDefaultSlugs: [],
      validSlugs: valid,
    }).map((t) => t.ruleId);
    expect(pt).toEqual(
      expect.arrayContaining(['politics.kw.pt.v2', 'business-economics.kw.pt.v2']),
    );
    const en = tagSectors({
      title: 'Senado aprova reforma tributária',
      excerpt: null,
      language: 'en',
      categories: [],
      feedDefaultSlugs: [],
      validSlugs: valid,
    });
    expect(en).toEqual([]);
  });
});
