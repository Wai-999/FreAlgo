import { z } from 'zod';
import { SORTS, type Sort } from '@/lib/api/contracts';

/**
 * Opaque keyset cursors. A cursor names the boundary row of the current page in the active sort
 * order plus a direction, so pagination is stable under concurrent inserts (no OFFSET drift and no
 * duplicates). The sort is embedded and must match the request, so a cursor cannot be replayed
 * against a different ordering.
 *
 * Keys per sort:
 *   newest/oldest: [publishedAtISO, id]
 *   outlet:        [outletName, publishedAtISO, id]
 *   relevance:     [score (fixed 6dp string), publishedAtISO, id]
 */
export interface CursorPayload {
  v: 1;
  s: Sort;
  d: 'next' | 'prev';
  k: string[];
  /** 1-based page number of the page this cursor leads to (display only). */
  p: number;
}

const payloadSchema = z.object({
  v: z.literal(1),
  s: z.enum(SORTS),
  d: z.enum(['next', 'prev']),
  k: z.array(z.string().max(300)).min(2).max(3),
  p: z.number().int().min(1).max(100_000),
});

const KEY_COUNT: Record<Sort, number> = { newest: 2, oldest: 2, outlet: 3, relevance: 3 };

export class InvalidCursorError extends Error {
  constructor(message = 'Invalid or expired cursor') {
    super(message);
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string, expectedSort: Sort): CursorPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidCursorError();
  const c = parsed.data;
  if (c.s !== expectedSort)
    throw new InvalidCursorError('Cursor was issued for a different sort order');
  if (c.k.length !== KEY_COUNT[c.s]) throw new InvalidCursorError();
  const tsIndex = c.k.length - 2;
  if (Number.isNaN(Date.parse(c.k[tsIndex]!))) throw new InvalidCursorError();
  if (c.s === 'relevance' && !/^-?\d+(\.\d+)?$/.test(c.k[0]!)) throw new InvalidCursorError();
  return c;
}
