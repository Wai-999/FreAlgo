/**
 * REAL PUBLISHER SOURCE REGISTRY (curated, auditable).
 *
 * - Every feed URL below was checked to respond with an RSS/Atom document on 2026-10-19.
 *   Feeds that answered 403/404 or a bot challenge (e.g. some regional outlets) were left out
 *   rather than worked around; feeds that returned zero items (Korea Herald national feed) too.
 * - All feeds are seeded PAUSED. An operator activates a feed only after reviewing the
 *   publisher's terms (npm run sources:activate). See docs/source-policy.md §2.
 * - Orientation labels are UNRATED: no third-party rating dataset is bundled (licence review is
 *   an external gate), and FreAlgo does not invent labels.
 * - Ownership types are filled only for well-documented public-service broadcasters and
 *   non-profits; everything else is UNKNOWN pending review.
 */

export interface RegistryFeed {
  url: string;
  name: string;
  language?: string;
  defaultCountryIso2?: string[];
  defaultSectorSlugs?: string[];
}

export interface RegistryOutlet {
  slug: string;
  name: string;
  homepageUrl: string;
  countryIso2: string;
  language: string;
  ownershipType: 'PRIVATE' | 'PUBLIC_SERVICE' | 'STATE' | 'NONPROFIT' | 'COOPERATIVE' | 'UNKNOWN';
  ownershipNotes: string;
  paywall: 'NONE' | 'METERED' | 'HARD' | 'UNKNOWN';
  feeds: RegistryFeed[];
}

const PENDING = 'Ownership classification pending operator review.';

export const REAL_SOURCES: RegistryOutlet[] = [
  {
    slug: 'bbc-news',
    name: 'BBC News',
    homepageUrl: 'https://www.bbc.com/news',
    countryIso2: 'GB',
    language: 'en',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'UK public-service broadcaster (BBC).',
    paywall: 'NONE',
    feeds: [
      { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC News – World' },
      { url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', name: 'BBC News – Asia' },
    ],
  },
  {
    slug: 'the-guardian',
    name: 'The Guardian',
    homepageUrl: 'https://www.theguardian.com',
    countryIso2: 'GB',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'NONE',
    feeds: [{ url: 'https://www.theguardian.com/world/rss', name: 'The Guardian – World' }],
  },
  {
    slug: 'al-jazeera-english',
    name: 'Al Jazeera English',
    homepageUrl: 'https://www.aljazeera.com',
    countryIso2: 'QA',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'NONE',
    feeds: [{ url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera – All' }],
  },
  {
    slug: 'dw-english',
    name: 'DW (Deutsche Welle) English',
    homepageUrl: 'https://www.dw.com/en',
    countryIso2: 'DE',
    language: 'en',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'German international public broadcaster.',
    paywall: 'NONE',
    feeds: [{ url: 'https://rss.dw.com/rdf/rss-en-all', name: 'DW – All (English)' }],
  },
  {
    slug: 'tagesschau',
    name: 'tagesschau (ARD)',
    homepageUrl: 'https://www.tagesschau.de',
    countryIso2: 'DE',
    language: 'de',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'German public broadcaster (ARD).',
    paywall: 'NONE',
    feeds: [
      {
        url: 'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml',
        name: 'tagesschau – Alle Meldungen',
        language: 'de',
      },
    ],
  },
  {
    slug: 'france-24-english',
    name: 'France 24 (English)',
    homepageUrl: 'https://www.france24.com/en/',
    countryIso2: 'FR',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'NONE',
    feeds: [{ url: 'https://www.france24.com/en/rss', name: 'France 24 – Latest' }],
  },
  {
    slug: 'le-monde',
    name: 'Le Monde',
    homepageUrl: 'https://www.lemonde.fr',
    countryIso2: 'FR',
    language: 'fr',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [
      { url: 'https://www.lemonde.fr/rss/une.xml', name: 'Le Monde – À la une', language: 'fr' },
    ],
  },
  {
    slug: 'npr',
    name: 'NPR',
    homepageUrl: 'https://www.npr.org',
    countryIso2: 'US',
    language: 'en',
    ownershipType: 'NONPROFIT',
    ownershipNotes: 'US non-profit media organisation.',
    paywall: 'NONE',
    feeds: [{ url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR – News' }],
  },
  {
    slug: 'abc-news-australia',
    name: 'ABC News (Australia)',
    homepageUrl: 'https://www.abc.net.au/news',
    countryIso2: 'AU',
    language: 'en',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'Australian public broadcaster (ABC).',
    paywall: 'NONE',
    feeds: [
      { url: 'https://www.abc.net.au/news/feed/2942460/rss.xml', name: 'ABC News – Top Stories' },
    ],
  },
  {
    slug: 'cbc-news',
    name: 'CBC News',
    homepageUrl: 'https://www.cbc.ca/news',
    countryIso2: 'CA',
    language: 'en',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'Canadian public broadcaster (CBC/Radio-Canada).',
    paywall: 'NONE',
    feeds: [{ url: 'https://www.cbc.ca/webfeed/rss/rss-world', name: 'CBC News – World' }],
  },
  {
    slug: 'the-hindu',
    name: 'The Hindu',
    homepageUrl: 'https://www.thehindu.com',
    countryIso2: 'IN',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [
      {
        url: 'https://www.thehindu.com/news/national/feeder/default.rss',
        name: 'The Hindu – National',
        defaultCountryIso2: ['IN'],
      },
    ],
  },
  {
    slug: 'dawn',
    name: 'Dawn',
    homepageUrl: 'https://www.dawn.com',
    countryIso2: 'PK',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [{ url: 'https://www.dawn.com/feeds/home', name: 'Dawn – Home' }],
  },
  {
    slug: 'myanmar-now',
    name: 'Myanmar Now',
    homepageUrl: 'https://myanmar-now.org/en/',
    countryIso2: 'MM',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [
      {
        url: 'https://myanmar-now.org/en/feed/',
        name: 'Myanmar Now – English',
        defaultCountryIso2: ['MM'],
      },
    ],
  },
  {
    slug: 'the-japan-times',
    name: 'The Japan Times',
    homepageUrl: 'https://www.japantimes.co.jp',
    countryIso2: 'JP',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [{ url: 'https://www.japantimes.co.jp/feed/', name: 'The Japan Times – Latest' }],
  },
  {
    slug: 'nhk',
    name: 'NHK',
    homepageUrl: 'https://www3.nhk.or.jp/news/',
    countryIso2: 'JP',
    language: 'ja',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'Japanese public broadcaster (NHK).',
    paywall: 'NONE',
    feeds: [
      {
        url: 'https://news.web.nhk/n-data/conf/na/rss/cat0.xml',
        name: 'NHK – 主要ニュース',
        language: 'ja',
      },
    ],
  },
  {
    slug: 'south-china-morning-post',
    name: 'South China Morning Post',
    homepageUrl: 'https://www.scmp.com',
    countryIso2: 'HK',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [{ url: 'https://www.scmp.com/rss/91/feed/', name: 'SCMP – World' }],
  },
  {
    slug: 'the-straits-times',
    name: 'The Straits Times',
    homepageUrl: 'https://www.straitstimes.com',
    countryIso2: 'SG',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [
      { url: 'https://www.straitstimes.com/news/world/rss.xml', name: 'The Straits Times – World' },
    ],
  },
  {
    slug: 'cna',
    name: 'CNA',
    homepageUrl: 'https://www.channelnewsasia.com',
    countryIso2: 'SG',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'NONE',
    feeds: [
      {
        url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
        name: 'CNA – Latest',
      },
    ],
  },
  {
    slug: 'rnz',
    name: 'RNZ',
    homepageUrl: 'https://www.rnz.co.nz',
    countryIso2: 'NZ',
    language: 'en',
    ownershipType: 'PUBLIC_SERVICE',
    ownershipNotes: 'New Zealand public broadcaster (RNZ).',
    paywall: 'NONE',
    feeds: [
      {
        url: 'https://www.rnz.co.nz/rss/national.xml',
        name: 'RNZ – National',
        defaultCountryIso2: ['NZ'],
      },
    ],
  },
  {
    slug: 'agencia-brasil',
    name: 'Agência Brasil',
    homepageUrl: 'https://agenciabrasil.ebc.com.br',
    countryIso2: 'BR',
    language: 'pt',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'NONE',
    feeds: [
      {
        url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
        name: 'Agência Brasil – Últimas notícias',
        language: 'pt',
      },
    ],
  },
  {
    slug: 'premium-times',
    name: 'Premium Times',
    homepageUrl: 'https://www.premiumtimesng.com',
    countryIso2: 'NG',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [{ url: 'https://www.premiumtimesng.com/feed', name: 'Premium Times – Latest' }],
  },
  {
    slug: 'africanews',
    name: 'Africanews',
    homepageUrl: 'https://www.africanews.com',
    countryIso2: 'CG',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'NONE',
    feeds: [{ url: 'https://www.africanews.com/feed/rss', name: 'Africanews – Latest' }],
  },
  {
    slug: 'el-pais',
    name: 'El País',
    homepageUrl: 'https://elpais.com',
    countryIso2: 'ES',
    language: 'es',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [
      {
        url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
        name: 'El País – Portada',
        language: 'es',
      },
    ],
  },
  {
    slug: 'la-jornada',
    name: 'La Jornada',
    homepageUrl: 'https://www.jornada.com.mx',
    countryIso2: 'MX',
    language: 'es',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [
      {
        url: 'https://www.jornada.com.mx/rss/edicion.xml',
        name: 'La Jornada – Edición',
        language: 'es',
      },
    ],
  },
  {
    slug: 'buenos-aires-times',
    name: 'Buenos Aires Times',
    homepageUrl: 'https://www.batimes.com.ar',
    countryIso2: 'AR',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: PENDING,
    paywall: 'UNKNOWN',
    feeds: [{ url: 'https://www.batimes.com.ar/feed', name: 'Buenos Aires Times – Latest' }],
  },
  {
    slug: 'meduza-english',
    name: 'Meduza (English)',
    homepageUrl: 'https://meduza.io/en',
    countryIso2: 'LV',
    language: 'en',
    ownershipType: 'UNKNOWN',
    ownershipNotes: `${PENDING} Based in Riga; covers Russia (feed default country RU).`,
    paywall: 'NONE',
    feeds: [
      {
        url: 'https://meduza.io/rss/en/all',
        name: 'Meduza – All (English)',
        defaultCountryIso2: ['RU'],
      },
    ],
  },
];
