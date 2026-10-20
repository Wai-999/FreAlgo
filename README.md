# FreAlgo — personal, ad-free, algorithm-free global news explorer

Pick a country on a globe (or from an accessible list), filter by sector, outlet, language, period
or source orientation, choose the order yourself, and read the original publisher. There are no
ads, no engagement ranking, no infinite scroll and no tracking.

## Quick start (one command)

Requirements: Docker Desktop (or Docker Engine with Compose v2).

```bash
docker compose up --build
```

Then open http://localhost:3000. The stack starts PostgreSQL, Redis, a one-shot `migrate` job
(migrations plus idempotent seed), the web app and the ingestion worker. Out of the box the app
shows clearly badged **fixture** data. Real publisher feeds are registered paused until their
terms are reviewed; see [docs/source-policy.md](docs/source-policy.md).

## Local development

Requirements: Node.js 24, Docker.

```bash
cp .env.example .env            # then set SESSION_SECRET / ADMIN_API_TOKEN (openssl rand -base64 48)
npm ci
npm run infra:up                # postgres + redis only
npx prisma migrate deploy
npm run db:seed
npm run dev                     # web on :3000
npm run worker:dev              # ingestion worker (separate terminal)
```

| Command                                       | What it does                                                        |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `npm run lint` / `typecheck` / `format:check` | Static checks                                                       |
| `npm test`                                    | Unit tests                                                          |
| `npm run test:integration`                    | Integration tests against `DATABASE_URL_TEST` (must end in `_test`) |
| `npm run build && npm run test:e2e`           | Playwright on Chromium, WebKit and Firefox (desktop + mobile)       |
| `npm run ci`                                  | Everything CI runs, except e2e                                      |

## Documentation

- [Architecture](docs/architecture.md) · [Decisions (ADRs)](docs/decisions.md)
- [Source & editorial policy](docs/source-policy.md) · [Milestones](docs/milestones.md)
- [Operations runbook](docs/operations.md) (Milestone 5)

## Licences and attribution

Country boundaries: Natural Earth (public domain) via world-atlas (ISC). Country codes and names:
i18n-iso-countries (MIT). Regions and official languages: Unicode CLDR (Unicode License v3).
Headlines belong to their publishers and always link to the source.
