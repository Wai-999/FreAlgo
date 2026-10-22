/**
 * Deterministic date/time formatting. Server renders in UTC with an explicit zone so output never
 * depends on the server's locale; client components can re-render in the viewer's zone.
 */
export function formatUtc(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatOffset(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  const sign = minutes >= 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Local wall-clock time at the publisher's declared offset, e.g. "08:30 (UTC+06:30)". */
export function formatPublisherLocal(
  date: Date | string,
  offsetMinutes: number | null | undefined,
): string | null {
  if (offsetMinutes === null || offsetMinutes === undefined) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  const local = new Date(d.getTime() + offsetMinutes * 60_000);
  return `${local.toISOString().slice(0, 16).replace('T', ' ')} (${formatOffset(offsetMinutes)})`;
}

export function formatAge(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return 'never';
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 0) return 'in the future';
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const days = Math.round(h / 24);
  return `${days} d ago`;
}

export function languageName(tag: string | null | undefined, display = 'en'): string {
  if (!tag) return 'Unknown language';
  try {
    return new Intl.DisplayNames([display], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A curated date shown only as precisely as it is known: "2026-10-21", "October 2026" or "2026". */
export function formatPrecise(iso: string, precision: 'DAY' | 'MONTH' | 'YEAR'): string {
  const d = new Date(iso);
  if (precision === 'YEAR') return String(d.getUTCFullYear());
  if (precision === 'MONTH') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return d.toISOString().slice(0, 10);
}
