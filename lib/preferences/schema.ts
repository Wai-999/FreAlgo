import { ORIENTATIONS, type Orientation } from '../domain/orientation';
import { SECTOR_SLUGS } from '../domain/sectors';

/**
 * Personal preferences. Stored in the browser (localStorage) by default; copied to the server
 * only when an authenticated user explicitly turns on sync. Contains explicit choices only:
 * never reading history, dwell time or other behavioural signals.
 *
 * Validation is hand-written (no schema library) because this module ships to every browser;
 * the server-side sync endpoint validates with Zod (lib/preferences/server.ts).
 */
export const PREFS_STORAGE_KEY = 'frealgo:prefs:v1';
export const SORT_OPTIONS = ['newest', 'oldest', 'outlet'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];
const MOTION = ['system', 'reduce', 'full'] as const;

export interface Preferences {
  version: 1;
  showIntro: boolean;
  motion: (typeof MOTION)[number];
  globeEnabled: boolean;
  preferredSort: SortOption;
  pinnedCountries: string[];
  sectors: string[];
  orientations: Orientation[];
  languages: string[];
  outletIds: string[];
  syncToAccount: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  version: 1,
  showIntro: true,
  motion: 'system',
  globeEnabled: true,
  preferredSort: 'newest',
  pinnedCountries: [],
  sectors: [],
  orientations: [],
  languages: [],
  outletIds: [],
  syncToAccount: false,
}) as Preferences;

const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const ISO2 = /^[A-Za-z]{2}$/;

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v);

/** Validates every element; an invalid element rejects the whole list (falls back to default). */
function list<T>(
  v: unknown,
  max: number,
  ok: (x: unknown) => boolean,
  map: (x: unknown) => T = (x) => x as T,
): T[] | undefined {
  if (!Array.isArray(v) || v.length > max || !v.every(ok)) return undefined;
  return v.map(map);
}

function validate(data: Record<string, unknown>): Preferences {
  const d = DEFAULT_PREFERENCES;
  return {
    version: 1,
    showIntro: isBool(data.showIntro) ? data.showIntro : d.showIntro,
    motion: oneOf(MOTION)(data.motion) ? data.motion : d.motion,
    globeEnabled: isBool(data.globeEnabled) ? data.globeEnabled : d.globeEnabled,
    preferredSort: oneOf(SORT_OPTIONS)(data.preferredSort) ? data.preferredSort : d.preferredSort,
    pinnedCountries:
      list(
        data.pinnedCountries,
        50,
        (x) => typeof x === 'string' && ISO2.test(x),
        (x) => String(x).toUpperCase(),
      ) ?? [],
    sectors: list<string>(data.sectors, 7, oneOf(SECTOR_SLUGS)) ?? [],
    orientations: list<Orientation>(data.orientations, 8, oneOf(ORIENTATIONS)) ?? [],
    languages: list<string>(data.languages, 20, (x) => typeof x === 'string' && LANG.test(x)) ?? [],
    outletIds:
      list<string>(
        data.outletIds,
        50,
        (x) => typeof x === 'string' && x.length >= 1 && x.length <= 64,
      ) ?? [],
    syncToAccount: isBool(data.syncToAccount) ? data.syncToAccount : d.syncToAccount,
  };
}

/** Tolerant parse: unknown keys are dropped, invalid fields fall back to defaults. */
export function parsePreferences(raw: string | null | undefined): Preferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_PREFERENCES };
  return validate(data as Record<string, unknown>);
}

export function serializePreferences(prefs: Preferences): string {
  return JSON.stringify(validate(prefs as unknown as Record<string, unknown>));
}

/**
 * Inline <head> script (CSP-nonced) that applies motion/intro preferences before first paint,
 * avoiding a flash of animation. Kept tiny and dependency-free.
 */
export const PREFERENCE_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{var p={};var raw=localStorage.getItem(${JSON.stringify(
  PREFS_STORAGE_KEY,
)});if(raw){p=JSON.parse(raw)||{}}if(p.motion==='reduce'||p.motion==='full'){d.dataset.motion=p.motion}var reduce=p.motion==='reduce'||(p.motion!=='full'&&matchMedia('(prefers-reduced-motion: reduce)').matches);var seen=sessionStorage.getItem('frealgo:intro-seen');if(p.showIntro===false||reduce||seen||/[?&]intro=0/.test(location.search)){d.dataset.intro='skip'}else{sessionStorage.setItem('frealgo:intro-seen','1');d.dataset.intro='play'}}catch(e){d.dataset.intro='skip'}})();`;
