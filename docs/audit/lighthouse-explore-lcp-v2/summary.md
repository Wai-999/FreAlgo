# Lighthouse: Explore first-load cuts ported to FreAlgo 2.0, same machine

Both builds ran locally on the same machine, database (fixtures) and settings (feature flags at
their defaults), one after the other on 2026-10-23 (UTC): before = `main` (`d70bb23`), after =
`perf/explore-lcp-v2` (the port of `perf/explore-lcp` and its CI budget). Command:
`node scripts/perf/lighthouse.mjs http://127.0.0.1:3100 <dir> v2`, then two more passes of the
Explore pages with the `v1` page set (Lighthouse 13.5.0 mobile preset: simulated slow 4G, 4× CPU).
Local runs have no Caddy compression or HTTP/2, so LCP is higher than on production (Explore
1.23 s, `../lighthouse-production-v2/summary.md`); compare rows, not absolute values.

## Explore pages, three runs each

| Page          | Before: LCP runs   | After: LCP runs    | Median LCP        | Perf (median) | Transfer     |
| ------------- | ------------------ | ------------------ | ----------------- | ------------- | ------------ |
| home          | 2.69, 2.94, 2.93 s | 1.71, 2.33, 2.32 s | 2.93 → **2.32 s** | 93 → 96       | 564 → 483 KB |
| country-sheet | 2.94, 2.93, 2.95 s | 2.32, 2.34, 2.33 s | 2.94 → **2.33 s** | 92 → 97       | 574 → 494 KB |

One run per build came in lower than the other two (2.69 s before, 1.71 s after). The same
requests had finished by the observed paint in all six runs (13 of 18 before, 11 of 15 after),
so the gap is not explained by bytes; it was not investigated further. The medians are the
comparable figures. TBT stayed within its usual ±40 ms (home 143–207 ms before, 156–185 ms after;
country sheet 147–179 ms before, 136–165 ms after). CLS is unchanged (0 and 0.025).

## Other pages (single run, `v2` page set)

| Page         | Before LCP | After LCP | Before TBT | After TBT | Before KB | After KB |
| ------------ | ---------- | --------- | ---------- | --------- | --------- | -------- |
| search       | 2.18 s     | 2.18 s    | 25 ms      | 14 ms     | 180       | 182      |
| stories      | 2.18 s     | 2.18 s    | 26 ms      | 13 ms     | 191       | 194      |
| discover     | 2.18 s     | 2.17 s    | 23 ms      | 11 ms     | 171       | 169      |
| story-mode   | 2.18 s     | 2.18 s    | 26 ms      | 12 ms     | 172       | 172      |
| perspectives | 2.03 s     | 2.03 s    | 12 ms      | 28 ms     | 166       | 166      |

Accessibility, best practices and SEO: 100 on every page in both builds. Search and Stories
transfer 2–3 KB more because the filter form's fields are now server-rendered (markup in the HTML
and the RSC payload instead of client JavaScript); their LCP is unchanged.

## First-load bytes (`npm run perf:budget`, gzipped)

| Budget             | Limit  | Before   | After    |
| ------------------ | ------ | -------- | -------- |
| Page entry JS      | 9.5 KB | 69.2 KB  | 8.86 KB  |
| App JS             | 20 KB  | 77.1 KB  | 16.75 KB |
| Total JS           | 155 KB | 209.0 KB | 148.7 KB |
| CSS                | 9 KB   | 8.34 KB  | 8.48 KB  |
| Map iframe         | 20 KB  | 43.3 KB  | 17.5 KB  |
| HTML, home         | —      | 20.3 KB  | 18.4 KB  |
| HTML, country page | —      | 30.7 KB  | 29.8 KB  |

## JavaScript per route (`node scripts/perf/route-js.mjs http://127.0.0.1:3100`)

| Route                                    | Before: scripts, JS | After: scripts, JS | Three.js loaded |
| ---------------------------------------- | ------------------- | ------------------ | --------------- |
| `/?intro=0` (Explore, globe included)    | 12, 1573 KB         | 9, 1416 KB         | yes (globe)     |
| `/stories`                               | 8, 466 KB           | 8, 459 KB          | no              |
| `/discover`                              | 8, 458 KB           | 8, 458 KB          | no              |
| `/my-world?country=MM`                   | 8, 464 KB           | 8, 463 KB          | no              |
| `/search?q=rice`                         | 8, 466 KB           | 8, 458 KB          | no              |
| `/methodology`, Story Mode, Perspectives | 7–8, 457 KB         | 7–8, 457 KB        | no              |

JS is uncompressed. The 3D engine still loads only on Explore.
