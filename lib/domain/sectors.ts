/** Canonical sector list. Articles may carry several sectors (multi-sector tags). */
export const SECTORS = [
  {
    slug: 'politics',
    name: 'Politics',
    description: 'Government, elections, legislation, diplomacy and public policy.',
  },
  {
    slug: 'business-economics',
    name: 'Business & Economics',
    description: 'Markets, companies, trade, labour, prices and economic policy.',
  },
  {
    slug: 'education',
    name: 'Education',
    description: 'Schools, universities, research institutions and learning policy.',
  },
  {
    slug: 'technology',
    name: 'Technology',
    description: 'Digital services, science-driven industry, telecoms and computing.',
  },
  {
    slug: 'agriculture',
    name: 'Agriculture',
    description: 'Farming, food production, fisheries, land use and rural economies.',
  },
  {
    slug: 'history-context',
    name: 'History & Context',
    description: 'Background, anniversaries, heritage and long-running stories.',
  },
  {
    slug: 'culture',
    name: 'Culture',
    description: 'Arts, literature, film, music, religion, sport and society.',
  },
] as const;

export type SectorSlug = (typeof SECTORS)[number]['slug'];
export const SECTOR_SLUGS = SECTORS.map((s) => s.slug) as SectorSlug[];

export function isSectorSlug(value: unknown): value is SectorSlug {
  return typeof value === 'string' && (SECTOR_SLUGS as string[]).includes(value);
}

export function sectorName(slug: string): string {
  return SECTORS.find((s) => s.slug === slug)?.name ?? slug;
}
