import { z } from 'zod';
import {
  InvalidArticleUrlError,
  canonicalUrlHash,
  canonicalizeUrl,
  sha256Hex,
} from './canonical-url';
import { decidePublishedAt } from './dates';
import type { RawFeedItem } from './feed-parser';
import { htmlToText, truncateText } from './text';

export const TITLE_MAX = 300;
export const EXCERPT_MAX = 320;

export interface NormalizeContext {
  feedUrl: string;
  feedLanguage: string | null;
  outletLanguage: string | null;
  excerptAllowed: boolean;
  firstSeenAt: Date;
}

export interface NormalizedItem {
  externalId: string | null;
  canonicalUrl: string;
  canonicalUrlHash: string;
  title: string;
  excerpt: string | null;
  author: string | null;
  language: string | null;
  imageUrl: string | null;
  categories: string[];
  publishedAt: Date;
  publishedAtRaw: string | null;
  publishedOffsetMinutes: number | null;
  publishedAtEstimated: boolean;
  contentHash: string;
  status: 'PUBLISHED' | 'QUARANTINED';
  statusReason: string | null;
}

export type NormalizeResult =
  | { ok: true; item: NormalizedItem }
  | { ok: false; reason: string; detail: string; externalId: string | null; url: string | null };

const normalizedSchema = z.object({
  externalId: z.string().min(1).max(512).nullable(),
  canonicalUrl: z.string().max(2048),
  canonicalUrlHash: z.string().regex(/^[0-9a-f]{64}$/),
  title: z.string().min(1).max(TITLE_MAX),
  excerpt: z
    .string()
    .max(EXCERPT_MAX + 1)
    .nullable(),
  author: z.string().max(200).nullable(),
  language: z.string().max(35).nullable(),
  imageUrl: z.string().max(2048).nullable(),
  categories: z.array(z.string().max(100)).max(30),
  publishedAt: z.date(),
  publishedAtRaw: z.string().max(100).nullable(),
  publishedOffsetMinutes: z.number().int().min(-840).max(840).nullable(),
  publishedAtEstimated: z.boolean(),
  contentHash: z.string().length(64),
  status: z.enum(['PUBLISHED', 'QUARANTINED']),
  statusReason: z.string().nullable(),
});

/** Normalizes a BCP-47 tag: "EN_us" -> "en-US"; returns null for anything that isn't one. */
export function normalizeLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const parts = tag.trim().replace(/_/g, '-').split('-');
  const primary = parts[0]?.toLowerCase();
  if (!primary || !/^[a-z]{2,3}$/.test(primary)) return null;
  const region = parts[1];
  if (region && /^[a-z]{2}$/i.test(region)) return `${primary}-${region.toUpperCase()}`;
  if (region && /^[a-z]{4}$/i.test(region))
    return `${primary}-${region[0]!.toUpperCase()}${region.slice(1).toLowerCase()}`;
  return primary;
}

function safeHttpUrl(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeItem(raw: RawFeedItem, ctx: NormalizeContext): NormalizeResult {
  const externalId = raw.guid ? raw.guid.trim().slice(0, 512) || null : null;
  const linkCandidate =
    raw.link ??
    (raw.guid && (raw.guidIsPermaLink || /^https?:\/\//i.test(raw.guid)) ? raw.guid : null);

  if (!linkCandidate) {
    return {
      ok: false,
      reason: 'missing-link',
      detail: 'Item has no link or permalink guid',
      externalId,
      url: null,
    };
  }
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(linkCandidate, ctx.feedUrl);
  } catch (err) {
    const detail = err instanceof InvalidArticleUrlError ? err.message : 'Invalid URL';
    return {
      ok: false,
      reason: 'invalid-url',
      detail,
      externalId,
      url: linkCandidate.slice(0, 500),
    };
  }

  const title = truncateText(htmlToText(raw.title), TITLE_MAX);
  if (!title) {
    return {
      ok: false,
      reason: 'missing-title',
      detail: 'Item has no headline',
      externalId,
      url: canonicalUrl,
    };
  }

  let excerpt: string | null = null;
  if (ctx.excerptAllowed) {
    const text = htmlToText(raw.summary ?? raw.content);
    excerpt = text && text !== title ? truncateText(text, EXCERPT_MAX) : null;
  }

  const rawDate = raw.published ?? raw.updated;
  const date = decidePublishedAt(rawDate, ctx.firstSeenAt);
  const language =
    normalizeLanguage(raw.language) ??
    normalizeLanguage(ctx.feedLanguage) ??
    normalizeLanguage(ctx.outletLanguage);

  const candidate: NormalizedItem = {
    externalId,
    canonicalUrl,
    canonicalUrlHash: canonicalUrlHash(canonicalUrl),
    title,
    excerpt,
    author: raw.author ? truncateText(htmlToText(raw.author), 200) || null : null,
    language,
    imageUrl: safeHttpUrl(raw.imageUrl, canonicalUrl),
    categories: raw.categories
      .map((c) => htmlToText(c).slice(0, 100))
      .filter(Boolean)
      .slice(0, 30),
    publishedAt: date.publishedAt,
    publishedAtRaw: rawDate ? rawDate.slice(0, 100) : null,
    publishedOffsetMinutes: date.offsetMinutes,
    publishedAtEstimated: date.kind === 'ok' ? date.estimated : false,
    contentHash: sha256Hex(`${title}\n${excerpt ?? ''}`),
    status: date.kind === 'quarantine' ? 'QUARANTINED' : 'PUBLISHED',
    statusReason: date.kind === 'quarantine' ? date.reason : null,
  };

  const parsed = normalizedSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'schema-validation',
      detail: parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
        .slice(0, 500),
      externalId,
      url: canonicalUrl,
    };
  }
  return { ok: true, item: candidate };
}
