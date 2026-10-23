# Lighthouse: FreAlgo 2.0 against v1, same machine (M5)

Both builds ran locally on the same machine, database (fixtures) and settings, one after the
other on 2026-10-23: v1 = `main` (`161fff1`), v2 = `v2/hybrid`. Command:
`node scripts/perf/lighthouse.mjs <base> <dir> v1|v2` (Lighthouse 13.5.0 mobile preset:
simulated slow 4G, 4× CPU). Local runs have no Caddy compression or HTTP/2, so LCP is higher
than on production (see `../lighthouse-before/summary.md`: 1.4–1.7 s); compare rows, not
absolute values.

| Page          | v1 Perf | v2 Perf | v1 LCP | v2 LCP | v1 TBT | v2 TBT | v1 CLS | v2 CLS | v1 KB | v2 KB |
| ------------- | ------- | ------- | ------ | ------ | ------ | ------ | ------ | ------ | ----- | ----- |
| home          | 93      | 93      | 2.94 s | 2.94 s | 159 ms | 150 ms | 0      | 0      | 564   | 564   |
| country-sheet | 93      | 93      | 2.94 s | 2.93 s | 137 ms | 141 ms | 0.025  | 0.025  | 573   | 574   |
| search        | 99      | 99      | 2.18 s | 2.18 s | 23 ms  | 24 ms  | 0.007  | 0.004  | 178   | 180   |
| stories       | —       | 99      | —      | 2.18 s | —      | 27 ms  | —      | 0      | —     | 191   |
| discover      | —       | 99      | —      | 2.17 s | —      | 22 ms  | —      | 0      | —     | 171   |
| story-mode    | —       | 99      | —      | 2.18 s | —      | 24 ms  | —      | 0      | —     | 172   |
| perspectives  | —       | 99      | —      | 2.18 s | —      | 22 ms  | —      | 0      | —     | 165   |

Accessibility, best practices and SEO: 100 on every page in both versions.

**Reading:** v2 does not change the cost of the v1 pages. Every new page is text-first and
meets the budgets locally (LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1). The Explore page's local LCP
(2.94 s) is the v1 figure; on production it is 1.5 s. The `perf/explore-lcp` branch reduces it
further and is waiting for the owner's decision.

## JavaScript per route (`node scripts/perf/route-js.mjs <base>`)

| Route                                           | Scripts | JS (uncompressed) | Three.js loaded |
| ----------------------------------------------- | ------- | ----------------- | --------------- |
| `/?intro=0` (Explore)                           | 12      | 1573 KB           | yes (globe)     |
| `/stories`, `/discover`, `/my-world`, `/search` | 8       | 458–466 KB        | no              |
| `/methodology`, Story Mode, Perspectives        | 7–8     | 457 KB            | no              |

The 3D engine loads only on Explore, as spec §12 requires.
