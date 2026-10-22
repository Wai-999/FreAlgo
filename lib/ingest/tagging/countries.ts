import type { CountryRole } from '../../domain/country-roles';
import gazetteer from './gazetteer.generated.json';

/**
 * Deterministic, auditable country tagging (rules version below). Every tag records the term that
 * matched so operators and users can see *why* an article is linked to a country.
 *
 * Rules v2 (docs/data/source-methodology.md#tagging). Each tag has a basis (how it was produced)
 * and a role (what it means, ADR V2-001); text evidence wins over assumptions:
 *  1. TEXT_MATCH     → SUBJECT. A country name/alias/demonym appears in the headline or excerpt, matched
 *     case-sensitively on word boundaries (no boundaries for scripts written without spaces).
 *     Terms shared by several countries ("Congo", "Korea") or common words ("Jordan", "Chad",
 *     "Georgia") count only when a disambiguating term also appears. Longest match wins, so
 *     "Papua New Guinea" never also yields "Guinea". At most MAX_TEXT_MATCHES per article.
 *  2. FEED_DEFAULT   → FEED_SCOPE. Countries the feed declares as its scope (national feeds).
 *  3. SOURCE_COUNTRY → PUBLISHER_HOME. The outlet's home country, only if not already tagged above:
 *     it records where the publisher is based, not what the story is about.
 * v2 changes: text evidence is no longer hidden by the publisher's country, roles are explicit,
 * and the unambiguous upper-case "US" is an alias (case-sensitive, so the pronoun never matches).
 */
export const COUNTRY_RULES_VERSION = 2;
export const MAX_TEXT_MATCHES = 5;

const NAMES = (gazetteer as { names: Record<string, Record<string, string[]>> }).names;

/** Curated English aliases and demonyms (only unambiguous forms). */
const EXTRA: Record<string, string[]> = {
  US: ['United States', 'U.S.', 'US', 'USA', 'U.S.A.', 'Washington DC'],
  GB: ['Britain', 'British', 'UK', 'U.K.', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  MM: ['Burma', 'Burmese', 'Myanmar', 'မြန်မာ'],
  CN: ['China', 'Chinese', 'Beijing', '中国'],
  TW: ['Taiwan', 'Taiwanese', 'Taipei', '台湾'],
  KR: ['South Korea', 'South Korean', 'Seoul', '韓国', '한국'],
  KP: ['North Korea', 'North Korean', 'Pyongyang', '北朝鮮'],
  JP: ['Japan', 'Japanese', 'Tokyo', '日本'],
  RU: ['Russia', 'Russian', 'Kremlin', 'Moscow'],
  UA: ['Ukraine', 'Ukrainian', 'Kyiv'],
  DE: ['Germany', 'German', 'Berlin'],
  FR: ['France', 'French', 'Paris'],
  IN: ['India', 'New Delhi', 'Mumbai'],
  PK: ['Pakistan', 'Pakistani', 'Islamabad'],
  BD: ['Bangladesh', 'Bangladeshi', 'Dhaka'],
  TH: ['Thailand', 'Thai', 'Bangkok', 'ထိုင်း'],
  VN: ['Vietnam', 'Viet Nam', 'Vietnamese', 'Hanoi'],
  ID: ['Indonesia', 'Indonesian', 'Jakarta'],
  PH: ['Philippines', 'Filipino', 'Manila'],
  MY: ['Malaysia', 'Malaysian', 'Kuala Lumpur'],
  SG: ['Singapore', 'Singaporean'],
  KH: ['Cambodia', 'Cambodian', 'Phnom Penh'],
  LA: ['Laos', 'Lao', 'Vientiane'],
  AU: ['Australia', 'Australian', 'Canberra'],
  NZ: ['New Zealand', 'Aotearoa', 'Wellington'],
  CA: ['Canada', 'Canadian', 'Ottawa'],
  MX: ['Mexico', 'Mexican', 'México'],
  BR: ['Brazil', 'Brazilian', 'Brasil', 'Brasília'],
  AR: ['Argentina', 'Argentine', 'Buenos Aires'],
  CL: ['Chile', 'Chilean', 'Santiago de Chile'],
  CO: ['Colombia', 'Colombian', 'Bogotá'],
  PE: ['Peru', 'Peruvian', 'Lima'],
  VE: ['Venezuela', 'Venezuelan', 'Caracas'],
  CU: ['Cuba', 'Cuban', 'Havana'],
  NG: ['Nigeria', 'Nigerian', 'Abuja', 'Lagos'],
  KE: ['Kenya', 'Kenyan', 'Nairobi'],
  ET: ['Ethiopia', 'Ethiopian', 'Addis Ababa'],
  ZA: ['South Africa', 'South African', 'Pretoria', 'Johannesburg'],
  EG: ['Egypt', 'Egyptian', 'Cairo'],
  SD: ['Sudanese', 'Khartoum'],
  SS: ['South Sudan', 'South Sudanese', 'Juba'],
  CD: ['DR Congo', 'DRC', 'Democratic Republic of Congo', 'Kinshasa'],
  CG: ['Congo-Brazzaville', 'Brazzaville'],
  GH: ['Ghana', 'Ghanaian', 'Accra'],
  SN: ['Senegal', 'Senegalese', 'Dakar'],
  UG: ['Uganda', 'Ugandan', 'Kampala'],
  TZ: ['Tanzania', 'Tanzanian', 'Dodoma'],
  IL: ['Israel', 'Israeli', 'Jerusalem'],
  PS: ['Palestine', 'Palestinian', 'Gaza', 'West Bank'],
  IR: ['Iran', 'Iranian', 'Tehran'],
  IQ: ['Iraq', 'Iraqi', 'Baghdad'],
  SY: ['Syria', 'Syrian', 'Damascus'],
  LB: ['Lebanon', 'Lebanese', 'Beirut'],
  SA: ['Saudi Arabia', 'Saudi', 'Riyadh'],
  AE: ['United Arab Emirates', 'UAE', 'Emirati', 'Abu Dhabi', 'Dubai'],
  QA: ['Qatar', 'Qatari', 'Doha'],
  YE: ['Yemen', 'Yemeni', "Sana'a"],
  AF: ['Afghanistan', 'Afghan', 'Kabul'],
  TR: ['Türkiye', 'Turkish', 'Ankara', 'Istanbul'],
  GR: ['Greece', 'Greek', 'Athens'],
  IT: ['Italy', 'Italian', 'Rome'],
  ES: ['Spain', 'Spanish', 'Madrid'],
  PT: ['Portugal', 'Portuguese', 'Lisbon'],
  NL: ['Netherlands', 'Dutch', 'Amsterdam'],
  BE: ['Belgium', 'Belgian', 'Brussels'],
  PL: ['Poland', 'Polish', 'Warsaw'],
  SE: ['Sweden', 'Swedish', 'Stockholm'],
  NO: ['Norway', 'Norwegian', 'Oslo'],
  FI: ['Finland', 'Finnish', 'Helsinki'],
  DK: ['Denmark', 'Danish', 'Copenhagen'],
  IE: ['Ireland', 'Irish', 'Dublin'],
  CH: ['Switzerland', 'Swiss', 'Bern'],
  AT: ['Austria', 'Austrian', 'Vienna'],
  HU: ['Hungary', 'Hungarian', 'Budapest'],
  RO: ['Romania', 'Romanian', 'Bucharest'],
  RS: ['Serbia', 'Serbian', 'Belgrade'],
  MK: ['North Macedonia', 'Skopje'],
  BY: ['Belarus', 'Belarusian', 'Minsk'],
  LV: ['Latvia', 'Latvian', 'Riga'],
  HK: ['Hong Kong'],
  JO: ['Jordanian', 'Amman'],
  GE: ['Tbilisi'],
  TD: ["N'Djamena", 'Chadian'],
  NE: ['Niamey', 'Nigerien'],
  GN: ['Conakry', 'Guinean'],
};

/** Terms that need corroboration; matched only if one of the listed terms is also present. */
const AMBIGUOUS: Record<string, { iso2: string; corroborators: string[] }> = {
  Georgia: {
    iso2: 'GE',
    corroborators: ['Tbilisi', 'Georgian Dream', 'Caucasus', 'Abkhazia', 'South Ossetia'],
  },
  Jordan: { iso2: 'JO', corroborators: ['Amman', 'Jordanian', 'Hashemite'] },
  Chad: { iso2: 'TD', corroborators: ["N'Djamena", 'Chadian', 'Sahel'] },
  Niger: { iso2: 'NE', corroborators: ['Niamey', 'Nigerien', 'Sahel'] },
  Turkey: { iso2: 'TR', corroborators: ['Ankara', 'Istanbul', 'Turkish', 'Erdogan', 'Erdoğan'] },
  Guinea: { iso2: 'GN', corroborators: ['Conakry', 'Guinean'] },
  Macedonia: { iso2: 'MK', corroborators: ['Skopje'] },
};

/** Never match these as standalone terms (they name several countries or common words). */
const BLOCKLIST = new Set([
  'Congo',
  'Korea',
  'Guinea',
  'Samoa',
  'Dominica',
  'Virgin Islands',
  'Macedonia',
  'Georgia',
  'Jordan',
  'Chad',
  'Niger',
  'Turkey',
]);

const NO_SPACE_SCRIPT = /[぀-ヿ㐀-鿿가-힯฀-๿က-႟ក-៿຀-໿]/u;

interface Term {
  term: string;
  iso2: string;
  noBoundary: boolean;
}

const cache = new Map<string, { regex: RegExp; byTerm: Map<string, string> }>();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(lang: string) {
  const key = lang;
  const hit = cache.get(key);
  if (hit) return hit;
  const owners = new Map<string, Set<string>>();
  const add = (term: string, iso2: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    if (!owners.has(t)) owners.set(t, new Set());
    owners.get(t)!.add(iso2);
  };
  const langs = new Set(['en', lang]);
  for (const l of langs) {
    for (const [iso2, names] of Object.entries(NAMES[l] ?? {})) names.forEach((n) => add(n, iso2));
  }
  for (const [iso2, terms] of Object.entries(EXTRA)) terms.forEach((t) => add(t, iso2));
  for (const [term, info] of Object.entries(AMBIGUOUS)) add(term, info.iso2);

  const terms: Term[] = [];
  const byTerm = new Map<string, string>();
  for (const [term, isos] of owners) {
    if (isos.size !== 1) continue; // shared names are inherently ambiguous
    const iso2 = [...isos][0]!;
    byTerm.set(term, iso2);
    byTerm.set(term.toUpperCase(), iso2);
    terms.push({ term, iso2, noBoundary: NO_SPACE_SCRIPT.test(term) });
  }
  terms.sort((a, b) => b.term.length - a.term.length);
  const forms = (t: Term) =>
    (t.term === t.term.toUpperCase() ? [t.term] : [t.term, t.term.toUpperCase()]).map(escapeRe);
  const bounded = terms.filter((t) => !t.noBoundary).flatMap(forms);
  const unbounded = terms.filter((t) => t.noBoundary).flatMap(forms);
  // Word boundaries wrap the whole alternation once. Repeating them per term compiled ~2 000
  // copies of the \p{L} class and took 0.4–1.8 s per language on first use (5 s+ on CI).
  // Backtracking into the group keeps the per-term semantics: if the longest name fails the
  // trailing check, shorter alternatives are still tried.
  const parts: string[] = [];
  if (bounded.length) parts.push(`(?<![\\p{L}\\p{N}])(?:${bounded.join('|')})(?![\\p{L}\\p{N}])`);
  if (unbounded.length) parts.push(`(?:${unbounded.join('|')})`);
  const regex = new RegExp(parts.join('|'), 'gu');
  const built = { regex, byTerm };
  cache.set(key, built);
  return built;
}

export interface CountryMatch {
  iso2: string;
  term: string;
}

/** Text-match countries in headline + excerpt. Deterministic; ordered by first occurrence. */
export function matchCountries(text: string, lang: string | null): CountryMatch[] {
  if (!text) return [];
  const { regex, byTerm } = buildMatcher((lang ?? 'en').split('-')[0]!.toLowerCase());
  const found = new Map<string, string>();
  regex.lastIndex = 0;
  for (const m of text.matchAll(regex)) {
    const term = m[0];
    const iso2 = byTerm.get(term);
    if (!iso2) continue;
    // "US$5bn" is a currency, not a mention of the United States.
    if (term === 'US' && text[(m.index ?? 0) + term.length] === '$') continue;
    const plain = Object.keys(AMBIGUOUS).find((k) => k === term || k.toUpperCase() === term);
    if (plain || BLOCKLIST.has(term)) {
      const rule = AMBIGUOUS[plain ?? term];
      if (!rule || !rule.corroborators.some((c) => text.includes(c))) continue;
    }
    if (!found.has(iso2)) found.set(iso2, term);
    if (found.size >= MAX_TEXT_MATCHES) break;
  }
  return [...found].map(([iso2, term]) => ({ iso2, term }));
}

export type CountryTag = {
  iso2: string;
  basis: 'SOURCE_COUNTRY' | 'FEED_DEFAULT' | 'TEXT_MATCH';
  role: CountryRole;
  matchedTerm: string | null;
};

export function tagCountries(input: {
  title: string;
  excerpt: string | null;
  language: string | null;
  sourceCountryIso2: string | null;
  feedDefaultIso2: string[];
}): CountryTag[] {
  const tags = new Map<string, CountryTag>();
  const text = `${input.title}\n${input.excerpt ?? ''}`;
  for (const m of matchCountries(text, input.language)) {
    if (!tags.has(m.iso2))
      tags.set(m.iso2, { iso2: m.iso2, basis: 'TEXT_MATCH', role: 'SUBJECT', matchedTerm: m.term });
  }
  for (const iso2 of input.feedDefaultIso2) {
    if (!tags.has(iso2))
      tags.set(iso2, { iso2, basis: 'FEED_DEFAULT', role: 'FEED_SCOPE', matchedTerm: null });
  }
  const home = input.sourceCountryIso2;
  if (home && !tags.has(home)) {
    tags.set(home, {
      iso2: home,
      basis: 'SOURCE_COUNTRY',
      role: 'PUBLISHER_HOME',
      matchedTerm: null,
    });
  }
  return [...tags.values()];
}
