import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Daily retention job (docs/operations.md#retention):
 *  - IngestionRun / IngestionQuarantine older than RETENTION_DAYS
 *  - AdminAuditLog older than 4 × RETENTION_DAYS (security trail is kept longer)
 *  - ClientEventCounter rows older than 400 days
 *  - LabelAppeal contact emails purged 30 days after resolution (data minimisation)
 */
export async function runMaintenance(
  prisma: PrismaClient,
  retentionDays: number,
  now = new Date(),
) {
  const day = 86_400_000;
  const cutoff = new Date(now.getTime() - retentionDays * day);
  const [runs, quarantine, audit, counters, appeals] = await Promise.all([
    prisma.ingestionRun.deleteMany({ where: { startedAt: { lt: cutoff } } }),
    prisma.ingestionQuarantine.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.adminAuditLog.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - retentionDays * 4 * day) } },
    }),
    prisma.clientEventCounter.deleteMany({
      where: { day: { lt: new Date(now.getTime() - 400 * day) } },
    }),
    prisma.labelAppeal.updateMany({
      where: {
        status: { not: 'OPEN' },
        resolvedAt: { lt: new Date(now.getTime() - 30 * day) },
        contactEmail: { not: null },
      },
      data: { contactEmail: null },
    }),
  ]);
  return {
    ingestionRunsDeleted: runs.count,
    quarantineDeleted: quarantine.count,
    auditDeleted: audit.count,
    countersDeleted: counters.count,
    appealContactsPurged: appeals.count,
  };
}
