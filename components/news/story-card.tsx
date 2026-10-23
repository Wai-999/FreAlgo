import type { ArticleListItem } from '@/lib/search/articles';
import { formatPublisherLocal, formatUtc, languageName } from '@/lib/format';
import { safeHref } from '@/lib/security/safe-url';
import { Badge, FixtureBadge } from '@/components/ui/badge';
import { ExternalIcon } from '@/components/ui/icons';
import { whyReasons, type ReadingDepth, type WhyContext } from '@/lib/explore/why';
import { LocalTime } from './local-time';
import { SourceLabel } from './source-label';

const BASIS_TEXT: Record<string, string> = {
  SOURCE_COUNTRY: 'outlet is based here',
  FEED_DEFAULT: 'feed covers this country',
  TEXT_MATCH: 'mentioned in headline/excerpt',
  MANUAL: 'tagged by an editor',
  FEED_CATEGORY: "publisher's category",
  KEYWORD_RULE: 'keyword rule',
  FEED_DEFAULT_SECTOR: 'feed default',
};

const ROLE_TEXT: Record<string, string> = {
  SUBJECT: 'about this country',
  FEED_SCOPE: 'from a feed covering this country',
};

const TYPE_LABEL: Record<string, string | null> = {
  OPINION: 'Opinion',
  ANALYSIS: 'Analysis',
  NEWS: null,
  UNKNOWN: null,
};

const PAYWALL_TEXT: Record<string, string | null> = {
  NONE: null,
  UNKNOWN: null,
  METERED: 'Metered paywall',
  HARD: 'Paywall',
};

/**
 * One story. The headline links to the original publisher (new tab, no referrer). Only
 * metadata and a licensed excerpt are shown; the article itself is never copied.
 */
export function StoryCard({
  article,
  headingLevel = 3,
  depth = 'deep',
  why,
}: {
  article: ArticleListItem;
  headingLevel?: 2 | 3;
  /** Reading depth (FreAlgo 2.0): quick overview, deep context or original reporting. */
  depth?: ReadingDepth;
  /** When given, a "Why this story?" disclosure explains the story's presence and position. */
  why?: WhyContext;
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  // Publisher-local time is only informative when the feed declared a non-UTC offset.
  const local = article.publishedOffsetMinutes
    ? formatPublisherLocal(article.publishedAt, article.publishedOffsetMinutes)
    : null;
  const paywall = PAYWALL_TEXT[article.outlet.paywall];
  const typeLabel = TYPE_LABEL[article.articleType];
  // Country tags show what the story is about; where the publisher is based is already in the
  // outlet line, so publisher-home links are not repeated as tags (ADR V2-001).
  const aboutCountries = article.countries.filter((c) => c.role !== 'PUBLISHER_HOME');
  const lang = article.language ?? undefined;
  const deep = depth === 'deep';
  const href = safeHref(article.url) ?? undefined;
  return (
    <article
      aria-labelledby={`story-${article.id}`}
      className="border-b border-border py-5 first:pt-2"
      data-testid="story-card"
      data-depth={depth}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span className="font-medium text-text">{article.outlet.name}</span>
        {article.author ? <span>· by {article.author.slice(0, 80)}</span> : null}
        {article.outlet.country ? <span>· {article.outlet.country.name}</span> : null}
        <span>· {languageName(article.language)}</span>
        {article.isFixture ? <FixtureBadge /> : null}
        {typeLabel ? (
          <Badge title={`Labelled by the publisher (${article.articleTypeBasis ?? 'signal'})`}>
            {typeLabel}
            <span className="sr-only"> (labelled by the publisher)</span>
          </Badge>
        ) : null}
        {paywall ? <Badge>{paywall}</Badge> : null}
      </p>
      <H
        id={`story-${article.id}`}
        className="mt-1 text-lg leading-snug font-semibold"
        lang={lang}
        dir="auto"
      >
        <a
          href={safeHref(article.url) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="text-text decoration-muted/60 underline-offset-4 hover:underline"
        >
          {article.title}
          <span className="sr-only"> (opens {article.outlet.name} in a new tab)</span>
          <ExternalIcon className="ml-1 inline-block size-4 align-baseline text-muted" />
        </a>
      </H>
      <p className="mt-1 text-sm text-muted">
        <time dateTime={article.publishedAt}>{formatUtc(article.publishedAt)}</time>
        {local ? <span> · publisher time {local}</span> : null}
        <LocalTime iso={article.publishedAt} />
        {article.publishedAtEstimated ? (
          <span> · time estimated (the feed gave no date)</span>
        ) : null}
      </p>
      {depth === 'quick' ? null : article.excerpt ? (
        <p className="measure mt-2 text-base text-text/90" lang={lang} dir="auto">
          {article.excerpt}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Headline only: the publisher&apos;s terms do not cover excerpts here.
        </p>
      )}
      {depth === 'original' && href ? (
        <p className="mt-3">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-4 text-sm font-medium text-text no-underline hover:border-accent"
            data-testid="original-link"
          >
            Read the original report at {article.outlet.name}
            <ExternalIcon className="size-4 text-muted" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      ) : null}
      {deep && (article.sectors.length || aboutCountries.length) ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
          {article.sectors.map((s) => (
            <li key={s.slug}>
              <Badge
                title={`Sector tag: ${BASIS_TEXT[s.basis] ?? s.basis}${s.ruleId ? ` (${s.ruleId})` : ''}`}
              >
                {s.name}
              </Badge>
            </li>
          ))}
          {aboutCountries.map((c) => (
            <li key={c.iso2}>
              <Badge
                title={`Country: ${ROLE_TEXT[c.role] ?? c.role} (${BASIS_TEXT[c.basis] ?? c.basis}${c.matchedTerm ? `, matched "${c.matchedTerm}"` : ''})`}
              >
                {c.name}
                <span className="sr-only">: {ROLE_TEXT[c.role] ?? c.role}</span>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 space-y-1">
        <SourceLabel
          compact
          outletName={article.outlet.name}
          label={{
            orientation: article.outlet.label.orientation,
            labelStatus: article.outlet.label.status,
            labelConfidence: article.outlet.label.confidence,
            ideologyTags: article.outlet.label.ideologyTags,
            labelMethodology: article.outlet.label.methodology,
            labelSourceUrl: article.outlet.label.sourceUrl,
            labelReviewedAt: article.outlet.label.reviewedAt,
            labelContext: article.outlet.label.context,
            labelIsMachine: article.outlet.label.isMachine,
          }}
        />
        {deep ? (
          <p className="px-1 text-xs text-muted">
            Story-level label:{' '}
            {article.articleLabel
              ? `${article.articleLabel.orientation} (${article.articleLabel.note ?? 'reviewed'})`
              : 'not classified'}
          </p>
        ) : null}
      </div>
      {why ? (
        <details className="mt-2 text-sm" data-testid="why-this-story">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted hover:text-text">
            Why this story?
          </summary>
          <ul className="measure mt-1 list-disc space-y-1 pl-5 text-muted">
            {whyReasons(article, why).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
