import type { SectorSlug } from '../../domain/sectors';

/**
 * Deterministic sector tagging, rules version 1. Each tag stores the rule id that produced it.
 *  1. FEED_DEFAULT  — sectors declared on the feed (e.g. a business-section feed)
 *  2. FEED_CATEGORY — the publisher's own <category> mapped through CATEGORY_MAP (multilingual)
 *  3. KEYWORD_RULE  — whole-word keyword rules on headline + excerpt (English; extendable)
 * No match => no sector tag (the story still appears under "All").
 */
export const SECTOR_RULES_VERSION = 1;

export type SectorTag = {
  slug: SectorSlug;
  basis: 'FEED_DEFAULT' | 'FEED_CATEGORY' | 'KEYWORD_RULE';
  ruleId: string;
};

const CATEGORY_MAP: Record<string, SectorSlug> = {
  // English
  politics: 'politics',
  election: 'politics',
  elections: 'politics',
  government: 'politics',
  'world politics': 'politics',
  business: 'business-economics',
  economy: 'business-economics',
  economics: 'business-economics',
  markets: 'business-economics',
  finance: 'business-economics',
  money: 'business-economics',
  education: 'education',
  schools: 'education',
  'higher education': 'education',
  technology: 'technology',
  tech: 'technology',
  science: 'technology',
  'science & technology': 'technology',
  'science and technology': 'technology',
  agriculture: 'agriculture',
  farming: 'agriculture',
  food: 'agriculture',
  history: 'history-context',
  explainer: 'history-context',
  analysis: 'history-context',
  culture: 'culture',
  arts: 'culture',
  'arts & culture': 'culture',
  entertainment: 'culture',
  books: 'culture',
  film: 'culture',
  music: 'culture',
  sport: 'culture',
  sports: 'culture',
  // French
  politique: 'politics',
  économie: 'business-economics',
  economie: 'business-economics',
  éducation: 'education',
  technologie: 'technology',
  sciences: 'technology',
  histoire: 'history-context',
  // German
  politik: 'politics',
  wirtschaft: 'business-economics',
  bildung: 'education',
  wissen: 'technology',
  technik: 'technology',
  landwirtschaft: 'agriculture',
  geschichte: 'history-context',
  kultur: 'culture',
  // Spanish / Portuguese
  política: 'politics',
  economía: 'business-economics',
  economia: 'business-economics',
  educación: 'education',
  educação: 'education',
  tecnología: 'technology',
  tecnologia: 'technology',
  ciência: 'technology',
  ciencia: 'technology',
  agricultura: 'agriculture',
  agronegócio: 'agriculture',
  historia: 'history-context',
  história: 'history-context',
  cultura: 'culture',
  // Japanese / Chinese
  政治: 'politics',
  経済: 'business-economics',
  经济: 'business-economics',
  科学: 'technology',
  文化: 'culture',
};

const KEYWORD_RULES: { id: string; slug: SectorSlug; terms: string[] }[] = [
  {
    id: 'politics.kw.v1',
    slug: 'politics',
    terms: [
      'election',
      'elections',
      'parliament',
      'parliamentary',
      'senate',
      'congress',
      'cabinet',
      'minister',
      'prime minister',
      'president',
      'presidential',
      'legislation',
      'lawmakers',
      'coalition',
      'referendum',
      'ballot',
      'opposition',
      'diplomacy',
      'diplomatic',
      'sanctions',
      'junta',
      'coup',
      'protest',
      'protesters',
      'governor',
      'mayor',
      'municipal',
      'constitution',
      'constitutional',
      'treaty',
      'summit',
      'election commission',
    ],
  },
  {
    id: 'business.kw.v1',
    slug: 'business-economics',
    terms: [
      'economy',
      'economic',
      'inflation',
      'interest rate',
      'interest rates',
      'central bank',
      'gdp',
      'recession',
      'market',
      'markets',
      'stocks',
      'shares',
      'currency',
      'exchange rate',
      'trade',
      'tariff',
      'tariffs',
      'exports',
      'imports',
      'budget',
      'tax',
      'taxes',
      'debt',
      'company',
      'companies',
      'investment',
      'investors',
      'jobs',
      'unemployment',
      'wages',
      'bank',
      'banks',
      'credit',
      'oil price',
      'oil prices',
      'logistics',
      'small business',
    ],
  },
  {
    id: 'education.kw.v1',
    slug: 'education',
    terms: [
      'school',
      'schools',
      'university',
      'universities',
      'students',
      'student',
      'teachers',
      'teacher',
      'curriculum',
      'exam',
      'exams',
      'education',
      'admissions',
      'scholarship',
      'literacy',
      'campus',
      'tuition',
      'classroom',
    ],
  },
  {
    id: 'technology.kw.v1',
    slug: 'technology',
    terms: [
      'technology',
      'tech',
      'artificial intelligence',
      'ai',
      'software',
      'internet',
      'broadband',
      'cyber',
      'cybersecurity',
      'semiconductor',
      'semiconductors',
      'chips',
      'smartphone',
      'digital',
      'startup',
      'startups',
      'telecom',
      'satellite',
      'robot',
      'robotics',
      'open data',
      'electric vehicle',
      'electric vehicles',
    ],
  },
  {
    id: 'agriculture.kw.v1',
    slug: 'agriculture',
    terms: [
      'agriculture',
      'agricultural',
      'farm',
      'farms',
      'farmer',
      'farmers',
      'farming',
      'crop',
      'crops',
      'harvest',
      'rice',
      'wheat',
      'maize',
      'livestock',
      'cattle',
      'irrigation',
      'fertiliser',
      'fertilizer',
      'drought',
      'fisheries',
      'fishing',
      'food security',
      'seeds',
      'monsoon',
      'cocoa',
      'coffee',
      'soybean',
      'soybeans',
    ],
  },
  {
    id: 'history.kw.v1',
    slug: 'history-context',
    terms: [
      'history',
      'historic',
      'historical',
      'anniversary',
      'heritage',
      'archive',
      'archives',
      'archaeology',
      'archaeologists',
      'colonial',
      'centenary',
      'commemoration',
      'memorial',
      'explainer',
      'timeline',
    ],
  },
  {
    id: 'culture.kw.v1',
    slug: 'culture',
    terms: [
      'culture',
      'cultural',
      'film',
      'films',
      'cinema',
      'festival',
      'music',
      'musician',
      'album',
      'concert',
      'artist',
      'artists',
      'exhibition',
      'museum',
      'library',
      'literature',
      'novel',
      'books',
      'theatre',
      'theater',
      'religion',
      'religious',
      'football',
      'cricket',
      'olympic',
      'olympics',
      'sport',
      'sports',
    ],
  },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COMPILED = KEYWORD_RULES.map((r) => ({
  ...r,
  regex: new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${r.terms
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join('|')})(?![\\p{L}\\p{N}])`,
    'iu',
  ),
}));

/** Keyword rules are English-only; other languages rely on feed defaults and categories. */
function keywordRulesApply(language: string | null): boolean {
  return !language || language.toLowerCase().startsWith('en');
}

export function tagSectors(input: {
  title: string;
  language: string | null;
  excerpt: string | null;
  categories: string[];
  feedDefaultSlugs: string[];
  validSlugs: ReadonlySet<string>;
}): SectorTag[] {
  const tags = new Map<SectorSlug, SectorTag>();
  for (const slug of input.feedDefaultSlugs) {
    if (input.validSlugs.has(slug)) {
      tags.set(slug as SectorSlug, {
        slug: slug as SectorSlug,
        basis: 'FEED_DEFAULT',
        ruleId: 'feed.default',
      });
    }
  }
  for (const raw of input.categories) {
    const key = raw.trim().toLowerCase();
    const slug = CATEGORY_MAP[key];
    if (slug && !tags.has(slug)) {
      tags.set(slug, { slug, basis: 'FEED_CATEGORY', ruleId: `category:${key.slice(0, 40)}` });
    }
  }
  if (!keywordRulesApply(input.language)) return [...tags.values()];
  const text = `${input.title}\n${input.excerpt ?? ''}`;
  for (const rule of COMPILED) {
    if (!tags.has(rule.slug) && rule.regex.test(text)) {
      tags.set(rule.slug, { slug: rule.slug, basis: 'KEYWORD_RULE', ruleId: rule.id });
    }
  }
  return [...tags.values()];
}
