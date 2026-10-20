/**
 * Defensive publication-time parsing.
 * Keeps the publisher's original string and the offset it declared, and returns a UTC Date.
 * Accepts RFC 822/1123/2822 (incl. named zones and 2-digit years) and ISO 8601 / RFC 3339.
 */

export interface ParsedDate {
  utc: Date;
  /** Minutes east of UTC as declared by the publisher; null when no zone was given. */
  offsetMinutes: number | null;
  /** True when the string had no zone and UTC was assumed. */
  assumedUtc: boolean;
}

const ZONES: Record<string, number> = {
  UT: 0,
  UTC: 0,
  GMT: 0,
  Z: 0,
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
  // Common non-RFC abbreviations seen in real feeds (unambiguous ones only).
  BST: 60,
  CET: 60,
  CEST: 120,
  EET: 120,
  EEST: 180,
  JST: 540,
  KST: 540,
  IST: 330,
  AEST: 600,
  AEDT: 660,
  NZST: 720,
  NZDT: 780,
  MMT: 390,
  SGT: 480,
  HKT: 480,
  WIB: 420,
  PHT: 480,
  WAT: 60,
  CAT: 120,
  EAT: 180,
  SAST: 120,
  BRT: -180,
  ART: -180,
};

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseOffset(token: string): number | null {
  const t = token.trim();
  const upper = t.toUpperCase();
  if (upper in ZONES) return ZONES[upper]!;
  const m = t.match(/^(?:GMT|UTC)?([+-])(\d{1,2}):?(\d{2})?$/i);
  if (!m) return null;
  const hours = Number(m[2]);
  const mins = Number(m[3] ?? 0);
  if (hours > 14 || mins > 59) return null;
  return (m[1] === '-' ? -1 : 1) * (hours * 60 + mins);
}

function build(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  ms: number,
  offset: number | null,
): ParsedDate | null {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 24 || mi > 59 || s > 60) return null;
  const utcMs = Date.UTC(y, mo, d, h, mi, Math.min(s, 59), ms) - (offset ?? 0) * 60_000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible calendar dates (e.g. 31 Feb) that Date.UTC silently rolls over.
  const check = new Date(Date.UTC(y, mo, d));
  if (check.getUTCMonth() !== mo) return null;
  return { utc: date, offsetMinutes: offset, assumedUtc: offset === null };
}

export function parsePublicationDate(raw: string | null | undefined): ParsedDate | null {
  if (!raw) return null;
  const input = raw.trim().replace(/\s+/g, ' ');
  if (!input || input.length > 100) return null;

  // ISO 8601 / RFC 3339: 2026-10-19T08:30:00+06:30, 2026-10-19 08:30:00Z, 2026-10-19
  const iso = input.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\s*(Z|[+-]\d{2}:?\d{2}|[+-]\d{2})?)?$/i,
  );
  if (iso) {
    const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '0', zone] = iso;
    const offset = zone ? parseOffset(zone.length === 3 ? `${zone}:00` : zone) : null;
    if (zone && offset === null) return null;
    return build(+y!, +mo! - 1, +d!, +h, +mi, +s, Number(frac.slice(0, 3).padEnd(3, '0')), offset);
  }

  // RFC 822/1123/2822: [Wkd,] DD Mon YYYY HH:MM[:SS] ZONE
  const rfc = input.match(
    /^(?:[A-Za-z]{3,9},?\s*)?(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([A-Za-z]{1,5}|(?:GMT|UTC)?[+-]\d{1,2}:?\d{2})?$/,
  );
  if (rfc) {
    const [, d, monName, yRaw, h, mi, s = '0', zone] = rfc;
    const mo = MONTHS[monName!.toLowerCase().slice(0, monName!.toLowerCase() === 'sept' ? 4 : 3)];
    if (mo === undefined) return null;
    let y = Number(yRaw);
    if (yRaw!.length === 2) y += y < 50 ? 2000 : 1900;
    const offset = zone ? parseOffset(zone) : null;
    if (zone && offset === null) return null;
    return build(y, mo, +d!, +h!, +mi!, +s, 0, offset);
  }

  return null;
}

export type DateDecision =
  | {
      kind: 'ok';
      publishedAt: Date;
      offsetMinutes: number | null;
      estimated: boolean;
      note?: string;
    }
  | { kind: 'quarantine'; reason: string; publishedAt: Date; offsetMinutes: number | null };

const SKEW_MS = 15 * 60_000;
const FUTURE_QUARANTINE_MS = 48 * 3_600_000;
const EARLIEST = Date.UTC(1990, 0, 1);

/**
 * Policy for an item's timestamp relative to the time we saw it:
 *  - missing/unparseable/absurdly old  -> first-seen time, marked estimated
 *  - slightly in the future (<= 48h)   -> clamped to first-seen time, marked estimated
 *  - far in the future (> 48h)         -> quarantined for review
 */
export function decidePublishedAt(raw: string | null | undefined, firstSeenAt: Date): DateDecision {
  const parsed = parsePublicationDate(raw);
  if (!parsed || parsed.utc.getTime() < EARLIEST) {
    return {
      kind: 'ok',
      publishedAt: firstSeenAt,
      offsetMinutes: null,
      estimated: true,
      note: raw ? 'unparseable-date' : 'missing-date',
    };
  }
  const delta = parsed.utc.getTime() - firstSeenAt.getTime();
  if (delta > FUTURE_QUARANTINE_MS) {
    return {
      kind: 'quarantine',
      reason: 'future-timestamp',
      publishedAt: parsed.utc,
      offsetMinutes: parsed.offsetMinutes,
    };
  }
  if (delta > SKEW_MS) {
    return {
      kind: 'ok',
      publishedAt: firstSeenAt,
      offsetMinutes: parsed.offsetMinutes,
      estimated: true,
      note: 'future-clamped',
    };
  }
  return {
    kind: 'ok',
    publishedAt: parsed.utc,
    offsetMinutes: parsed.offsetMinutes,
    estimated: false,
  };
}
