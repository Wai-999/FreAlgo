# Privacy and accessibility audit (Milestone 5)

Audited on 2026-10-20 against the code at the release commit. It combines a code review, automated
tests (cited), and manual checks in Chromium, Firefox and WebKit through Playwright. It is not a
legal opinion or a formal WCAG conformance certification; both remain next actions before a
public launch.

## Part A: Privacy

### Data inventory

| Data                                                                                           | Where                                             | Who                                                    | Retention                                                           | Purpose / legal basis                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader preferences (countries, outlets, sectors, orientations, languages, sort, motion, globe) | Browser `localStorage` key `frealgo:prefs:v1`     | Every reader, by choice                                | Until the reader clears it (Settings → "Clear browser preferences") | Explicit, user-set personalisation; never leaves the device unless the reader signs in and saves                                                                                                               |
| UI flags (`frealgo:focus-sheet`, `frealgo:evt:*`)                                              | Browser `sessionStorage`                          | Every reader                                           | Tab session                                                         | Focus management; one-health-event-per-session dedupe                                                                                                                                                          |
| Session cookie `frealgo_session` (`__Host-` on https)                                          | Browser                                           | Signed-in users only                                   | 30 days                                                             | Strictly necessary for sign-in. HttpOnly, SameSite=Lax, Secure on https. Holds an opaque user id and expiry only                                                                                               |
| OIDC transient cookie                                                                          | Browser                                           | During sign-in only                                    | 10 minutes                                                          | Strictly necessary (PKCE verifier, state, nonce)                                                                                                                                                               |
| Server-side preferences (`UserPreference`)                                                     | Postgres                                          | Signed-in users who press "Save to account"            | Until deleted                                                       | Contract / consent. The user id is a hash of issuer + subject: no email, name or profile is stored                                                                                                             |
| Label appeal contact email (optional)                                                          | Postgres                                          | People who appeal a label and choose to leave an email | Purged 30 days after resolution (daily job)                         | Legitimate interest: replying to the appeal                                                                                                                                                                    |
| Client health counters                                                                         | Postgres `ClientEventCounter` (day, event, count) | Aggregated                                             | 400 days                                                            | Legitimate interest: knowing how often the 3D globe fails. No ids, IPs, user agents or URLs. Not sent with Global Privacy Control or Do Not Track; operators can disable it (`CLIENT_TELEMETRY_ENABLED=false`) |
| Rate-limit windows                                                                             | Redis                                             | All API clients                                        | Window length (≤ 1 h)                                               | Abuse prevention. Keys are a salted, daily-rotating hash of the address; raw IPs are never stored                                                                                                              |
| Request logs                                                                                   | stdout (pino)                                     | All requests                                           | Operator log retention (recommended 30 days)                        | Operations. Method, route, status, duration and request id only; **no IPs, cookies, query strings with personal data, or bodies**                                                                              |
| Admin audit log                                                                                | Postgres                                          | Admin actions                                          | 4 × `RETENTION_DAYS` (360 days)                                     | Accountability for editorial changes                                                                                                                                                                           |

### Findings

- **No tracking.** There are no third-party scripts, fonts, analytics, ads, pixels or CDNs; the
  CSP enforces this (`default-src 'self'`). No fingerprinting and no behavioural data: ordering is
  never personalised from behaviour (ADR-004).
- **No consent banner needed** for anonymous readers: they get no cookies at all. The only cookies
  are strictly necessary ones set at sign-in. _Review this if analytics or embeds are ever added._
- **Outbound links** to publishers use `rel="noopener noreferrer"`, so publishers do not learn
  which FreAlgo page a reader came from. No article images are hotlinked, which would leak
  reader IPs to publishers.
- **Data subject rights** (GDPR Art. 15, 17, 20; CCPA):
  - Access and portability: `GET /api/v1/me/preferences` returns the stored record as JSON.
  - Deletion: `DELETE /api/v1/me/preferences`, or Settings → "Delete server copy".
  - Anonymous preferences never reach the server.
  - Appeal emails are purged automatically 30 days after resolution.
- **Disclosure:** `/privacy` describes all of the above in plain language.
- **Gaps and next actions:**
  1. A legal review of the privacy notice for the operator's jurisdiction, with a named
     controller and contact (external gate: an operator identity).
  2. If OIDC is enabled, document the identity provider as a processor.
  3. Set log retention at the hosting provider (the recipe uses Docker log rotation of 5 × 20 MB
     per service).

## Part B: Accessibility (target WCAG 2.2 AA)

### Automated evidence

- **axe-core (WCAG 2.0/2.1/2.2 A and AA rule sets):** zero serious or critical violations on
  every page, on desktop and mobile Chromium:
  - Explore: welcome intro settled, list and map, country sheet with filters, no-coverage
    country, outlet filter.
  - Search: with and without results.
  - Sources: registry and detail page.
  - Status, Settings, Methodology, About, Privacy, Account and the admin console.

  See `tests/e2e/a11y.spec.ts` and `tests/e2e/workspace.spec.ts`.

- **Lighthouse accessibility score:** 100 on home, country sheet and search (`docs/performance.md`).
- **Design-token contrast:** unit test asserts ≥ 4.5:1 for text tokens and ≥ 3:1 for UI and
  borders (`tests/unit/design-tokens.test.ts`).

### Manual checks (with the e2e test that guards each)

| Requirement                                                                                                                       | Result                                                                  | Guarded by                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Keyboard-only use of every feature, including choosing a country without the map (list with type-ahead)                           | Pass                                                                    | `workspace.spec.ts` "keyboard: pick a country…" (all engines)                       |
| Globe keyboard alternative: arrows rotate, +/- zoom, Enter opens the country at the centre, with live announcements               | Pass                                                                    | `globe.spec.ts`                                                                     |
| Dialog behaviour on mobile: focus trap, `inert` background, Escape closes, focus returns to the trigger                           | Pass                                                                    | `workspace.spec.ts` (mobile projects)                                               |
| Desktop sheet is a non-modal region and does not trap focus                                                                       | Pass                                                                    | `workspace.spec.ts`                                                                 |
| Visible focus indicators on all interactive elements                                                                              | Pass                                                                    | global 3 px `:focus-visible` outline in `app/globals.css`; manual review            |
| Reduced motion: intro skipped; sheet, globe and transitions use no motion                                                         | Pass                                                                    | `shell.spec.ts` "@cross" with `reducedMotion: 'reduce'`, plus the Settings override |
| No autoplay, no infinite scroll; finite pagination with "You are caught up"                                                       | Pass                                                                    | `workspace.spec.ts` pagination tests                                                |
| Semantic structure: exactly one `h1` and one `main` landmark per page                                                             | Pass (10 pages)                                                         | `a11y.spec.ts` "every page has exactly one h1…"; axe landmark rules                 |
| Live regions announce result counts and globe selection once, without repeating on every frame                                    | Pass                                                                    | `globe.spec.ts`, `workspace.spec.ts`                                                |
| Text-only fallbacks: works without JavaScript (links and GET forms) and without WebGL (2D map and list)                           | Pass                                                                    | `shell.spec.ts` no-JS tests; WebGL-unavailable tests on all engines                 |
| Target size ≥ 24 × 24 CSS px (WCAG 2.5.8)                                                                                         | Pass for controls; small map regions have list equivalents              | axe `target-size` (part of the `wcag22aa` rule set)                                 |
| Reflow at 320 CSS px without horizontal scrolling (WCAG 1.4.10)                                                                   | **Failed on Settings (115 px overflow); fixed**; now passes on 10 pages | `a11y.spec.ts` "reflows at 320 CSS px…"                                             |
| Colour is never the only signal: orientation is a marker position plus a text label, with no red/blue scale; links are underlined | Pass                                                                    | `orientation-spectrum.tsx` review; axe `link-in-text-block`                         |

### Findings fixed during this audit

- **Settings did not reflow at 320 px.** Browsers give `<fieldset>` `min-inline-size:
min-content`, so a select listing long country names made the page 115 px too wide. Fixed in
  `app/globals.css` for every fieldset and select; guarded by the reflow test.
- The axe sweep first flagged the welcome intro's tagline. It was sampled mid-fade (opacity
  below 1); the intro is decorative, `aria-hidden` and gone after 1.5 s. Settled-state contrast
  passes, and reduced-motion users never see the intro.

### Known gaps

- **Screen-reader testing with real assistive technology** (VoiceOver on iOS and macOS, NVDA,
  TalkBack) has not been done; automated checks cannot replace it. This is listed as a next
  action, together with physical-device testing.
- **Very small countries on the 2D map** are tiny targets. The country list and search are the
  accessible equivalent, and the map says so. This is by design, not a defect, but worth user
  testing.
- **Dark theme only.** Contrast is verified for it. A light theme would need its own token audit.
