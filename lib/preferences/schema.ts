import { z } from 'zod';
import { ORIENTATIONS } from '../domain/orientation';
import { SECTOR_SLUGS } from '../domain/sectors';

/**
 * Personal preferences. Stored in the browser (localStorage) by default; copied to the server
 * only when an authenticated user explicitly turns on sync. Contains explicit choices only —
 * never reading history, dwell time or other behavioural signals.
 */
export const PREFS_STORAGE_KEY = 'frealgo:prefs:v1';
export const SORT_OPTIONS = ['newest', 'oldest', 'outlet'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

const iso2 = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase());
const lang = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);

export const preferencesSchema = z.object({
  version: z.literal(1).default(1),
  showIntro: z.boolean().default(true),
  motion: z.enum(['system', 'reduce', 'full']).default('system'),
  globeEnabled: z.boolean().default(true),
  preferredSort: z.enum(SORT_OPTIONS).default('newest'),
  pinnedCountries: z.array(iso2).max(50).default([]),
  sectors: z
    .array(z.enum(SECTOR_SLUGS as [string, ...string[]]))
    .max(7)
    .default([]),
  orientations: z.array(z.enum(ORIENTATIONS)).max(8).default([]),
  languages: z.array(lang).max(20).default([]),
  outletIds: z.array(z.string().min(1).max(64)).max(50).default([]),
  syncToAccount: z.boolean().default(false),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({});

/** Tolerant parse: unknown keys are dropped, invalid fields fall back to defaults. */
export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
  if (!data || typeof data !== 'object') return { ...DEFAULT_PREFERENCES };
  const strict = preferencesSchema.safeParse(data);
  if (strict.success) return strict.data;
  // Salvage valid fields individually so one bad value does not reset everything.
  const out: Record<string, unknown> = { ...DEFAULT_PREFERENCES };
  const shape = preferencesSchema.shape;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const field = shape[key].safeParse((data as Record<string, unknown>)[key]);
    if (field.success) out[key] = field.data;
  }
  return preferencesSchema.parse(out);
}

export function serializePreferences(prefs: Preferences): string {
  return JSON.stringify(preferencesSchema.parse(prefs));
}

/**
 * Inline <head> script (CSP-nonced) that applies motion/intro preferences before first paint,
 * avoiding a flash of animation. Kept tiny and dependency-free.
 */
export const PREFERENCE_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var p={};var raw=localStorage.getItem(${JSON.stringify(
  PREFS_STORAGE_KEY,
)});if(raw){p=JSON.parse(raw)||{}}if(p.motion==='reduce'||p.motion==='full'){d.dataset.motion=p.motion}var reduce=p.motion==='reduce'||(p.motion!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches);var seen=sessionStorage.getItem('frealgo:intro-seen');if(p.showIntro===false||reduce||seen||/[?&]intro=0/.test(location.search)){d.dataset.intro='skip'}else{sessionStorage.setItem('frealgo:intro-seen','1');d.dataset.intro='play'}}catch(e){d.dataset.intro='skip'}})();`;
