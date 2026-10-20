import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <article className="prose-body measure">
      <h1 className="text-3xl font-semibold tracking-tight">About FreAlgo</h1>
      <p className="mt-4 text-lg text-muted">
        A personal, finite news utility. Not a feed, not a social network.
      </p>

      <h2>What it does</h2>
      <ul>
        <li>Lists headlines from a curated registry of publisher RSS/Atom feeds, by country.</li>
        <li>
          Lets you filter by country, region, outlet, sector, language, period and source
          orientation, and sort newest-first, oldest-first or by outlet name.
        </li>
        <li>Always links to the original publisher. Full articles are never copied.</li>
        <li>Shows where coverage is missing, stale, paywalled or limited to some languages.</li>
      </ul>

      <h2>What it will never do</h2>
      <ul>
        <li>Show advertising or affiliate placements.</li>
        <li>Rank stories by engagement, popularity or a hidden personal profile.</li>
        <li>Autoplay media, scroll endlessly or send notification badges.</li>
        <li>Track you across sites or build behavioural profiles.</li>
        <li>Generate or rewrite news content.</li>
      </ul>

      <h2>How ordering works</h2>
      <p>
        Lists are ordered only by the rule you pick: publication time (newest or oldest first) or
        outlet name. When you type a search, you can additionally sort by text relevance, which
        measures how closely the headline and excerpt match your words. Relevance is never a
        political, popularity or engagement score.
      </p>

      <h2>Fetch schedule</h2>
      <p>
        A background worker attempts to fetch each active feed every 3 hours. An attempt is not a
        guarantee of new stories; the <Link href="/status">freshness page</Link> shows the last
        attempt and last successful sync for every source.
      </p>

      <h2 id="attribution">Attribution</h2>
      <ul>
        <li>
          Country boundaries: Natural Earth 1:110m (public domain), packaged by world-atlas (ISC).
        </li>
        <li>
          Country codes and names: ISO 3166-1 via i18n-iso-countries (MIT); regions and official
          languages: Unicode CLDR (Unicode License v3).
        </li>
        <li>Headlines and excerpts belong to their publishers and link back to the source.</li>
      </ul>

      <h2 id="crawler">Feed reader identification</h2>
      <p>
        The worker identifies itself with a descriptive User-Agent, honours HTTP caching
        (ETag/If-Modified-Since), limits requests per host and never bypasses paywalls or access
        controls. Publishers can request removal; see{' '}
        <Link href="/methodology#corrections">corrections &amp; takedowns</Link>.
      </p>
    </article>
  );
}
