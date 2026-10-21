/**
 * Operator command: record a terms review and activate real publisher feeds.
 *
 *   npm run sources:activate -- --slug bbc-news --reviewer "Jane" --notes "Personal, non-commercial use of RSS headlines permitted"
 *   npm run sources:activate -- --all --reviewer "Jane" --notes "..."
 *   npm run sources:activate -- --slug bbc-news --pause
 *   npm run sources:activate -- --from deploy/source-activations.json
 *
 * --from applies the operator's committed decisions (one entry per outlet: reviewer, review date,
 * terms URL, notes). It is idempotent: feeds that are already ACTIVE with a recorded review are
 * left untouched unless --force, so redeploys never rewrite review dates.
 *
 * Every change is written to AdminAuditLog. This is the only way (besides the admin UI) that a
 * real feed becomes ACTIVE, so terms review is always recorded.
 */
import { readFileSync } from 'node:fs';
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
    from: { type: 'string' },
    force: { type: 'boolean', default: false },
  },
});

interface Decision {
  slug: string;
  reviewer: string;
  reviewedOn: string;
  termsUrl: string;
  notes: string;
}

async function applyDecisions(file: string) {
  const decisions = JSON.parse(readFileSync(file, 'utf8')) as Decision[];
  for (const d of decisions) {
    if (!d.slug || !d.reviewer || !d.notes || !/^\d{4}-\d{2}-\d{2}$/.test(d.reviewedOn ?? '')) {
      throw new Error(`Incomplete decision in ${file}: ${JSON.stringify(d)}`);
    }
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL!, 2);
  try {
    for (const d of decisions) {
      const feeds = await prisma.feedSource.findMany({
        where: { isFixture: false, outlet: { slug: d.slug } },
      });
      if (!feeds.length) throw new Error(`No real feeds registered for ${d.slug}`);
      for (const f of feeds) {
        if (f.status === 'ACTIVE' && f.termsReviewedAt && !values.force) {
          console.log(`unchanged ${d.slug} ${f.url} (already active)`);
          continue;
        }
        await prisma.$transaction([
          prisma.feedSource.update({
            where: { id: f.id },
            data: {
              status: 'ACTIVE',
              termsReviewedAt: new Date(`${d.reviewedOn}T00:00:00Z`),
              licenseNotes: d.notes,
              termsUrl: d.termsUrl,
              failureCount: 0,
              nextEligibleFetchAt: null,
            },
          }),
          prisma.adminAuditLog.create({
            data: {
              actor: `cli:${d.reviewer}`,
              action: 'source.activate',
              targetType: 'FeedSource',
              targetId: f.id,
              detail: { url: f.url, outlet: d.slug, notes: d.notes, decisionFile: file },
            },
          }),
        ]);
        console.log(`activated ${d.slug} ${f.url}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (values.from) return applyDecisions(values.from);
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
