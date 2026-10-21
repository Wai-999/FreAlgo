# Lighthouse baseline: production (before v2)

Measured against <https://frealgo.duckdns.org> with `node scripts/perf/lighthouse.mjs https://frealgo.duckdns.org <dir>` (Lighthouse mobile preset: simulated slow 4G and 4× CPU). Raw reports are reproducible with the same command; they are not committed because of their size.

| Page          | URL                                     | Measured (UTC)   | Perf | A11y | LCP   | TBT    | CLS   | Transfer |
| ------------- | --------------------------------------- | ---------------- | ---- | ---- | ----- | ------ | ----- | -------- |
| country-sheet | /?country=MM&sector=agriculture&intro=0 | 2026-10-21T14:03 | 99   | 100  | 1.7 s | 110 ms | 0.025 | 561 KB   |
| home          | /?intro=0                               | 2026-10-21T14:03 | 97   | 100  | 1.5 s | 180 ms | 0     | 557 KB   |
| search        | /search?q=rice&intro=0                  | 2026-10-21T14:03 | 100  | 100  | 1.4 s | 10 ms  | 0     | 167 KB   |

These production figures are better than the v1 local measurements in `docs/performance.md` (LCP 2.8 s). Those were taken on an overloaded development machine, without production's compression and HTTP/2 through Caddy. On production the simulated-mobile LCP budget (≤ 2.5 s) is met before any v2 change.
