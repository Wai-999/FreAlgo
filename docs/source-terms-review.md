# Publisher terms review (go-live)

Prepared 2026-10-21 (UTC) for the operator's activation decision. For each registered real
outlet, this records what its own published terms say about reusing RSS feeds, measured against
what FreAlgo does:

- a public, non-commercial, ad-free website;
- stores and shows the headline, a short text excerpt and the publication date;
- always links to the original and credits the outlet by name;
- no images, no full text.

This is a summary of public terms pages, **not legal advice**. Terms change. Activating a feed is
the operator's decision, recorded with `npm run sources:activate -- --slug … --reviewer … --notes …`.

## A. Terms permit this use: candidates to activate

| Outlet                                | What the terms say (paraphrased)                                                                                                                           | Conditions FreAlgo must keep                                                                                                                                                                                                                                                                                      | Source                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **NPR** (`npr`)                       | Content feeds (headlines, summaries, links) may be displayed, excerpted and linked on _your personal site or application_ for personal non-commercial use  | Don't add to, delete or alter headlines, text or links; don't imply NPR endorses anything; no commercial use. FreAlgo shows headlines unaltered and excerpts within the permitted "excerpt from"                                                                                                                  | [NPR Terms of Use, "Content Feeds"](https://www.npr.org/about-npr/179876898/terms-of-use#ContentFeeds) |
| **BBC News** (`bbc-news`)             | You can add the BBC News RSS feed to your website, provided you don't change it or remove BBC branding; business use needs permission (and possibly a fee) | Keep headlines and links unchanged and credit "BBC News"; no BBC logos; non-commercial only. **Ambiguity:** the same page forbids "plucking metadata" from BBC content or feeds. This most likely targets harvesting (e.g. for datasets), but an aggregator that stores items could be read as covered. Your call | [Using the BBC: Terms of Use](https://www.bbc.co.uk/usingthebbc/terms-of-use/)                         |
| **Agência Brasil** (`agencia-brasil`) | EBC's portal terms authorise reproduction when the source is credited                                                                                      | Credit "Agência Brasil" (FreAlgo always shows the outlet name and links to the original)                                                                                                                                                                                                                          | [EBC: Termos de uso](https://www.ebc.com.br/termos-de-uso-e-condicoes-gerais-do-portal-da-ebc)         |

## B. Unclear: no published conditions for website display

| Outlet                      | Finding                                                                                                                                                                  | Suggestion                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **CBC News** (`cbc-news`)   | Offers a "Free Headlines Service" for personal websites, powered by its RSS feeds; commercial use needs a request. There are no published conditions for direct feed use | Email CBC (via the [RSS page](https://www.cbc.ca/rss/usingrss/)) or use only if you accept the ambiguity |
| **The Hindu** (`the-hindu`) | Allows personal and academic non-commercial dissemination and hyperlinks, but prohibits caching and framing ([terms](https://www.thehindugroup.com/termsofuse.html))     | Storing headlines may count as caching. Ask first                                                        |
| **CNA** (`cna`)             | RSS is free for personal, non-commercial use in a news reader; website display isn't addressed ([RSS page](https://www.channelnewsasia.com/rss))                         | Ask first                                                                                                |

## C. Terms restrict reuse: keep paused unless the publisher gives permission

| Outlet                        | Finding (paraphrased)                                                                                                                                                                          | Source                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The Guardian                  | Personal, non-commercial use only; any other use needs prior written approval; aggregators are licensed via the NLA. _Alternative:_ the Guardian Open Platform API has its own developer terms | [Terms of service](https://www.theguardian.com/help/terms-of-service)                       |
| Al Jazeera English            | Personal, non-commercial use only                                                                                                                                                              | [Terms and conditions](https://www.aljazeera.com/terms-and-conditions/)                     |
| ABC News (Australia)          | Personal, non-commercial use; no reproducing or republishing without written permission                                                                                                        | [ABC Terms of Use](https://help.abc.net.au/hc/en-us/articles/360001548096-ABC-Terms-of-Use) |
| RNZ                           | Feeds are for personal use only and **must not be used to aggregate content on other websites**                                                                                                | [RNZ legal](https://www.rnz.co.nz/about/legal)                                              |
| Myanmar Now                   | No reproduction or distribution unless expressly permitted. _Important for Myanmar coverage: worth asking them_                                                                                | [Terms](https://myanmar-now.org/en/terms-of-use-for-digital-subscription-myanmar-now-ltd/)  |
| The Straits Times (SPH Media) | No reproduction or display on another website without permission                                                                                                                               | [SPH website terms](https://www.sph.com.sg/tnc/website)                                     |
| Africanews (Euronews)         | Personal use only; no republication without express permission                                                                                                                                 | [Euronews terms](https://www.euronews.com/terms-and-conditions)                             |
| South China Morning Post      | Personal, non-commercial use only                                                                                                                                                              | [Terms](https://www.scmp.com/terms-conditions)                                              |
| Dawn                          | Personal, non-commercial use; any other use needs prior written permission                                                                                                                     | [Terms](https://www.dawn.com/terms/)                                                        |
| tagesschau (ARD)              | Private, non-commercial use only; publication is not permitted (except content explicitly under a CC licence); platforms register via the ARD Publishing Portal                                | [RSS-Feeds](https://www.tagesschau.de/infoservices/rssfeeds)                                |
| El País                       | All rights reserved; no feed licence published                                                                                                                                                 | [Aviso legal](https://elpais.com/info/aviso-legal/)                                         |

## D. Not yet reviewed (terms page blocked to automated fetching or rendered by JavaScript)

DW English, France 24, Le Monde, The Japan Times, NHK, La Jornada, Buenos Aires Times, Meduza
(English), and Premium Times. Review these in a browser before deciding.

Premium Times' homepage also currently carries unrelated casino links ("Casino Sin Licencia
España" and similar). This suggests link spam or a compromised site, so review the source's
quality, not just its terms.

## Recommendation

Activate group A (NPR, BBC News, Agência Brasil) if you accept their stated conditions, including
the BBC ambiguity noted above. Keep everything else paused. To widen coverage, email the group B
and C publishers you care most about (e.g. Myanmar Now, CBC) and record their answers in the
activation notes. Coverage will be thin at launch: three outlets (UK, US and Brazil), plus
text-matched mentions of other countries. Every country page says so.

## Decision (2026-10-21)

The site owner, Wai Yan Hein, reviewed this summary and approved **NPR, BBC News and Agência
Brasil** for activation, accepting the BBC metadata-clause ambiguity. Every other feed stays
paused. The decision, with per-outlet notes and terms URLs, is recorded in
[`deploy/source-activations.json`](../deploy/source-activations.json). Production applies it with:

```bash
node --import tsx scripts/activate-sources.ts --from deploy/source-activations.json
```

The command is idempotent and writes an `AdminAuditLog` entry per feed. The four feeds were
dry-run verified (fetched and parsed, nothing stored) on 2026-10-21.
