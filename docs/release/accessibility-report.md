# Accessibility report (FreAlgo 2.0)

Target: WCAG 2.2 AA. This report covers the v2 surfaces; the v1 report
(`docs/privacy-accessibility-audit.md`) still applies to unchanged pages. Automated checks are
not a conformance certification. Screen-reader and physical-device testing remain open (§4).

## 1. Automated evidence (M3)

| Check                                                   | Pages                                                                                                         | Result                        | Test                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| axe-core, WCAG 2.0/2.1/2.2 A+AA rules, serious/critical | `/stories`, `/stories?depth=original`, `/discover?seed=1`, `/my-world?country=MM` (desktop + mobile Chromium) | 0 violations                  | `tests/e2e/hybrid.spec.ts`          |
| axe on every v1 page                                    | 15 pages + admin                                                                                              | 0 violations                  | `a11y.spec.ts`, `workspace.spec.ts` |
| Reflow at 320 CSS px (WCAG 1.4.10)                      | new pages + `/discover`                                                                                       | no horizontal overflow        | `hybrid.spec.ts`                    |
| One `h1` and one `main` per page                        | 10 pages                                                                                                      | pass                          | `a11y.spec.ts`                      |
| Colour contrast of the v2 palette                       | all tokens on all surfaces                                                                                    | text ≥ 7.2:1; borders ≥ 3.5:1 | `tests/unit/design-tokens.test.ts`  |

## 2. Interaction checks

| Requirement                      | Implementation                                                                                                                                                              | Test                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Keyboard-only navigation         | Primary and "Transparency and settings" navs are labelled landmarks; the tablet "More" and phone menus are native `<details>`                                               | `hybrid.spec.ts` navigation (5 browsers)                |
| Country search by keyboard       | ArrowDown focuses the first match even straight after instant input (defect D2 fixed)                                                                                       | `hybrid.spec.ts` "ArrowDown right after instant typing" |
| Reading depth                    | Links with `aria-current`, so every depth is a real URL; quick, deep and original                                                                                           | `hybrid.spec.ts` "reading depths"                       |
| "Why this story?"                | Native `<details>`; the reasons are plain list text                                                                                                                         | `hybrid.spec.ts` "Why this story?"                      |
| Finite pages, no infinite scroll | Scrolling to the bottom loads nothing; the last page says "You are caught up"                                                                                               | `hybrid.spec.ts` (5 browsers)                           |
| Reduced motion                   | The intro is skipped entirely; it now runs 1.1 s (was 1.5 s) and can be skipped                                                                                             | `shell.spec.ts`                                         |
| Touch targets ≥ 44 × 44 px       | Nav items, pills, buttons and disclosure summaries use `min-h-11`                                                                                                           | manual review of `docs/screenshots/v2`                  |
| Works without JavaScript         | Stories, Discover (GET form with seed) and the daily archive are server-rendered. My World needs JavaScript only to read local preferences; it says so and links to Stories | `noscript` text in `/my-world`                          |

## 3. Content accessibility

- **Selection rules:** every Discover result states its method, pool size, seed and position in
  plain text.
- **Country tags:** say what the story is _about_. The publisher's home country is in the outlet
  line and is not repeated as a tag that could mislead.
- **Opinion and analysis badges:** carry a screen-reader suffix, "(labelled by the publisher)".

## 4. Not verified (needs people or devices)

- Screen-reader walkthroughs (VoiceOver iOS/macOS, NVDA, TalkBack).
- Physical low-end Android and iOS Safari.
- Burmese and right-to-left rendering on real devices. The `dir="auto"` and `lang` attributes are
  set per headline but not yet checked on devices.
