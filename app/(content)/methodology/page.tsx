import type { Metadata } from 'next';
import Link from 'next/link';
import { LABEL_STATUS_INFO, ORIENTATIONS, ORIENTATION_INFO } from '@/lib/domain/orientation';
import { SECTORS } from '@/lib/domain/sectors';
import { OrientationSpectrum } from '@/components/news/orientation-spectrum';

export const metadata: Metadata = { title: 'Methodology' };

export default function MethodologyPage() {
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
        Tags are assigned by deterministic, versioned rules, and each tag records why it was
        applied:
      </p>
      <ul>
        <li>
          <strong>Source country</strong>: the outlet is based in that country.
        </li>
        <li>
          <strong>Feed default</strong>: the feed is a country- or topic-specific section.
        </li>
        <li>
          <strong>Text match</strong>: a country name appears in the headline or excerpt.
        </li>
        <li>
          <strong>Keyword rule</strong> / <strong>feed category</strong>: sector vocabulary or the
          publisher&apos;s own category matched.
        </li>
      </ul>
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
    </article>
  );
}
