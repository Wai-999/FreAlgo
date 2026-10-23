# Rollback plan (FreAlgo 2.0)

How to undo the v2 release, fastest and least destructive first. Every level below was rehearsed
on 2026-10-23 on a restored copy of production (`frealgo-20261022T023701Z.dump`, checksum
verified), not on production itself.

Production today: `main` (v1, `161fff1`) on the Oracle A1 server, `https://frealgo.duckdns.org`.
v2 is the `v2/hybrid` branch.

## Before the release (prerequisites)

1. `scripts/ops/server-setup.sh` now takes a **pre-deploy backup** automatically
   (`/var/backups/frealgo/pre-deploy/`, newest 5) before it migrates anything. Copy it off the
   server too: `scripts/ops/pull-backups.sh` (or `scp` the `pre-deploy` folder).
2. Note the commit that is live (`git -C /opt/frealgo rev-parse HEAD` on the server).
3. Keep this page and `prisma/rollbacks/v2-all.down.sql` at hand.

## Level 1: switch a feature off (seconds, no data change)

Every v2 surface has a flag (`lib/flags.ts`). On the server, set it in
`/opt/frealgo/deploy/.env.production`, for example `FEATURE_PERSPECTIVES=false`, then:

```bash
cd /opt/frealgo && sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d web worker
```

Flagged pages and APIs return 404 and disappear from the navigation; nothing is deleted.
`FEATURE_EVENT_CLUSTERING=false` also stops the hourly grouping job. Use this first whenever
one feature misbehaves.

## Level 2: put v1 back, keep the v2 schema (minutes, no data change)

All v2 migrations are additive, so **v1 code runs on the v2 database unchanged**. Rehearsed: the
v1 build served every v1 page and API (20/20 route checks) on a database migrated to v2.

From your Mac:

```bash
BRANCH=main scripts/ops/deploy-remote.sh 163.192.8.142 frealgo.duckdns.org
```

This rebuilds and restarts v1 from `main`. The `migrate` step finds nothing to apply, and the
seed and re-tag are idempotent. v2 tables stay in place, unused, so a later re-release needs no
migration. Expect a rebuild of several minutes on the A1 server.

## Level 3: return the schema to its exact v1 shape (seconds, drops v2 data)

Only when the v2 tables or columns themselves cause a problem. This removes event clusters,
curated timelines and journeys, exclusions, the alphabetical sort column, article types and
country roles. Articles, tags, sources, labels and their history are kept.

1. Do Level 2 first (v1 running).
2. Take a fresh backup: `ssh … 'cd /opt/frealgo && sudo env COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production" sh scripts/ops/backup.sh /var/backups/frealgo/pre-deploy'`.
3. Copy `prisma/rollbacks/v2-all.down.sql` to the server and run it as the owner role:

   ```bash
   sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production \
     exec -T postgres psql -v ON_ERROR_STOP=1 -U frealgo -d frealgo < v2-all.down.sql
   ```

   It runs in one transaction and also deletes the four v2 rows from `_prisma_migrations`.

4. Run `scripts/ops/smoke.sh https://frealgo.duckdns.org`.

Rehearsed: 0.27 s on the production copy; 146 articles and 243 country tags kept; v1 passed 19
of 20 route checks (the 20th expects fixture data, which production does not have). Migrating
forward again afterwards gave identical results (same role counts, same 7 events).

Per-migration scripts are in `prisma/rollbacks/<migration>.down.sql` if only the latest
migration must go.

## Level 4: restore the pre-deploy backup (minutes, loses changes since the backup)

When data is wrong, not just code or schema. Reports ingested after the backup are lost, but the
next fetches bring most of them back (feeds keep recent items).

```bash
# on the server, in /opt/frealgo, with web and worker stopped
C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production"
sudo $C stop web worker
sudo env COMPOSE="$C" I_UNDERSTAND_THIS_OVERWRITES_PRODUCTION=yes \
  sh scripts/ops/restore.sh /var/backups/frealgo/pre-deploy/frealgo-<stamp>.dump frealgo
```

`restore.sh` verifies the checksum first and refuses to overwrite `frealgo` without the explicit
variable. Without a target it restores into a scratch database, which is the safe way to inspect
a backup first.

Then Level 2 and the smoke test. `scripts/ops/restore-drill.sh` rehearses a restore without
touching the live database.

## What cannot be rolled back

- Readers' browsers may have cached v2 pages for up to the cache lifetime of the HTML (pages are
  dynamic; static assets are versioned), and saved preferences use the same version as v1, so
  nothing breaks.
- HSTS is unchanged by v2 (the app has sent a two-year HSTS header on pages since v1).

## Decision guide

| Symptom                                                          | Level                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| One v2 feature wrong or slow (Perspectives, events, Discover…)   | 1                                                                                         |
| Wrong event groupings in general                                 | 1 (`FEATURE_EVENT_CLUSTERING=false`), then fix with `scripts/cluster-events.ts --exclude` |
| v2 pages fail or the shell is broken                             | 2                                                                                         |
| Database errors from v2 objects (trigger, indexes) after Level 2 | 3                                                                                         |
| Wrong or lost data                                               | 4                                                                                         |
