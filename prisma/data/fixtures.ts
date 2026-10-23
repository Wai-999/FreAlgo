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

/** "with" in the outlet's language, so localized fixtures read like their language. */
const WITH: Record<string, string> = { pt: 'com', es: 'con', fr: 'avec' };

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

export type FixtureArticleType = 'NEWS' | 'OPINION' | 'ANALYSIS' | 'UNKNOWN';

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
  /** Set for fixture event reports (publisher-declared type is simulated by the fixture). */
  articleType?: FixtureArticleType;
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
      const base = `${topic}${mentions ? ` ${WITH[outlet.language] ?? 'with'} ${mention.term}` : ''}`;
      // Topic text stays lower-case: these placeholders are not events, and event clustering
      // requires a shared name (a capitalised word), so identical placeholders never group.
      const title = localized
        ? `${localized} — Fixture ${i + 1}: ${base}`
        : `Fixture ${i + 1}: ${base}`;
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

/**
 * Fictional multi-outlet events for Story Mode and Perspectives (FreAlgo 2.0, M4). Each is
 * covered by several fixture outlets with different synthetic labels, and includes news,
 * analysis and opinion pieces, so every comparison state is exercised. These are not real events;
 * the clustering method groups them exactly as it groups real reports.
 */
interface EventReport {
  outlet: string;
  hoursAgo: number;
  title: string;
  type: FixtureArticleType;
  named: { iso2: string; term: string }[];
}

const FIXTURE_EVENTS: { key: string; language: string; reports: EventReport[] }[] = [
  {
    key: 'salween',
    language: 'en',
    reports: [
      {
        outlet: 'irrawaddy-ledger-fixture',
        hoursAgo: 30,
        title: 'Fixture: Myanmar and Thailand agree shared Salween river data portal',
        type: 'NEWS',
        named: [
          { iso2: 'MM', term: 'Myanmar' },
          { iso2: 'TH', term: 'Thailand' },
        ],
      },
      {
        outlet: 'prairie-standard-fixture',
        hoursAgo: 28.5,
        title: 'Fixture: Salween river data portal agreed by Thailand and Myanmar after talks',
        type: 'NEWS',
        named: [
          { iso2: 'TH', term: 'Thailand' },
          { iso2: 'MM', term: 'Myanmar' },
        ],
      },
      {
        outlet: 'harbor-dispatch-fixture',
        hoursAgo: 26,
        title: 'Fixture: Funding questions follow the Salween river data portal deal',
        type: 'NEWS',
        named: [],
      },
      {
        outlet: 'rift-valley-review-fixture',
        hoursAgo: 22,
        title: 'Fixture analysis: What the Salween river data portal could mean for flood warnings',
        type: 'ANALYSIS',
        named: [],
      },
      {
        outlet: 'deccan-observer-fixture',
        hoursAgo: 18,
        title: 'Fixture opinion: The Salween river data portal is a model worth copying',
        type: 'OPINION',
        named: [],
      },
    ],
  },
  {
    key: 'minigrid',
    language: 'en',
    reports: [
      {
        outlet: 'rift-valley-review-fixture',
        hoursAgo: 44,
        title: 'Fixture: Kenya opens tender for 40 solar mini-grids in northern counties',
        type: 'NEWS',
        named: [{ iso2: 'KE', term: 'Kenya' }],
      },
      {
        outlet: 'prairie-standard-fixture',
        hoursAgo: 40,
        title: 'Fixture: Kenya solar mini-grid tender draws bids from twelve firms',
        type: 'NEWS',
        named: [{ iso2: 'KE', term: 'Kenya' }],
      },
      {
        outlet: 'deccan-observer-fixture',
        hoursAgo: 36,
        title: 'Fixture: Indian firms bid in the Kenya solar mini-grid tender',
        type: 'NEWS',
        named: [
          { iso2: 'IN', term: 'Indian' },
          { iso2: 'KE', term: 'Kenya' },
        ],
      },
      {
        outlet: 'harbor-dispatch-fixture',
        hoursAgo: 33,
        title: 'Fixture opinion: Kenya solar mini-grid tender needs clearer community consultation',
        type: 'OPINION',
        named: [{ iso2: 'KE', term: 'Kenya' }],
      },
    ],
  },
  {
    key: 'cerrado',
    language: 'pt',
    reports: [
      {
        outlet: 'cerrado-diario-fixture',
        hoursAgo: 20,
        title: 'Dados de teste: Goiás anuncia plano de irrigação para o Cerrado',
        type: 'NEWS',
        named: [],
      },
      {
        outlet: 'cerrado-diario-fixture',
        hoursAgo: 15,
        title: 'Dados de teste: Plano de irrigação do Cerrado prevê consulta a agricultores',
        type: 'NEWS',
        named: [],
      },
    ],
  },
];

/** externalId of the first report of a fixture event (used to attach curated timeline items). */
export const fixtureEventAnchor = (key: string) => `fixture-event-${key}-1`;

export function buildFixtureEventArticles(): FixtureArticle[] {
  const home = new Map(FIXTURE_OUTLETS.map((o) => [o.slug, o]));
  return FIXTURE_EVENTS.flatMap((ev) =>
    ev.reports.map((r, i) => {
      const outlet = home.get(r.outlet)!;
      return {
        outletSlug: r.outlet,
        externalId: `fixture-event-${ev.key}-${i + 1}`,
        url: `https://${r.outlet}.example/events/${ev.key}-${i + 1}`,
        title: r.title,
        excerpt: outlet.excerptAllowed
          ? 'Synthetic fixture text for a fictional event. This is not a real news report.'
          : null,
        language: ev.language,
        hoursAgo: r.hoursAgo,
        sectors: ['technology'] as SectorSlug[],
        articleType: r.type,
        countries: r.named.length
          ? r.named.map((n) => ({ iso2: n.iso2, basis: 'TEXT_MATCH' as const, term: n.term }))
          : [{ iso2: outlet.countryIso2, basis: 'FEED_DEFAULT' as const }],
      };
    }),
  );
}

/**
 * Curated timeline items for the fictional Salween event. Real timeline items need a named
 * curator and a source URL; fixtures point at the reserved .example domain.
 */
export const FIXTURE_TIMELINE: {
  event: string;
  daysFromSeed: number;
  precision: 'DAY' | 'MONTH' | 'YEAR';
  kind: 'FACT' | 'INTERPRETATION' | 'ANALOGY';
  text: string;
  source: string;
}[] = [
  {
    event: 'salween',
    daysFromSeed: -400,
    precision: 'MONTH',
    kind: 'FACT',
    text: 'Fixture: the two governments first discussed sharing river gauge readings (fictional).',
    source: 'irrawaddy-ledger-fixture',
  },
  {
    event: 'salween',
    daysFromSeed: -90,
    precision: 'DAY',
    kind: 'INTERPRETATION',
    text: 'Fixture: a fictional analyst argued that missing gauge data delayed flood warnings.',
    source: 'rift-valley-review-fixture',
  },
  {
    event: 'salween',
    daysFromSeed: -30,
    precision: 'YEAR',
    kind: 'ANALOGY',
    text: 'Fixture: a fictional commentator compared the portal to older river-basin agreements. This is a comparison, not a fact about this event.',
    source: 'deccan-observer-fixture',
  },
  {
    event: 'salween',
    daysFromSeed: 14,
    precision: 'DAY',
    kind: 'FACT',
    text: 'Fixture: the technical committee is scheduled to meet (fictional date).',
    source: 'prairie-standard-fixture',
  },
];

/** A fictional, flag-gated Story Journey that follows the fixture events across countries. */
export const FIXTURE_JOURNEY = {
  slug: 'fixture-river-and-sun',
  title: 'Fixture journey: water data and solar power',
  description:
    'A fictional guided sequence that follows two fixture events across four countries. It exists to test the journey interface.',
  caveats:
    'Every step is fictional fixture data. The links between steps are stated by the fixture curator and point at fixture reports; they are examples, not findings.',
  nodes: [
    {
      iso2: 'MM',
      event: 'salween',
      kind: 'FACT' as const,
      title: 'Myanmar: a shared river data portal',
      explanation:
        'The fixture event starts with an agreement reported by a Myanmar fixture outlet.',
      evidence: 'irrawaddy-ledger-fixture',
      uncertainty: null,
    },
    {
      iso2: 'TH',
      event: 'salween',
      kind: 'FACT' as const,
      title: 'Thailand: the other party to the agreement',
      explanation: 'Thailand is named in the same fixture reports as the second party.',
      evidence: 'prairie-standard-fixture',
      uncertainty: null,
    },
    {
      iso2: 'KE',
      event: 'minigrid',
      kind: 'INTERPRETATION' as const,
      title: 'Kenya: infrastructure tenders and public data',
      explanation:
        'A fixture analysis links flood-warning data to planning for rural energy. This link is an interpretation, not a reported fact.',
      evidence: 'rift-valley-review-fixture',
      uncertainty: 'The connection between the two fixture events is the curator’s interpretation.',
    },
    {
      iso2: 'IN',
      event: 'minigrid',
      kind: 'FACT' as const,
      title: 'India: firms bidding abroad',
      explanation: 'A fixture report says Indian firms bid in the Kenyan tender.',
      evidence: 'deccan-observer-fixture',
      uncertainty: null,
    },
  ],
};
