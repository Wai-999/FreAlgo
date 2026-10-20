import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import { ORIENTATIONS } from '@/lib/domain/orientation';
import { SECTOR_SLUGS } from '@/lib/domain/sectors';

/**
 * Server copy of explicitly chosen preferences (opt-in sync). Mirrors the local schema's
 * syncable fields only; no behavioural data exists to store.
 */
export const serverPreferencesSchema = z
  .object({
    pinnedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(50),
    outletSlugs: z.array(z.string().regex(/^[a-z0-9-]{2,80}$/)).max(50),
    sectors: z.array(z.enum(SECTOR_SLUGS as [string, ...string[]])).max(7),
    orientations: z.array(z.enum(ORIENTATIONS)).max(8),
    languages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)).max(20),
    preferredSort: z.enum(['newest', 'oldest', 'outlet']),
    reducedMotion: z.boolean(),
    globeEnabled: z.boolean(),
  })
  .strict();

export type ServerPreferences = z.infer<typeof serverPreferencesSchema>;

export async function readServerPreferences(
  prisma: PrismaClient,
  userId: string,
): Promise<(ServerPreferences & { updatedAt: string }) | null> {
  const row = await prisma.userPreference.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    pinnedCountries: row.selectedCountryIso2,
    outletSlugs: row.selectedOutletIds,
    sectors: row.selectedSectorSlugs,
    orientations: row.selectedOrientations,
    languages: row.selectedLanguages,
    preferredSort: (['newest', 'oldest', 'outlet'].includes(row.preferredSort)
      ? row.preferredSort
      : 'newest') as ServerPreferences['preferredSort'],
    reducedMotion: row.reducedMotion,
    globeEnabled: row.globeEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function writeServerPreferences(
  prisma: PrismaClient,
  userId: string,
  p: ServerPreferences,
) {
  const data = {
    selectedCountryIso2: p.pinnedCountries,
    selectedOutletIds: p.outletSlugs,
    selectedSectorSlugs: p.sectors,
    selectedOrientations: p.orientations,
    selectedLanguages: p.languages,
    preferredSort: p.preferredSort,
    reducedMotion: p.reducedMotion,
    globeEnabled: p.globeEnabled,
  };
  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return readServerPreferences(prisma, userId);
}
