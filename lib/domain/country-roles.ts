/**
 * Article–country roles (FreAlgo 2.0, ADR V2-001). Shared by ingestion, queries and UI so the
 * wording users see matches what the database stores.
 */
export const COUNTRY_ROLES = ['SUBJECT', 'FEED_SCOPE', 'PUBLISHER_HOME'] as const;
export type CountryRole = (typeof COUNTRY_ROLES)[number];

/** Roles counted as "stories about this country" (country pages, coverage counts, connections). */
export const ABOUT_ROLES: readonly CountryRole[] = ['SUBJECT', 'FEED_SCOPE'];

export type CountryScope = 'about' | 'all';

export function rolesForScope(scope: CountryScope): readonly CountryRole[] {
  return scope === 'all' ? COUNTRY_ROLES : ABOUT_ROLES;
}

export const COUNTRY_ROLE_INFO: Record<CountryRole, { label: string; explanation: string }> = {
  SUBJECT: {
    label: 'About this country',
    explanation:
      'The headline or excerpt names the country (or an editor tagged it). The matched term is shown.',
  },
  FEED_SCOPE: {
    label: 'From a feed covering this country',
    explanation:
      'The publisher’s feed is declared as covering this country (for example a national-news feed). Assumed from the feed, not from the text.',
  },
  PUBLISHER_HOME: {
    label: 'Publisher based here',
    explanation:
      'The outlet is based in this country. This says nothing about what the story is about, so it is not counted as coverage of the country.',
  },
};

type Basis = 'SOURCE_COUNTRY' | 'FEED_DEFAULT' | 'TEXT_MATCH' | 'MANUAL';

/** Role implied by how a tag was produced. */
export function roleForBasis(basis: Basis): CountryRole {
  if (basis === 'SOURCE_COUNTRY') return 'PUBLISHER_HOME';
  if (basis === 'FEED_DEFAULT') return 'FEED_SCOPE';
  return 'SUBJECT';
}
