# Coverage gap report (source registry)

Generated from `prisma/data/sources.ts` (27 outlets, 35 feeds) and `deploy/source-activations.json` (3 outlets approved for activation) by `scripts/audit/coverage-report.ts`.

A registered outlet in a country is a potential local voice, not proof of coverage: since FreAlgo 2.0, stories count for the countries they are _about_ (ADR V2-001). Measured coverage of the live corpus is on `/status#quality` and `/api/v1/sources/health`.

## By region

| Region     | Countries | With a registered outlet | With an approved outlet | Outlets (approved) |
| ---------- | --------- | ------------------------ | ----------------------- | ------------------ |
| Africa     | 60        | 2                        | 0                       | 2 (0)              |
| Americas   | 57        | 5                        | 2                       | 5 (2)              |
| Antarctica | 1         | 0                        | 0                       | 0 (0)              |
| Asia       | 51        | 7                        | 0                       | 9 (0)              |
| Europe     | 52        | 6                        | 1                       | 9 (1)              |
| Oceania    | 29        | 2                        | 0                       | 2 (0)              |

## Subregions with no registered outlet

- Africa / Eastern Africa (22)
- Africa / Northern Africa (7)
- Africa / Southern Africa (5)
- Americas / Caribbean (28)
- Antarctica / — (1)
- Asia / Central Asia (5)
- Europe / Eastern Europe (10)
- Oceania / Melanesia (5)
- Oceania / Micronesia (8)
- Oceania / Polynesia (10)

## Feed languages

| Language | Registered feeds | Approved |
| -------- | ---------------- | -------- |
| en       | 22               | 3        |
| es       | 3                | 0        |
| fr       | 2                | 0        |
| pt       | 2                | 1        |
| de       | 1                | 0        |
| ja       | 1                | 0        |
| ar       | 1                | 0        |
| bn       | 1                | 0        |
| ru       | 1                | 0        |
| it       | 1                | 0        |

Official languages of at least one country with no registered feed: 109 (am, ay, az, be, bg, bi, bs, ca, ch, cs, da, dv, dz, el, et, fa, fi, fil, fj, fo, ga, gil, gn, gsw, gv, hak, he, hi, hif, ho, hr, ht, hu, hy, id, is, ka, kk, kl, km, ko, ky, lb, lo, lt, lv, mg, mh, mi, mk, mn, ms, mt, my, na, nan, nb, nd, ne, niu, …).

## Priorities (from the gaps above)

1. Activate already-registered, openly licensed sources once the owner approves (Global Voices: CC BY 3.0, 8 language editions).
2. Seek outlets with explicit reuse terms in subregions that have no registered outlet, preferring local-language publishers over international English-language services.
3. Ask publishers in groups B and C of `docs/source-terms-review.md` for permission, starting with countries that have no other source (e.g. Myanmar Now for Myanmar).
