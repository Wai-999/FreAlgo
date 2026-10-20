# Performance report

Measured on 2026-10-20 against the production build (`next build`, standalone server) on the
development machine: Apple Silicon, 14 cores, 24 GB RAM. During measurement the machine was
under heavy memory pressure from other applications (swap 6.5 GB of 7 GB in use). Treat absolute
times as conservative.

**Important.** These are emulated results: Lighthouse simulated mobile throttling, and CDP CPU
throttling with phone viewport and touch emulation. They are **not** measurements on physical
low-end phones. Headless Chromium has no GPU here, so every WebGL number below comes from
**SwiftShader (CPU rasterisation)**, which is a worst case for the globe. A real phone GPU
rasterises far faster. Physical-device testing (low-end Android, iOS Safari) remains an open
item; see the release report.

Reproduce:

```bash
npm run build && npm run start:standalone   # or docker compose up
node scripts/perf/lighthouse.mjs http://127.0.0.1:3000
node scripts/perf/profile-globe.mjs http://127.0.0.1:3000
```

## Lighthouse (mobile, simulated slow 4G + 4× CPU)

| Page                                                             | Perf        | A11y | Best practices | SEO | LCP          | TBT          | CLS   |
| ---------------------------------------------------------------- | ----------- | ---- | -------------- | --- | ------------ | ------------ | ----- |
| Home, before optimisation                                        | 71          | 100  | 96             | 100 | 3.24 s       | 944 ms       | 0     |
| Home, after optimisation                                         | **92**      | 100  | 100            | 100 | 2.85 s       | 214 ms       | 0     |
| Country sheet `/?country=MM&sector=agriculture` (before → after) | 91 → **95** | 100  | 96 → 100       | 100 | 3.26 → 2.8 s | 134 → 110 ms | 0.025 |
| Search `/search?q=rice`                                          | **99**      | 100  | 100            | 100 | 2.17 s       | 18 ms        | 0.007 |

**Gap against the SLO.** Simulated mobile LCP is 2.8–2.85 s on the two map pages, against a
< 2.5 s target. The LCP element is a small server-rendered text caption that actually paints in
~80 ms unthrottled (Lighthouse observed trace: TTFB 11 ms + render delay 67 ms). Lighthouse's
simulation attributes the remaining time to main-thread JavaScript under 4× CPU throttling. The
next steps are to ship less client JavaScript on `/`: server-render the country list and hydrate
only its search box, and replace the sheet's Motion transitions with CSS. They are listed in the
release report.

### What changed between "before" and "after"

1. **Flat map moved out of the HTML.** The server-rendered SVG map was inlined twice: once as
   markup and once inside the React Server Components payload. It is now a static, immutable
   `/geo/world-map.v1.svg` in an iframe. Its links use `target="_top"`, so it still works
   without JavaScript. HTML went from 478 KB to 167 KB (112 KB → 20 KB gzipped).
2. **~430 fewer link components to hydrate.** The 177 map links became static SVG links, and
   the 250 country-list links became plain `<a>` elements with one delegated click handler.
3. **Globe deferred to idle.** WebGL starts only after the `load` event and
   `requestIdleCallback`, so three.js parsing (the 248 KB gzipped lazy chunk) no longer competes
   with first paint or the first interaction.
4. **Smaller main bundle.** Local preference validation is hand-written, so Zod no longer ships
   to browsers; the server still uses Zod. Motion's animation and drag features are code-split
   and load after hydration.

## Globe frame-time profile (SwiftShader, continuous drag rotation)

| Scenario                            | Globe ready | Median frame      | p95 frame | Worst  | Long tasks (max) | JS heap |
| ----------------------------------- | ----------- | ----------------- | --------- | ------ | ---------------- | ------- |
| Desktop 1440×900 @2×, no throttling | 1.0 s       | 33.3 ms (~30 fps) | 33.4 ms   | 183 ms | 5 (171 ms)       | 20 MB   |
| Phone viewport, 4× CPU slowdown     | 1.3 s       | 16.7 ms (60 fps)  | 16.8 ms   | 33 ms  | 5 (125 ms)       | 22 MB   |
| Phone viewport, 6× CPU slowdown     | 1.2 s       | 16.7 ms (60 fps)  | 16.8 ms   | 33 ms  | 5 (131 ms)       | 21 MB   |

Observations:

- **Desktop is the slow case under SwiftShader** because it renders 2240×1688 pixels on the CPU.
  Phones cap DPR at 1.5 and have a far smaller canvas. The frame monitor downgrades quality when
  the median frame time stays above 34 ms, so a desktop without a GPU settles at ~30 fps rather
  than stuttering.
- **CDP CPU throttling slows the main thread, not SwiftShader** (which runs in the GPU process).
  The phone rows therefore mostly show that our JavaScript per frame is small (one raycast,
  controls update). They do not show phone GPU cost.
- **Idle cost is zero.** With render-on-demand, an idle globe scheduled 0 animation frames in a
  2 s window (verified by instrumenting `requestAnimationFrame`).
- **The remaining long tasks (125–171 ms)** come from parsing the three.js chunk and building the
  2048×1024 texture. Both now run after the page is idle. A further step would be drawing the
  texture in an `OffscreenCanvas` worker.

## Server-side budgets (see docs/operations.md for load tests)

Read API p95 targets and load-test results are recorded in the Milestone 5 section of
`docs/release-report.md`.
