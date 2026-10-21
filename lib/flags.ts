/**
 * Feature flags (FreAlgo 2.0, ADR-001). Server-side only: read from the environment on each call,
 * so an operator can switch a feature off with `FEATURE_<NAME>=false` and a restart, no rebuild.
 *
 * Rules:
 * - Every v2 surface has a flag, so a faulty feature can be disabled without touching the rest.
 * - Defaults are the intended launch state. Features that need curated, sourced content which
 *   does not exist yet (journeys) or that could imply importance on a map (world pulse) default
 *   OFF until reviewed. AI summaries are not implemented and cannot be enabled.
 * - The public methodology page lists every flag and its state on this instance.
 */

export interface FlagDefinition {
  default: boolean;
  /** Shown on the methodology page. */
  description: string;
  /** Set when a flag can never be switched on in this build. */
  locked?: string;
}

export const FLAGS = {
  stories: {
    default: true,
    description: 'Stories: finite, chronological story collections with reading depths.',
  },
  discover: {
    default: true,
    description: 'Discover: Surprise Me and the daily discovery, using a documented seeded method.',
  },
  perspectives: {
    default: true,
    description: 'Perspectives: side-by-side coverage of one event by different outlets.',
  },
  myWorld: {
    default: true,
    description: 'My World: explicit, browser-local preferences and a personal story list.',
  },
  eventClustering: {
    default: true,
    description:
      'Event clusters: groups reports whose headlines share distinctive terms within 72 hours.',
  },
  timelines: {
    default: true,
    description: 'Timelines: dated sequence of the reports in an event cluster.',
  },
  journeys: {
    default: false,
    description:
      'Story Journeys: curated, sourced sequences of countries. Off until journeys are authored and reviewed.',
  },
  worldPulse: {
    default: false,
    description:
      'World Pulse: map shading by measured article counts (not importance). Off until reviewed.',
  },
  countryConnections: {
    default: false,
    description: 'Country connections: countries that share event clusters, with dates and links.',
  },
  aiSummaries: {
    default: false,
    description: 'AI-generated summaries.',
    locked: 'Not implemented. FreAlgo shows publishers’ own headlines and excerpts only.',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FlagName = keyof typeof FLAGS;
export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

/** stories → FEATURE_STORIES, myWorld → FEATURE_MY_WORLD */
export function flagEnvName(name: FlagName): string {
  return `FEATURE_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

function parse(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return undefined; // unrecognised values fall back to the default rather than guessing
}

export function isEnabled(
  name: FlagName,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const def: FlagDefinition = FLAGS[name];
  if (def.locked) return false;
  return parse(env[flagEnvName(name)]) ?? def.default;
}

export function flagSnapshot(
  env: Record<string, string | undefined> = process.env,
): Record<FlagName, boolean> {
  return Object.fromEntries(FLAG_NAMES.map((n) => [n, isEnabled(n, env)])) as Record<
    FlagName,
    boolean
  >;
}
