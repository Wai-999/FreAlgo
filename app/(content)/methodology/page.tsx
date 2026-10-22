import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { FLAG_NAMES, FLAGS, flagEnvName, flagSnapshot } from '@/lib/flags';
import { LABEL_STATUS_INFO, ORIENTATIONS, ORIENTATION_INFO } from '@/lib/domain/orientation';
import { SECTORS } from '@/lib/domain/sectors';
import { OrientationSpectrum } from '@/components/news/orientation-spectrum';
import {
  CLUSTER_METHOD_VERSION,
  JOIN,
  JOIN_MEAN,
  MIN_SHARED,
  WINDOW_HOURS,
} from '@/lib/events/cluster';
import { PULSE_BUCKETS } from '@/lib/db/pulse';

export const metadata: Metadata = { title: 'Methodology' };

export default async function MethodologyPage() {
  // Flags are read at request time so an operator's FEATURE_* change shows without a rebuild.
  await connection();
  const flags = flagSnapshot();
  return (
    <article className="prose-body measure">
      <h1 className="text-3xl font-semibold tracking-tight">Methodology</h1>
      <p className="mt-4 text-lg text-muted">
        How sources are chosen, how outlets are labelled, how stories are tagged, and how to ask for
        a correction.
      </p>

      <h2 id="labels">Source orientation labels</h2>
      <p>
        Labels describe an <strong>outlet&apos;s general editorial orientation</strong> as assessed
        by a cited methodology on a stated review date. They do not describe the accuracy of any
        individual article, and they are never used to infer whether a story is true. An article
        from an outlet labelled “Center-Left” is not itself classified; article-level labels are a
        separate field that stays empty unless a story has been reviewed on its own.
      </p>
      <p>
        Orientation is a <em>directional spectrum</em> with five positions. Three further states are
        deliberately not points on that line:
      </p>
      <ul>
        {ORIENTATIONS.map((o) => (
          <li key={o}>
            <strong>{ORIENTATION_INFO[o].label}</strong>: {ORIENTATION_INFO[o].description}
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-sm text-muted">
          How a position is drawn (text + marker, never colour):
        </p>
        <OrientationSpectrum orientation="CENTER_LEFT" />
      </div>
      <p className="mt-4">
        Words like <em>liberal</em> and <em>conservative</em> mean different things in different
        countries, so they are stored as separate descriptive tags with the national context they
        apply to, never mapped onto the spectrum.
      </p>

      <h3>Label status and confidence</h3>
      <ul>
        {Object.entries(LABEL_STATUS_INFO).map(([k, v]) => (
          <li key={k}>
            <strong>{v.label}</strong>: {v.description}
          </li>
        ))}
      </ul>
      <p>
        Every rated label must cite a source URL and methodology; reviewed labels must carry a
        review date. Confidence (0–100%) expresses how strongly the cited evidence supports the
        label. Any label produced by an automated classifier is marked “machine-generated” and can
        never be shown as reviewed. Every change is kept in an append-only label history.
      </p>

      <h2 id="sources">Source selection</h2>
      <p>
        Sources come from a curated registry recording publisher, country, primary language, feed
        URL, usage terms and label provenance. Only official RSS/Atom feeds or licensed APIs are
        used. Real publisher feeds start paused until their terms have been reviewed. Coverage is
        uneven across countries and languages, and the interface says so wherever it applies. See
        the <Link href="/sources">source registry</Link>.
      </p>

      <h2 id="tagging">Country and sector tags</h2>
      <p>
        Tags are assigned by deterministic, versioned rules. Each tag records why it was applied,
        and each country link records what it means:
      </p>
      <ul>
        <li>
          <strong>About this country</strong>: the headline or excerpt names the country (the
          matched word is shown), or an editor tagged it. Upper-case “US” counts; the word “us” and
          “US$” amounts do not.
        </li>
        <li>
          <strong>From a feed covering this country</strong>: the publisher&apos;s feed is declared
          as covering one country (for example a national-news feed). This is an assumption from the
          feed, not evidence from the text, and is labelled as such.
        </li>
        <li>
          <strong>Publisher based here</strong>: the outlet&apos;s home country. This says nothing
          about the story, so it is <em>not</em> counted as coverage of that country. A BBC story
          about Russia counts for Russia, not the United Kingdom. Country pages can include these
          stories on request.
        </li>
        <li>
          <strong>Sectors</strong>: the publisher&apos;s own category, a feed&apos;s declared
          section, or keyword rules. Keyword rules exist for English, Portuguese, Spanish and
          French; other languages rely on categories and feed sections.
        </li>
        <li>
          <strong>Opinion and analysis</strong>: shown only when the publisher signals it (category,
          URL section such as <code>/opinion/</code>, or a headline prefix such as “Opinion:”). Most
          feeds do not say, so most stories carry no type label. FreAlgo never guesses it.
        </li>
      </ul>
      <p>
        When the rules improve, stored stories are re-tagged automatically. Each tag shows the rule
        version that produced it.
      </p>
      <p>Sectors (a story may carry several):</p>
      <ul>
        {SECTORS.map((s) => (
          <li key={s.slug}>
            <strong>{s.name}</strong>: {s.description}
          </li>
        ))}
      </ul>
      <p>Rule-based tags can be wrong. They are aids for filtering, not editorial judgements.</p>

      <h2 id="time">Time and language</h2>
      <p>
        The publisher&apos;s original timestamp is kept alongside a UTC-normalized time. When a feed
        gives no usable date, the time we first saw the story is used and marked as estimated.
        Languages are as declared by the publisher. Nothing is machine-translated.
      </p>

      <h2 id="corrections">Corrections, appeals and takedowns</h2>
      <ul>
        <li>
          <strong>Label appeals</strong>: use “Report a label issue” on any outlet in the{' '}
          <Link href="/sources">source registry</Link>. Appeals are reviewed against the cited
          methodology. While an appeal is open the label can be marked Disputed. The outcome is
          recorded in the label history.
        </li>
        <li>
          <strong>Publisher takedown</strong>: publishers may ask for their feed to be removed or
          for excerpts to be hidden. Operators pause the source and mark affected stories as
          removed. Removed stories disappear from every list and API.
        </li>
        <li>
          <strong>Factual errors in stories</strong> belong to the publisher. FreAlgo shows
          publisher updates on the next scheduled fetch.
        </li>
      </ul>

      <h2 id="discover">Discover: how things are chosen</h2>
      <ul>
        <li>
          <strong>Surprise me</strong> picks one country uniformly at random from every country with
          at least one story about it in the last 7 days (after your optional region, language and
          sector choices), sorted by ISO code. The position is SHA-256 of the seed, modulo the
          number of eligible countries. Every country has the same chance, however many stories it
          has. The seed is shown, so the same link always gives the same result.
        </li>
        <li>
          <strong>Daily discovery</strong> picks one story from those published on the latest
          complete UTC day that are about at least one country, ordered by publication time, using
          the seed “daily:&lt;date&gt;”. If no story qualifies, there is no discovery that day.
        </li>
        <li>
          Discover has no trending lists, streaks, scores or quizzes, and nothing is weighted by
          popularity or by what you read.
        </li>
      </ul>

      <h2 id="why">Why a story appears</h2>
      <p>
        Every list explains each story under “Why this story?”. It lists the filters it matches
        (with the stored evidence, such as the matched word), the ordering rule and the publication
        time. The same choices always give the same list. Your reading is never recorded or used.
      </p>

      <h2 id="events">Events: how reports are grouped</h2>
      <p>
        An event is a group of reports that FreAlgo’s grouping method (version{' '}
        {CLUSTER_METHOD_VERSION}) judged to be about the same thing. It is deterministic and uses
        only headlines and the countries their text names; there is no model, embedding or
        engagement signal.
      </p>
      <ol>
        <li>
          Each headline becomes a set of words (lower-cased, without common words and numbers) plus
          the countries its text names. A feed’s default country and where the outlet is based are
          not used.
        </li>
        <li>
          Rare words count more: each word is weighted by how few of the last 7 days’ reports in the
          same language use it.
        </li>
        <li>
          Two reports match when the weight of their shared words is at least {JOIN * 100}% of the
          shorter headline’s, they share at least {MIN_SHARED} uncommon words, they share a name (a
          country both texts name, or a capitalised word such as a person or place), and they do not
          name different countries.
        </li>
        <li>
          Reports are taken oldest first. A report joins an event whose latest report is at most{' '}
          {WINDOW_HOURS} hours away when it matches one member and its average similarity to all
          members is at least {JOIN_MEAN * 100}%; otherwise it may start an event with another
          unmatched report. Events only grow: they are never split, merged or re-ordered by size.
        </li>
        <li>
          The event is shown under the member headline most similar to the others, word for word and
          attributed to its outlet. FreAlgo writes no titles or summaries.
        </li>
      </ol>
      <p>
        <strong>Known limits.</strong> Reports in different languages are never grouped. Languages
        written without spaces (Chinese, Japanese, Thai, Burmese) are not grouped. Two different
        events with similar headlines in the same three days can be grouped together, and the same
        event can stay split when outlets word it differently. Each report in an event lists the
        words it shared and its similarity, so a wrong grouping is visible. The evaluation is in{' '}
        <code>docs/data/event-clustering-evaluation.md</code>.
      </p>

      <h2 id="perspectives">Perspectives: what is compared</h2>
      <ul>
        <li>
          Each outlet’s own headlines in the event, in order of its first report, with its
          source-level label (status, methodology, source, review date and national context). Labels
          describe outlets, never single stories.
        </li>
        <li>
          News, opinion and analysis are shown only when the publisher says so. Article-level
          framing is not classified.
        </li>
        <li>
          “Shared wording” lists words most headlines use. It is not a verified fact: FreAlgo does
          not check what outlets agree on, and it does not extract or assess claims.
        </li>
        <li>
          Coverage gaps compare the event with the outlets that had reports in FreAlgo in the last 7
          days: missing labelled orientations, unrated or disputed labels, other languages, and
          named countries with no outlet based there. A gap is a gap in FreAlgo’s sources, not proof
          that a perspective does not exist.
        </li>
      </ul>

      <h2 id="timelines">Timelines, journeys and connections</h2>
      <ul>
        <li>
          A Story Mode timeline lists the reports by publication time. Curated entries can be added
          by a named person; each needs a date (only as precise as it is known), a source link, and
          a label: fact, interpretation or analogy. Entries dated in the future appear as “next
          known dates”. FreAlgo never predicts dates.
        </li>
        <li>
          Story Journeys are curated sequences of places. Each step states its connection to the
          previous one, labels it, cites evidence and names what is uncertain. They never play by
          themselves.
        </li>
        <li>
          World Pulse shades the map by the number of reports about each country (raw counts in
          bands starting at {PULSE_BUCKETS.join(', ')}). It measures FreAlgo’s coverage, not
          importance.
        </li>
        <li>
          Country connections list countries named together in reports of the same event. That is
          the only relationship shown.
        </li>
      </ul>

      <h2 id="features">Features on this instance</h2>
      <p>
        Each FreAlgo 2.0 feature can be switched off by the operator. Features that need curated,
        sourced content or a review before launch stay off until that exists. AI-generated summaries
        are not implemented.
      </p>
      <div className="table-scroll" role="region" aria-label="Feature flags" tabIndex={0}>
        <table>
          <caption className="sr-only">Feature flags and their state</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">State</th>
              <th scope="col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {FLAG_NAMES.map((name) => {
              const def = FLAGS[name];
              const locked = 'locked' in def ? def.locked : undefined;
              return (
                <tr key={name} data-flag={name}>
                  <th scope="row">
                    <code>{flagEnvName(name)}</code>
                  </th>
                  <td>{flags[name] ? 'On' : locked ? 'Off (not available)' : 'Off'}</td>
                  <td>
                    {def.description}
                    {locked ? ` ${locked}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
