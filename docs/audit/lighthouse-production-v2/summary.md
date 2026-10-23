# Lighthouse: production after the FreAlgo 2.0 release

Measured against <https://frealgo.duckdns.org> on 2026-10-23 at about 02:15 UTC, after the v2
release (`main` = `e11202e`; events and Perspectives on). Command:
`node scripts/perf/lighthouse.mjs https://frealgo.duckdns.org <dir> v2` (Lighthouse 13.5.0
mobile preset: simulated slow 4G, 4× CPU). Same method as the v1 baseline in
`../lighthouse-before/summary.md`.

| Page          | Perf | A11y | LCP    | TBT    | CLS   | Transfer | v1 baseline LCP |
| ------------- | ---- | ---- | ------ | ------ | ----- | -------- | --------------- |
| home          | 98   | 100  | 1.23 s | 152 ms | 0     | 557 KB   | 1.5 s           |
| country-sheet | 99   | 100  | 1.31 s | 121 ms | 0.025 | 562 KB   | 1.7 s           |
| search        | 100  | 100  | 0.94 s | 14 ms  | 0     | 169 KB   | 1.4 s           |
| stories       | 99   | 100  | 1.85 s | 13 ms  | 0     | 187 KB   | new             |
| discover      | 100  | 100  | 1.21 s | 13 ms  | 0     | 161 KB   | new             |
| story-mode    | 100  | 100  | 0.95 s | 14 ms  | 0     | 163 KB   | new             |
| perspectives  | 100  | 100  | 1.50 s | 7 ms   | 0     | 157 KB   | new             |

Best practices and SEO: 100 on every page. Every page meets the budgets (LCP ≤ 2.5 s,
TBT ≤ 200 ms, CLS ≤ 0.1). Single runs: differences of a few hundred milliseconds between runs are
normal, so read "no regression" rather than "v2 is faster".
