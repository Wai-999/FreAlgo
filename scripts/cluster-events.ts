/**
 * Groups recent reports into events (FreAlgo 2.0, M4; method in lib/events/cluster.ts).
 *
 *   node --import tsx scripts/cluster-events.ts            # cluster and save
 *   node --import tsx scripts/cluster-events.ts --dry-run  # print the decisions, write nothing
 *   node --import tsx scripts/cluster-events.ts --exclude <articleId> --reason "…" --by "<name>"
 *       # remove a wrongly grouped report for good (audited), then re-cluster
 *
 * Safe to run at any time: one run at a time (advisory lock), events only grow, and reports
 * already in an event are never moved. The worker runs the same job hourly ("cluster-events").
 */
import { parseArgs } from 'node:util';
import { createPrismaClient } from '../lib/db/client';
import { excludeFromEvents, runEventClustering } from '../lib/events/job';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    exclude: { type: 'string' },
    reason: { type: 'string' },
    by: { type: 'string' },
  },
});

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const prisma = createPrismaClient(url, 2);
  try {
    if (values.exclude) {
      if (!values.reason || !values.by) throw new Error('--exclude needs --reason and --by');
      const r = await excludeFromEvents(prisma, values.exclude, {
        reason: values.reason,
        by: values.by,
      });
      console.log(JSON.stringify({ msg: 'report excluded from events', ...r }));
    }
    const res = await runEventClustering(prisma, { dryRun: values['dry-run'] });
    if (values['dry-run'])
      for (const d of res.decisions ?? [])
        console.log(
          JSON.stringify({ kind: d.kind, score: d.score, shared: d.shared, titles: d.titles }),
        );
    const { decisions: _omit, ...summary } = res;
    console.log(JSON.stringify({ msg: 'event clustering complete', ...summary }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
