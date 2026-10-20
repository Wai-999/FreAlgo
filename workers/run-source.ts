import type { Logger } from 'pino';
import type { FeedKind, IngestionRunStatus, PrismaClient } from '@/generated/prisma/client';
import {
  MAX_CONSECUTIVE_FAILURES,
  nextEligibleAfterFailure,
  shouldOpenCircuit,
} from '@/lib/ingest/backoff';
import { IngestError, toIngestError } from '@/lib/ingest/errors';
import { normalizeItem } from '@/lib/ingest/normalize';
import { persistItem, type PersistContext } from '@/lib/ingest/persist';
import { licensedJsonProvider } from './providers/licensed-json';
import { rssProvider } from './providers/rss';
import { PayloadError, type FeedProvider, type ProviderContext } from './providers/types';

export interface RunSourceDeps {
  prisma: PrismaClient;
  providerContext: ProviderContext;
  now?: () => Date;
  logger?: Logger;
  providers?: Partial<Record<FeedKind, FeedProvider>>;
}

export interface RunSourceInput {
  sourceId: string;
  trigger: 'schedule' | 'manual' | 'test';
  jobId?: string;
  attempt?: number;
  maxAttempts?: number;
}

export interface RunSourceResult {
  status: IngestionRunStatus;
  runId: string | null;
  fetched: number;
  inserted: number;
  updated: number;
  quarantined: number;
  errorCode?: string;
  /** True when the caller (BullMQ) should retry this attempt. */
  retry: boolean;
  skippedReason?: string;
}

/** Errors that mean "the registry entry is wrong" — open the circuit immediately. */
const CONFIG_ERRORS = new Set(['SSRF_BLOCKED', 'INVALID_URL', 'CONFIG_ERROR', 'ROBOTS_DISALLOWED']);

const DEFAULT_PROVIDERS: Record<FeedKind, FeedProvider> = {
  RSS: rssProvider,
  ATOM: rssProvider,
  LICENSED_API: licensedJsonProvider,
};

let lookupCache:
  { at: number; countries: Map<string, string>; sectors: Map<string, string> } | undefined;

async function lookups(prisma: PrismaClient) {
  if (lookupCache && Date.now() - lookupCache.at < 10 * 60_000) return lookupCache;
  const [countries, sectors] = await Promise.all([
    prisma.country.findMany({ select: { id: true, iso2: true } }),
    prisma.sector.findMany({ select: { id: true, slug: true } }),
  ]);
  lookupCache = {
    at: Date.now(),
    countries: new Map(countries.map((c) => [c.iso2, c.id])),
    sectors: new Map(sectors.map((s) => [s.slug, s.id])),
  };
  return lookupCache;
}

export function resetLookupCache(): void {
  lookupCache = undefined;
}

const skipped = (reason: string): RunSourceResult => ({
  status: 'SKIPPED',
  runId: null,
  fetched: 0,
  inserted: 0,
  updated: 0,
  quarantined: 0,
  retry: false,
  skippedReason: reason,
});

export async function runSource(
  input: RunSourceInput,
  deps: RunSourceDeps,
): Promise<RunSourceResult> {
  const { prisma } = deps;
  const now = deps.now ?? (() => new Date());
  const attempt = input.attempt ?? 1;
  const maxAttempts = input.maxAttempts ?? 1;
  const providers = { ...DEFAULT_PROVIDERS, ...deps.providers };

  const source = await prisma.feedSource.findUnique({
    where: { id: input.sourceId },
    include: { outlet: { include: { country: { select: { iso2: true } } } } },
  });
  if (!source) return skipped('source-not-found');
  // Defence in depth for the source policy: real feeds are never fetched before a terms review.
  if (!source.isFixture && !source.termsReviewedAt && input.trigger !== 'test') {
    return skipped('terms-not-reviewed');
  }
  if (input.trigger === 'schedule') {
    if (source.status !== 'ACTIVE') return skipped(`status-${source.status.toLowerCase()}`);
    if (source.nextEligibleFetchAt && source.nextEligibleFetchAt > now())
      return skipped('circuit-backoff');
  }

  const started = now();
  const log = deps.logger?.child({ sourceId: source.id, jobId: input.jobId, attempt });
  const run = await prisma.ingestionRun.create({
    data: {
      feedSourceId: source.id,
      jobId: input.jobId ?? null,
      attempt,
      trigger: input.trigger,
      startedAt: started,
      status: 'RUNNING',
    },
  });
  await prisma.feedSource.update({ where: { id: source.id }, data: { lastAttemptAt: started } });

  const finish = async (
    data: Partial<Parameters<typeof prisma.ingestionRun.update>[0]['data']> & {
      status: IngestionRunStatus;
    },
  ) => {
    const finishedAt = now();
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { ...data, finishedAt, durationMs: finishedAt.getTime() - started.getTime() },
    });
  };

  try {
    const provider = providers[source.kind];
    const result = await provider.fetch(
      {
        id: source.id,
        url: source.url,
        kind: source.kind,
        etag: source.etag,
        lastModifiedHeader: source.lastModifiedHeader,
        providerConfig: source.providerConfig,
      },
      deps.providerContext,
    );

    if (result.notModified) {
      await prisma.feedSource.update({
        where: { id: source.id },
        data: {
          lastSuccessfulSyncAt: now(),
          lastHttpStatus: 304,
          lastError: null,
          failureCount: 0,
          nextEligibleFetchAt: null,
          etag: result.etag ?? source.etag,
          lastModifiedHeader: result.lastModified ?? source.lastModifiedHeader,
        },
      });
      await finish({ status: 'NOT_MODIFIED', httpStatus: 304 });
      log?.info({ status: 'NOT_MODIFIED' }, 'source not modified');
      return {
        status: 'NOT_MODIFIED',
        runId: run.id,
        fetched: 0,
        inserted: 0,
        updated: 0,
        quarantined: 0,
        retry: false,
      };
    }

    const { countries, sectors } = await lookups(prisma);
    const ctx: PersistContext = {
      outletId: source.outletId,
      feedSourceId: source.id,
      isFixture: source.isFixture,
      sourceCountryIso2: source.outlet.country?.iso2 ?? null,
      feedDefaultIso2: source.defaultCountryIso2,
      feedDefaultSectors: source.defaultSectorSlugs,
      countryIdByIso2: countries,
      sectorIdBySlug: sectors,
    };

    let inserted = 0;
    let updated = 0;
    let quarantined = 0;
    const firstSeenAt = now();
    const seen = new Set<string>();
    const rejects: {
      reason: string;
      detail: string;
      itemExternalId: string | null;
      itemUrl: string | null;
    }[] = [];

    for (const raw of result.items) {
      const normalized = normalizeItem(raw, {
        feedUrl: result.finalUrl,
        feedLanguage: result.feedLanguage ?? source.language,
        outletLanguage: source.outlet.primaryLanguage,
        excerptAllowed: source.excerptAllowed,
        firstSeenAt,
      });
      if (!normalized.ok) {
        rejects.push({
          reason: normalized.reason,
          detail: normalized.detail,
          itemExternalId: normalized.externalId,
          itemUrl: normalized.url,
        });
        continue;
      }
      // Feeds sometimes repeat an item; process each canonical URL once per run.
      if (seen.has(normalized.item.canonicalUrlHash)) continue;
      seen.add(normalized.item.canonicalUrlHash);
      if (normalized.item.status === 'QUARANTINED') quarantined++;
      const outcome = await persistItem(prisma, ctx, normalized.item);
      if (outcome === 'inserted') inserted++;
      else if (outcome === 'updated') updated++;
    }

    if (rejects.length) {
      quarantined += rejects.length;
      await prisma.ingestionQuarantine.createMany({
        data: rejects.map((r) => ({ feedSourceId: source.id, runId: run.id, ...r })),
      });
    }

    await prisma.feedSource.update({
      where: { id: source.id },
      data: {
        lastSuccessfulSyncAt: now(),
        lastHttpStatus: result.httpStatus,
        lastError: null,
        failureCount: 0,
        nextEligibleFetchAt: null,
        etag: result.etag,
        lastModifiedHeader: result.lastModified,
        ...(inserted > 0 ? { lastNewItemAt: now() } : {}),
      },
    });
    const status: IngestionRunStatus = quarantined > 0 ? 'PARTIAL' : 'SUCCESS';
    await finish({
      status,
      httpStatus: result.httpStatus,
      fetchedCount: result.items.length,
      insertedCount: inserted,
      updatedCount: updated,
      quarantinedCount: quarantined,
    });
    log?.info(
      { status, fetched: result.items.length, inserted, updated, quarantined },
      'source ingested',
    );
    return {
      status,
      runId: run.id,
      fetched: result.items.length,
      inserted,
      updated,
      quarantined,
      retry: false,
    };
  } catch (err) {
    const isPayload = err instanceof PayloadError;
    const e: IngestError = isPayload
      ? new IngestError(err.code, err.message, { retryable: false })
      : toIngestError(err);
    if (isPayload) {
      await prisma.ingestionQuarantine.create({
        data: {
          feedSourceId: source.id,
          runId: run.id,
          reason: 'invalid-payload',
          detail: e.message.slice(0, 500),
          payloadExcerpt: (err as PayloadError).payloadExcerpt,
        },
      });
    }

    const willRetry = e.retryable && attempt < maxAttempts;
    const failureCount = willRetry ? source.failureCount : source.failureCount + 1;
    const openCircuit =
      !willRetry && (CONFIG_ERRORS.has(e.code) || shouldOpenCircuit(failureCount));
    await prisma.feedSource.update({
      where: { id: source.id },
      data: {
        lastError: `${e.code}: ${e.message}`.slice(0, 500),
        lastHttpStatus: e.httpStatus ?? null,
        ...(willRetry
          ? {}
          : {
              failureCount,
              nextEligibleFetchAt: nextEligibleAfterFailure(now(), failureCount),
              ...(openCircuit ? { status: 'ERROR' as const } : {}),
            }),
      },
    });
    await finish({
      status: 'FAILED',
      httpStatus: e.httpStatus ?? null,
      errorCode: e.code,
      errorDetail: e.message.slice(0, 1_000),
      quarantinedCount: isPayload ? 1 : 0,
    });
    log?.warn(
      {
        errorCode: e.code,
        willRetry,
        failureCount,
        circuitOpen: openCircuit,
        maxFailures: MAX_CONSECUTIVE_FAILURES,
      },
      'source fetch failed',
    );
    return {
      status: 'FAILED',
      runId: run.id,
      fetched: 0,
      inserted: 0,
      updated: 0,
      quarantined: isPayload ? 1 : 0,
      errorCode: e.code,
      retry: willRetry,
    };
  }
}
