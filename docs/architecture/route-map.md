# Route map (v1 → v2)

Every v1 URL is preserved; `tests/e2e/routes.spec.ts` fails if one stops returning 200.
New routes sit behind feature flags (`lib/flags.ts`) and return 404 when their flag is off.

## Pages

| Path                          | Purpose                                                                                                                           | Since | Flag                 | Status                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------- | ------------------------------- |
| `/`                           | **Explore**: globe / 2D map / country list, country panel (`?country=`, `sector`, filters, `view=list`, `globe=force`, `intro=0`) | v1    | —                    | preserved                       |
| `/search`                     | Full-text search with filters and transparent ordering                                                                            | v1    | —                    | preserved (secondary nav)       |
| `/sources`, `/sources/[slug]` | Source registry, labels, provenance, terms status, label history                                                                  | v1    | —                    | preserved (secondary nav)       |
| `/status`                     | **Freshness**: scheduler and per-source health                                                                                    | v1    | —                    | preserved (secondary nav)       |
| `/methodology`                | Ordering, classification, selection and sourcing rules; feature-flag states                                                       | v1    | —                    | preserved, extended             |
| `/about`, `/privacy`          | About, privacy notice                                                                                                             | v1    | —                    | preserved                       |
| `/settings`                   | Preferences (browser-local; optional account copy)                                                                                | v1    | —                    | preserved; linked from My World |
| `/account`, `/admin`          | Sign-in, operator console                                                                                                         | v1    | —                    | preserved                       |
| `/stories`                    | **Stories**: finite, chronological collections; reading depths; filters                                                           | v2    | `stories`            | new                             |
| `/stories/[event]`            | **Story Mode** for an event cluster: what, where, what sources report, what is uncertain, dated timeline                          | v2    | `eventClustering`    | new                             |
| `/discover`                   | **Discover**: Surprise Me (seeded), daily discovery and archive, journeys (if enabled)                                            | v2    | `discover`           | new                             |
| `/discover/journeys/[slug]`   | Story Journey with sourced steps and a plain-text alternative                                                                     | v2    | `journeys`           | new (off by default)            |
| `/perspectives`               | **Perspectives**: events covered by more than one outlet                                                                          | v2    | `perspectives`       | new                             |
| `/perspectives/[event]`       | Side-by-side coverage, label provenance, lexical overlap, corpus gaps                                                             | v2    | `perspectives`       | new                             |
| `/stories/events`             | Every event cluster, newest latest report first (finite pages)                                                                    | v2    | `eventClustering`    | new (M4)                        |
| `/world-pulse`                | Reports per country on the 2D map, legend and table (raw counts, not importance)                                                  | v2    | `worldPulse`         | new (off by default)            |
| `/connections`                | Countries named in the same event clusters, with dates and links                                                                  | v2    | `countryConnections` | new (off by default)            |
| `/my-world`                   | **My World**: your chosen countries, sectors, languages, outlets; why each story appears; export/import/reset                     | v2    | `myWorld`            | new                             |

## APIs (spec name → implemented path)

| Spec endpoint (§7)                     | Implemented as                                                        | Notes                                                                             |
| -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/countries?withCoverage=true` | `GET /api/v1/countries`                                               | Already returns counts and last refresh; v2 adds subject vs publisher-home counts |
| `GET /api/articles?country=…`          | `GET /api/v1/countries/:iso2/articles`, `GET /api/v1/articles/search` | v1 contracts; v2 adds `role`, `type` filters, `alphabetical` sort                 |
| (list)                                 | `GET /api/v1/events`                                                  | new: event clusters, `cursor`, `limit`, `country`, `minOutlets`                   |
| `GET /api/events/:id`                  | `GET /api/v1/events/:id`                                              | new (flag `eventClustering`)                                                      |
| `GET /api/events/:id/perspectives`     | `GET /api/v1/events/:id/perspectives`                                 | new (flag `perspectives`)                                                         |
| `GET /api/journeys/:slug`              | `GET /api/v1/journeys/:slug`                                          | new (flag `journeys`)                                                             |
| `GET /api/discover/random?seed=…`      | `GET /api/v1/discover/random`                                         | new (flag `discover`)                                                             |
| `GET /api/sources/health`              | `GET /api/v1/health/freshness` (+ alias `/api/v1/sources/health`)     | public-safe; no secrets or internal errors                                        |
| `GET /api/methodology`                 | `GET /api/v1/methodology`                                             | new: machine-readable rules and flag states                                       |

Admin, auth, preferences, telemetry and metrics endpoints are unchanged.
