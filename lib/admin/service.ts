import { z } from 'zod';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ApiError, notFound } from '@/lib/api/handler';
import {
  IDEOLOGY_TAGS,
  LABEL_STATUSES,
  ORIENTATIONS,
  validateSourceLabel,
} from '@/lib/domain/orientation';
import { FETCH_JOB_OPTIONS, getIngestQueue, manualJobId } from '@/lib/queue/ingest-queue';

/**
 * Privileged operations. Each one validates input, enforces policy and appends an
 * AdminAuditLog row in the same transaction as the change.
 */

async function audit(
  tx: Prisma.TransactionClient,
  actor: string,
  action: string,
  targetType: string,
  targetId: string | null,
  detail?: Prisma.InputJsonValue,
) {
  await tx.adminAuditLog.create({ data: { actor, action, targetType, targetId, detail } });
}

export const sourceUpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
    termsReviewed: z
      .object({
        licenseNotes: z.string().trim().min(10).max(1000),
        termsUrl: z.url().max(500).nullable().optional(),
        excerptAllowed: z.boolean(),
      })
      .optional(),
  })
  .refine((v) => v.status || v.termsReviewed, 'Nothing to update');

export async function updateSource(
  prisma: PrismaClient,
  actor: string,
  id: string,
  input: z.infer<typeof sourceUpdateSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.feedSource.findUnique({ where: { id } });
    if (!source) throw notFound('Source');
    const data: Prisma.FeedSourceUpdateInput = {};
    if (input.termsReviewed) {
      data.termsReviewedAt = new Date();
      data.licenseNotes = input.termsReviewed.licenseNotes;
      data.termsUrl = input.termsReviewed.termsUrl ?? source.termsUrl;
      data.excerptAllowed = input.termsReviewed.excerptAllowed;
    }
    if (input.status === 'ACTIVE') {
      // Policy: a real feed is never activated without a recorded terms review.
      if (!source.isFixture && !source.termsReviewedAt && !input.termsReviewed) {
        throw new ApiError(
          409,
          'TERMS_REVIEW_REQUIRED',
          'Record a terms review before activating this source',
        );
      }
      data.status = 'ACTIVE';
      data.failureCount = 0;
      data.nextEligibleFetchAt = null;
    } else if (input.status === 'PAUSED') {
      data.status = 'PAUSED';
    }
    const updated = await tx.feedSource.update({ where: { id }, data });
    await audit(
      tx,
      actor,
      input.status ? `source.${input.status.toLowerCase()}` : 'source.terms-reviewed',
      'FeedSource',
      id,
      {
        url: source.url,
        ...(input.termsReviewed ? { licenseNotes: input.termsReviewed.licenseNotes } : {}),
      },
    );
    return updated;
  });
}

export async function resetCircuit(prisma: PrismaClient, actor: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.feedSource.findUnique({ where: { id } });
    if (!source) throw notFound('Source');
    const updated = await tx.feedSource.update({
      where: { id },
      data: {
        failureCount: 0,
        nextEligibleFetchAt: null,
        lastError: null,
        ...(source.status === 'ERROR' ? { status: 'PAUSED' as const } : {}),
      },
    });
    await audit(tx, actor, 'source.reset-circuit', 'FeedSource', id, {
      previousStatus: source.status,
    });
    return updated;
  });
}

export async function requestRefetch(prisma: PrismaClient, actor: string, id: string) {
  const source = await prisma.feedSource.findUnique({ where: { id } });
  if (!source) throw notFound('Source');
  if (source.isFixture) throw new ApiError(409, 'FIXTURE_SOURCE', 'Fixture feeds are not fetched');
  if (!source.termsReviewedAt) {
    throw new ApiError(
      409,
      'TERMS_REVIEW_REQUIRED',
      'Record a terms review before fetching this source',
    );
  }
  const jobId = manualJobId(id, new Date());
  try {
    await getIngestQueue().add(
      'fetch-source',
      { sourceId: id, trigger: 'manual', requestedBy: actor },
      { ...FETCH_JOB_OPTIONS, jobId },
    );
  } catch {
    throw new ApiError(503, 'QUEUE_UNAVAILABLE', 'The job queue is unavailable; try again later');
  }
  await prisma.adminAuditLog.create({
    data: {
      actor,
      action: 'source.refetch',
      targetType: 'FeedSource',
      targetId: id,
      detail: { jobId },
    },
  });
  return { jobId, queued: true };
}

export const articleStatusSchema = z.object({
  status: z.enum(['PUBLISHED', 'REMOVED', 'QUARANTINED']),
  reason: z.string().trim().min(3).max(500),
});

export async function setArticleStatus(
  prisma: PrismaClient,
  actor: string,
  id: string,
  input: z.infer<typeof articleStatusSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const article = await tx.article.findUnique({
      where: { id },
      select: { id: true, status: true, canonicalUrl: true },
    });
    if (!article) throw notFound('Article');
    const updated = await tx.article.update({
      where: { id },
      data: { status: input.status, statusReason: input.reason },
    });
    await audit(tx, actor, `article.${input.status.toLowerCase()}`, 'Article', id, {
      from: article.status,
      reason: input.reason,
      url: article.canonicalUrl,
    });
    return { id: updated.id, status: updated.status };
  });
}

export const quarantineResolveSchema = z.object({
  resolution: z.enum(['dismissed', 'source-fixed', 'reported-to-publisher']),
});

export async function resolveQuarantine(
  prisma: PrismaClient,
  actor: string,
  id: string,
  input: z.infer<typeof quarantineResolveSchema>,
) {
  return prisma.$transaction(async (tx) => {
    const q = await tx.ingestionQuarantine.findUnique({ where: { id } });
    if (!q) throw notFound('Quarantine record');
    await tx.ingestionQuarantine.update({
      where: { id },
      data: { resolvedAt: new Date(), resolution: input.resolution },
    });
    await audit(tx, actor, 'quarantine.resolve', 'IngestionQuarantine', id, {
      resolution: input.resolution,
    });
    return { id, resolution: input.resolution };
  });
}

export const labelUpdateSchema = z.object({
  orientation: z.enum(ORIENTATIONS),
  status: z.enum(LABEL_STATUSES),
  confidence: z.number().min(0).max(1).nullable(),
  ideologyTags: z.array(z.enum(IDEOLOGY_TAGS)).max(6).default([]),
  methodology: z.string().trim().max(2000).nullable(),
  sourceUrl: z.url().max(500).nullable(),
  reviewedAt: z.iso.date().nullable(),
  context: z.string().trim().max(300).nullable(),
  isMachine: z.boolean().default(false),
  changeReason: z.string().trim().min(5).max(500),
});

export async function updateOutletLabel(
  prisma: PrismaClient,
  actor: string,
  outletId: string,
  input: z.infer<typeof labelUpdateSchema>,
) {
  const issues = validateSourceLabel({
    orientation: input.orientation,
    status: input.status,
    confidence: input.confidence,
    ideologyTags: input.ideologyTags,
    methodology: input.methodology,
    sourceUrl: input.sourceUrl,
    reviewedAt: input.reviewedAt,
    context: input.context,
    isMachine: input.isMachine,
  });
  if (issues.length)
    throw new ApiError(
      422,
      'LABEL_POLICY_VIOLATION',
      'Label does not meet the editorial policy',
      issues,
    );
  return prisma.$transaction(async (tx) => {
    const outlet = await tx.mediaOutlet.findUnique({ where: { id: outletId } });
    if (!outlet) throw notFound('Outlet');
    const reviewedAt = input.reviewedAt ? new Date(`${input.reviewedAt}T00:00:00Z`) : null;
    const fields = {
      orientation: input.orientation,
      ideologyTags: input.ideologyTags,
      labelStatus: input.status,
      labelConfidence: input.confidence,
      labelMethodology: input.methodology,
      labelSourceUrl: input.sourceUrl,
      labelReviewedAt: reviewedAt,
      labelContext: input.context,
      labelIsMachine: input.isMachine,
    };
    await tx.mediaOutlet.update({ where: { id: outletId }, data: fields });
    await tx.outletLabelHistory.create({
      data: {
        outletId,
        orientation: input.orientation,
        ideologyTags: input.ideologyTags,
        labelStatus: input.status,
        labelConfidence: input.confidence,
        labelMethodology: input.methodology,
        labelSourceUrl: input.sourceUrl,
        labelReviewedAt: reviewedAt,
        labelContext: input.context,
        labelIsMachine: input.isMachine,
        changedBy: actor,
        changeReason: input.changeReason,
      },
    });
    await audit(tx, actor, 'outlet.label-update', 'MediaOutlet', outletId, {
      from: { orientation: outlet.orientation, status: outlet.labelStatus },
      to: { orientation: input.orientation, status: input.status },
      reason: input.changeReason,
    });
    return { id: outletId, ...fields };
  });
}

export async function listSourcesForAdmin(prisma: PrismaClient) {
  return prisma.feedSource.findMany({
    orderBy: [{ isFixture: 'asc' }, { status: 'asc' }, { url: 'asc' }],
    include: {
      outlet: {
        select: {
          id: true,
          name: true,
          slug: true,
          country: { select: { iso2: true, name: true } },
        },
      },
      _count: { select: { articles: true } },
    },
  });
}
