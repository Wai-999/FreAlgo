# FreAlgo 2.0 status

Branch `v2/hybrid` (local commits). `main` = production (v1) until the owner approves the rollout.
Legend: ✅ implemented and tested · 🟡 partial · ⏳ planned · ⛔ blocked (external) · ✖ rejected by
the feature gate.

## M1: Baseline, safety and architecture

| Item                                                                                   | State | Evidence                                                                                                      |
| -------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| Repository, deployment and data audit                                                  | ✅    | [`docs/audit/baseline.md`](../audit/baseline.md), [`coverage-baseline.json`](../audit/coverage-baseline.json) |
| UI baseline (6 widths + 200 % zoom, keyboard, reduced motion, WebGL off, slow network) | ✅    | [`ui-before.json`](../audit/ui-before.json), `screenshots/before-*`                                           |
| Performance baseline on production                                                     | ✅    | [`lighthouse-before/summary.md`](../audit/lighthouse-before/summary.md)                                       |
| Architecture decision record                                                           | ✅    | [`adr-001-hybrid-upgrade.md`](../architecture/adr-001-hybrid-upgrade.md)                                      |
| Route map and v1 route-preservation test                                               | ✅    | [`route-map.md`](../architecture/route-map.md), `tests/e2e/routes.spec.ts`                                    |
| Feature flags (env-driven, listed on `/methodology#features`)                          | ✅    | `lib/flags.ts`, `tests/unit/flags.test.ts`                                                                    |
| v2 design tokens (spec palette, AA-verified)                                           | ✅    | `app/globals.css`, `tests/unit/design-tokens.test.ts`                                                         |
| CI smoke step (same script as production)                                              | ✅    | `.github/workflows/ci.yml`                                                                                    |
| Database backup and migration plan                                                     | ✅    | [`migration-plan.md`](../architecture/migration-plan.md)                                                      |
| Docs reorganised into the spec's structure                                             | ✅    | `docs/{audit,architecture,data,operations,release,roadmap}`                                                   |

## M2: Reliable global coverage and provenance

⏳ Not started. Scope:

- country roles (subject / publisher home / feed scope);
- gazetteer fixes for US/U.S. and demonyms;
- feed-scope rule;
- Portuguese sector rules;
- article type (news/opinion);
- source quality dashboard and public `sources/health` alias;
- coverage gap report;
- registering CC-licensed sources (paused, pending owner review).

## M3: Hybrid editorial UX and My World

⏳ Not started.

## M4: Evidence-backed intelligence and discovery

⏳ Not started.

## M5: Performance, security, deployment and handoff

⏳ Not started. Production rollout requires the owner's approval.
