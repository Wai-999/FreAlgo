# Staged rollout plan (FreAlgo 2.0)

FreAlgo runs on one server, so "staged" means switching v2 on in steps with the feature flags,
checking each step on real traffic and data before the next. Every step can be undone with
`docs/release/rollback.md`. **Nothing here has been run on production; it needs the owner's
approval.**

Server: `163.192.8.142` (Oracle A1, Ubuntu 24.04), `https://frealgo.duckdns.org`, app directory
`/opt/frealgo`. Commands from the Mac use `~/.ssh/frealgo_oci_ed25519`.

```bash
ssh -i ~/.ssh/frealgo_oci_ed25519 ubuntu@163.192.8.142
```

## Stage 0: preparation (no production change)

- [ ] Owner approves the release and the push of `v2/hybrid`.
- [ ] Push the branch and let CI run: `git push -u origin v2/hybrid`. CI must be green (format,
      lint, typecheck, unit, integration, build, e2e, audit, Docker build).
- [ ] Merge into `main` (the server deploys `main`), or deploy the branch directly with
      `BRANCH=v2/hybrid`.
- [ ] Pull the latest backups off the server: `scripts/ops/pull-backups.sh 163.192.8.142`.
- [ ] Optional rehearsal on the newest backup (2–3 s, local; see `docs/release/acceptance.md` M5).

## Stage 1: v2 code, new sections off (one ingest cycle, about 3 hours)

Goal: the new data model (country roles, re-tagging, new tables, hourly grouping job) runs on
production while the interface stays as close to v1 as possible.

1. On the server, add to `/opt/frealgo/deploy/.env.production`:

   ```
   FEATURE_STORIES=false
   FEATURE_DISCOVER=false
   FEATURE_MY_WORLD=false
   FEATURE_PERSPECTIVES=false
   FEATURE_EVENT_CLUSTERING=false
   FEATURE_TIMELINES=false
   ```

2. From the Mac: `scripts/ops/deploy-remote.sh 163.192.8.142 frealgo.duckdns.org` (add
   `BRANCH=v2/hybrid` in front if not merged). The script backs up the database before it
   migrates, applies the four additive v2 migrations, re-tags stored reports, and runs the smoke
   test.
3. Check:
   - [ ] smoke test passed; `/api/v1/health` 200; pages still send the HSTS header;
   - [ ] `/status`: the 4 active feeds stay fresh after the next 3-hour tick;
   - [ ] country counts changed as rehearsed (for example the United Kingdom no longer counts
         BBC stories that are not about it; Brazil shows 11 "about" and a publisher-home notice);
   - [ ] worker log: `job schedulers registered`, no errors; the hourly `cluster-events` job logs
         `event clustering skipped` (flag off).

Rollback: Level 2 (redeploy `main`).

## Stage 2: reading features (one day)

1. Set `FEATURE_STORIES=true`, `FEATURE_DISCOVER=true`, `FEATURE_MY_WORLD=true` (or delete the
   lines to use the defaults) and run
   `sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d web worker`.
2. Check: navigation shows Explore, Stories, Discover, My World; Stories pages end in "You are
   caught up"; Surprise Me gives the same pick for the same seed; the daily discovery is either a
   real story or the honest empty state; Lighthouse on `/stories` (target LCP ≤ 2.5 s).

Rollback: Level 1 (flags off).

## Stage 3: events and Perspectives (review before and after)

1. Dry run on production data, which writes nothing:

   ```bash
   cd /opt/frealgo && sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production \
     run --rm migrate node --import tsx scripts/cluster-events.ts --dry-run
   ```

   Read every proposed grouping. If one is wrong, note the report id for an exclusion after
   enabling.

2. Set `FEATURE_EVENT_CLUSTERING=true`, `FEATURE_PERSPECTIVES=true`, `FEATURE_TIMELINES=true`
   (or remove the lines) and run `up -d web worker`. Events appear within the hour (the job runs
   at :20), or run `scripts/cluster-events.ts` once in the `migrate` container as above without
   `--dry-run`.
3. Check after 24 hours: `/stories/events` and `/perspectives`; spot-check each event against
   its headlines; remove wrong groupings with
   `scripts/cluster-events.ts --exclude <articleId> --reason "…" --by "<name>"`.

Rollback: Level 1 (`FEATURE_EVENT_CLUSTERING=false` hides events and stops grouping).

## Stage 4: optional features (only after reviewed content exists)

| Feature             | Precondition                                                                       | Flag                               |
| ------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| Story Journeys      | At least one real journey, curated by a named person, every step with evidence     | `FEATURE_JOURNEYS=true`            |
| World Pulse         | Owner reviews the page on production data (coverage is concentrated in GB, US, BR) | `FEATURE_WORLD_PULSE=true`         |
| Country connections | Owner reviews the list on production data                                          | `FEATURE_COUNTRY_CONNECTIONS=true` |
| Global Voices       | Owner's terms decision (`docs/source-terms-review.md`)                             | `npm run sources:activate`         |

## After each stage

- Record the date, commit and flag states in `docs/roadmap/status.md`.
- If a stage was rolled back, write a short note on why before trying again.
