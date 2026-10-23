import { DISCOVER_METHOD_VERSION, WINDOW_DAYS } from '@/lib/discover/select';
import {
  CLUSTER_METHOD_VERSION,
  JOIN,
  JOIN_MEAN,
  MIN_SHARED,
  STRONG,
  WEAK_MIN_SHARED,
  WINDOW_HOURS,
} from '@/lib/events/cluster';
import { CORPUS_DAYS } from '@/lib/events/job';
import { SORT_EXPLANATION } from '@/lib/explore/params';
import { FLAGS, FLAG_NAMES, flagSnapshot } from '@/lib/flags';
import { TAGGING_RULES_VERSION } from '@/lib/ingest/persist';

/**
 * Machine-readable methodology (spec §7 `GET /api/methodology`): every ordering, classification,
 * selection and grouping rule this instance applies, with versions. The /methodology page is the
 * human-readable version of the same rules.
 */
export function methodology(env: Record<string, string | undefined> = process.env) {
  const flags = flagSnapshot(env);
  return {
    page: '/methodology',
    ordering: {
      description:
        'Lists are ordered only by the sort the reader chose. No popularity, engagement or personal signal is used anywhere.',
      sorts: SORT_EXPLANATION,
    },
    tagging: {
      rulesVersion: TAGGING_RULES_VERSION,
      countryRoles: {
        SUBJECT: 'The text names the country (or an editor tagged it).',
        FEED_SCOPE: 'The feed declares the country as its scope; assumed, not evidenced.',
        PUBLISHER_HOME: 'The outlet is based there; says nothing about the story.',
      },
      articleType:
        'News, opinion or analysis only when the publisher signals it; otherwise unknown.',
      url: '/methodology#tagging',
    },
    labels: {
      level: 'source',
      description:
        'Orientation labels describe an outlet, not a story, and carry status, methodology, source, review date and national context. Unrated means not assessed. FreAlgo never invents a label or infers one from coverage.',
      url: '/methodology#labels',
    },
    discover: {
      version: DISCOVER_METHOD_VERSION,
      windowDays: WINDOW_DAYS,
      description:
        'Uniform choice among eligible countries; index = SHA-256(seed) mod pool size. The daily discovery uses "daily:" plus the UTC date as the seed.',
      url: '/methodology#discover',
    },
    events: {
      version: CLUSTER_METHOD_VERSION,
      windowHours: WINDOW_HOURS,
      corpusDays: CORPUS_DAYS,
      thresholds: {
        join: JOIN,
        joinMean: JOIN_MEAN,
        minSharedDistinctiveWords: MIN_SHARED,
        strongMatch: STRONG,
        weakMatchMinSharedWords: WEAK_MIN_SHARED,
      },
      description:
        'Reports in the same language are grouped when their headlines share distinctive words (weighted by rarity over the last 7 days), share a name, and do not name different countries. Deterministic; no model or embedding. Grouping can be wrong, and every report shows the words it shared.',
      url: '/methodology#events',
    },
    perspectives: {
      description:
        'Side-by-side reports by outlet with source-level labels. FreAlgo does not verify facts or assess claims; gaps are measured against its own corpus, not the world.',
      url: '/methodology#perspectives',
    },
    aiSummaries: { enabled: false, note: FLAGS.aiSummaries.locked },
    features: FLAG_NAMES.map((name) => ({
      name,
      enabled: flags[name],
      description: FLAGS[name].description,
    })),
  };
}
