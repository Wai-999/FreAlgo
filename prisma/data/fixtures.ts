/**
 * FIXTURE DATA — for local development, demos and automated tests only.
 *
 * Every outlet, feed and article here is fictional. Names end in "(Fixture)", URLs use the
 * reserved `.example` TLD (RFC 2606), headlines start with "Fixture", and rows are stored with
 * `isFixture = true` so the UI badges them "Fixture — not real news". Orientation labels below
 * are synthetic values chosen to exercise every UI state; they are NOT assessments of any real
 * outlet. Set SEED_FIXTURES=false to skip them and SHOW_FIXTURES=false to hide them.
 */
import type { Orientation, LabelStatus } from '../../lib/domain/orientation';
import type { SectorSlug } from '../../lib/domain/sectors';

export const FIXTURE_LABEL_METHODOLOGY =
  'FIXTURE LABEL: synthetic value for interface testing only. Not an assessment of any real outlet.';
export const FIXTURE_LABEL_SOURCE = 'https://frealgo.example/fixtures#labels';

export interface FixtureOutlet {
  slug: string;
  name: string;
  countryIso2: string;
  language: string;
  orientation: Orientation;
  labelStatus: LabelStatus;
  labelConfidence: number | null;
  ideologyTags: string[];
  labelContext: string | null;
  labelIsMachine?: boolean;
  paywall: 'NONE' | 'METERED' | 'HARD' | 'UNKNOWN';
  ownershipType: 'PRIVATE' | 'PUBLIC_SERVICE' | 'STATE' | 'NONPROFIT' | 'COOPERATIVE' | 'UNKNOWN';
  excerptAllowed: boolean;
}

export const FIXTURE_OUTLETS: FixtureOutlet[] = [
  {
    slug: 'irrawaddy-ledger-fixture',
    name: 'Irrawaddy Ledger (Fixture)',
    countryIso2: 'MM',
    language: 'en',
    orientation: 'CENTER_LEFT',
    labelStatus: 'REVIEWED',
    labelConfidence: 0.8,
    ideologyTags: ['liberal'],
    labelContext: 'Fictional national context used for fixtures',
    paywall: 'NONE',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
  {
    slug: 'yangon-morning-fixture',
    name: 'Yangon Morning (Fixture)',
    countryIso2: 'MM',
    language: 'my',
    orientation: 'UNRATED',
    labelStatus: 'UNRATED',
    labelConfidence: null,
    ideologyTags: [],
    labelContext: null,
    paywall: 'UNKNOWN',
    ownershipType: 'UNKNOWN',
    excerptAllowed: false,
  },
  {
    slug: 'prairie-standard-fixture',
    name: 'Prairie Standard (Fixture)',
    countryIso2: 'US',
    language: 'en',
    orientation: 'CENTER_RIGHT',
    labelStatus: 'REVIEWED',
    labelConfidence: 0.75,
    ideologyTags: ['conservative'],
    labelContext: 'Fictional two-party context used for fixtures',
    paywall: 'METERED',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
  {
    slug: 'harbor-dispatch-fixture',
    name: 'Harbor Dispatch (Fixture)',
    countryIso2: 'US',
    language: 'en',
    orientation: 'LEFT',
    labelStatus: 'PROVISIONAL',
    labelConfidence: 0.55,
    ideologyTags: ['progressive'],
    labelContext: 'Fictional two-party context used for fixtures',
    paywall: 'HARD',
    ownershipType: 'NONPROFIT',
    excerptAllowed: true,
  },
  {
    slug: 'cerrado-diario-fixture',
    name: 'Cerrado Diário (Fixture)',
    countryIso2: 'BR',
    language: 'pt',
    orientation: 'MIXED',
    labelStatus: 'REVIEWED',
    labelConfidence: 0.6,
    ideologyTags: [],
    labelContext: 'Fictional multi-party context used for fixtures',
    paywall: 'NONE',
    ownershipType: 'COOPERATIVE',
    excerptAllowed: true,
  },
  {
    slug: 'rift-valley-review-fixture',
    name: 'Rift Valley Review (Fixture)',
    countryIso2: 'KE',
    language: 'en',
    orientation: 'CENTER',
    labelStatus: 'REVIEWED',
    labelConfidence: 0.7,
    ideologyTags: [],
    labelContext: 'Fictional national context used for fixtures',
    paywall: 'NONE',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
  {
    slug: 'deccan-observer-fixture',
    name: 'Deccan Observer (Fixture)',
    countryIso2: 'IN',
    language: 'en',
    orientation: 'DISPUTED',
    labelStatus: 'DISPUTED',
    labelConfidence: 0.3,
    ideologyTags: ['nationalist'],
    labelContext: 'Fictional multi-party context used for fixtures; label under appeal',
    paywall: 'METERED',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
  {
    slug: 'rheinblatt-fixture',
    name: 'Rheinblatt (Fixture)',
    countryIso2: 'DE',
    language: 'de',
    orientation: 'CENTER',
    labelStatus: 'PROVISIONAL',
    labelConfidence: 0.4,
    ideologyTags: [],
    labelContext: 'Fictional parliamentary context used for fixtures',
    labelIsMachine: true,
    paywall: 'NONE',
    ownershipType: 'PUBLIC_SERVICE',
    excerptAllowed: true,
  },
  {
    slug: 'kanto-shimbun-fixture',
    name: 'Kanto Shimbun (Fixture)',
    countryIso2: 'JP',
    language: 'ja',
    orientation: 'RIGHT',
    labelStatus: 'PROVISIONAL',
    labelConfidence: 0.5,
    ideologyTags: ['conservative', 'nationalist'],
    labelContext: 'Fictional parliamentary context used for fixtures',
    paywall: 'UNKNOWN',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
  {
    slug: 'sahel-courrier-fixture',
    name: 'Sahel Courrier (Fixture)',
    countryIso2: 'FR',
    language: 'fr',
    orientation: 'CENTER_LEFT',
    labelStatus: 'PROVISIONAL',
    labelConfidence: 0.6,
    ideologyTags: ['social-democratic'],
    labelContext: 'Fictional parliamentary context used for fixtures',
    paywall: 'NONE',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
  {
    slug: 'nile-delta-post-fixture',
    name: 'Nile Delta Post (Fixture)',
    countryIso2: 'EG',
    language: 'ar',
    orientation: 'UNRATED',
    labelStatus: 'UNRATED',
    labelConfidence: null,
    ideologyTags: [],
    labelContext: null,
    paywall: 'NONE',
    ownershipType: 'STATE',
    excerptAllowed: true,
  },
  {
    slug: 'andes-cronica-fixture',
    name: 'Andes Crónica (Fixture)',
    countryIso2: 'MX',
    language: 'es',
    orientation: 'CENTER_RIGHT',
    labelStatus: 'PROVISIONAL',
    labelConfidence: 0.45,
    ideologyTags: ['libertarian'],
    labelContext: 'Fictional presidential context used for fixtures',
    paywall: 'NONE',
    ownershipType: 'PRIVATE',
    excerptAllowed: true,
  },
];

const TOPICS: Record<SectorSlug, string[]> = {
  politics: [
    'parliamentary committee schedule',
    'municipal budget hearing',
    'election commission notice',
    'coalition talks timetable',
  ],
  'business-economics': [
    'port logistics update',
    'small business credit survey',
    'currency market summary',
    'inflation data release',
  ],
  education: [
    'school calendar consultation',
    'university admissions briefing',
    'teacher training programme',
  ],
  technology: [
    'broadband rollout milestone',
    'open data portal launch',
    'semiconductor supply outlook',
  ],
  agriculture: [
    'rice harvest irrigation planning',
    'seed cooperative trial',
    'monsoon rainfall advisory',
    'fisheries quota review',
  ],
  'history-context': [
    'archive digitisation project',
    'heritage site restoration',
    'anniversary explainer',
  ],
  culture: ['film festival programme', 'library reading week', 'music archive exhibition'],
};

/** Localized "fixture" headlines so multilingual/Unicode rendering and search are exercised. */
const LOCALIZED_PREFIX: Record<string, string> = {
  my: 'စမ်းသပ်ဒေတာ',
  pt: 'Dados de teste',
  ja: 'テスト用データ',
  de: 'Testdaten',
  fr: 'Données de test',
  ar: 'بيانات تجريبية',
  es: 'Datos de prueba',
};

const MENTION_COUNTRIES: Record<string, { iso2: string; term: string }> = {
  MM: { iso2: 'TH', term: 'Thailand' },
  US: { iso2: 'CA', term: 'Canada' },
  BR: { iso2: 'AR', term: 'Argentina' },
  KE: { iso2: 'UG', term: 'Uganda' },
  IN: { iso2: 'BD', term: 'Bangladesh' },
  DE: { iso2: 'FR', term: 'France' },
  JP: { iso2: 'KR', term: 'South Korea' },
  FR: { iso2: 'SN', term: 'Senegal' },
  EG: { iso2: 'SD', term: 'Sudan' },
  MX: { iso2: 'GT', term: 'Guatemala' },
};

export interface FixtureArticle {
  outletSlug: string;
  externalId: string;
  url: string;
  title: string;
  excerpt: string | null;
  language: string;
  /** Hours before the seed time when first created (never changed on re-seed). */
  hoursAgo: number;
  sectors: SectorSlug[];
  /** Home country = the fixture feed's declared national scope (FEED_DEFAULT → role FEED_SCOPE). */
  countries: { iso2: string; basis: 'FEED_DEFAULT' | 'TEXT_MATCH'; term?: string }[];
}

const SECTOR_ORDER = Object.keys(TOPICS) as SectorSlug[];

/** Deterministic: the same input always yields the same fixtures (no randomness). */
export function buildFixtureArticles(perOutlet = 14): FixtureArticle[] {
  const out: FixtureArticle[] = [];
  FIXTURE_OUTLETS.forEach((outlet, oi) => {
    for (let i = 0; i < perOutlet; i++) {
      const primary = SECTOR_ORDER[(oi + i) % SECTOR_ORDER.length]!;
      const topics = TOPICS[primary];
      const topic = topics[(oi * 3 + i) % topics.length]!;
      // Every fourth article also carries a second sector (multi-sector tagging).
      const sectors: SectorSlug[] =
        i % 4 === 0 ? [primary, SECTOR_ORDER[(oi + i + 3) % SECTOR_ORDER.length]!] : [primary];
      const mention = MENTION_COUNTRIES[outlet.countryIso2];
      const mentions = mention && i % 5 === 2;
      const country = outlet.countryIso2;
      const localized = LOCALIZED_PREFIX[outlet.language];
      const base = `${topic}${mentions ? ` with ${mention.term}` : ''}`;
      const title = localized
        ? `${localized} — Fixture ${i + 1}: ${base}`
        : `Fixture ${i + 1}: ${base[0]!.toUpperCase()}${base.slice(1)}`;
      out.push({
        outletSlug: outlet.slug,
        externalId: `${outlet.slug}-${i + 1}`,
        url: `https://${outlet.slug}.example/articles/${i + 1}`,
        title,
        excerpt: outlet.excerptAllowed
          ? `Synthetic fixture text for local development about ${topic}. This is not a real news report.`
          : null,
        language: outlet.language,
        hoursAgo: 2 + oi * 1.5 + i * 9,
        sectors,
        countries: [
          { iso2: country, basis: 'FEED_DEFAULT' },
          ...(mentions
            ? [{ iso2: mention.iso2, basis: 'TEXT_MATCH' as const, term: mention.term }]
            : []),
        ],
      });
    }
  });
  return out;
}
