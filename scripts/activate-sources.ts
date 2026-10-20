/**
 * Operator command: record a terms review and activate real publisher feeds.
 *
 *   npm run sources:activate -- --slug bbc-news --reviewer "Jane" --notes "Personal, non-commercial use of RSS headlines permitted"
 *   npm run sources:activate -- --all --reviewer "Jane" --notes "..."
 *   npm run sources:activate -- --slug bbc-news --pause
 *
 * Every change is written to AdminAuditLog. This is the only way (besides the admin UI) that a
 * real feed becomes ACTIVE, so terms review is always recorded.
 */
import { parseArgs } from 'node:util';
import { createPrismaClient } from '../lib/db/client';

const { values } = parseArgs({
  options: {
    slug: { type: 'string', multiple: true },
    all: { type: 'boolean', default: false },
    reviewer: { type: 'string' },
    notes: { type: 'string' },
    'terms-url': { type: 'string' },
    pause: { type: 'boolean', default: false },
  },
});

async function main() {
  if (!values.all && !values.slug?.length)
    throw new Error('Pass --slug <slug> (repeatable) or --all');
  if (!values.pause && (!values.reviewer || !values.notes)) {
    throw new Error(
      'Activation requires --reviewer and --notes (summary of the publisher terms reviewed)',
    );
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL!, 2);
  try {
    const feeds = await prisma.feedSource.findMany({
      where: { isFixture: false, ...(values.all ? {} : { outlet: { slug: { in: values.slug } } }) },
      include: { outlet: { select: { slug: true } } },
    });
    if (!feeds.length) throw new Error('No matching real feeds');
    for (const f of feeds) {
      const data = values.pause
        ? { status: 'PAUSED' as const }
        : {
            status: 'ACTIVE' as const,
            termsReviewedAt: new Date(),
            licenseNotes: values.notes!,
            termsUrl: values['terms-url'] ?? f.termsUrl,
            failureCount: 0,
            nextEligibleFetchAt: null,
          };
      await prisma.$transaction([
        prisma.feedSource.update({ where: { id: f.id }, data }),
        prisma.adminAuditLog.create({
          data: {
            actor: `cli:${values.reviewer ?? 'operator'}`,
            action: values.pause ? 'source.pause' : 'source.activate',
            targetType: 'FeedSource',
            targetId: f.id,
            detail: { url: f.url, outlet: f.outlet.slug, notes: values.notes ?? null },
          },
        }),
      ]);
      console.log(`${values.pause ? 'paused' : 'activated'} ${f.outlet.slug} ${f.url}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
