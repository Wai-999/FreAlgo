import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CuratedKind } from '@/components/events/curated-kind';
import { StoryCard } from '@/components/news/story-card';
import { FixtureBadge } from '@/components/ui/badge';
import { ExternalIcon } from '@/components/ui/icons';
import { getPrisma } from '@/lib/db/client';
import { getEvent, type EventDetail } from '@/lib/db/events';
import { CLUSTER_METHOD_VERSION, WINDOW_HOURS } from '@/lib/events/cluster';
import { getEnv } from '@/lib/env';
import { isEnabled } from '@/lib/flags';
import { formatPrecise, formatUtc, languageName } from '@/lib/format';
import { safeHref } from '@/lib/security/safe-url';

type Params = Promise<{ event: string }>;

async function load(slug: string) {
  if (!isEnabled('stories') || !isEnabled('eventClustering')) return null;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  return getEvent(getPrisma(), slug, { includeFixtures: getEnv().SHOW_FIXTURES });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const detail = await load((await params).event);
  if (!detail) return { title: 'Event not found' };
  return {
    title: detail.event.title,
    description: `${detail.event.reports} reports from ${detail.event.outlets} outlets, grouped by shared headline wording.`,
  };
}

const stripRules = (term: string) => term.replace(/\s*\(rules v\d+\)$/, '');

/** What FreAlgo cannot tell from the evidence, stated plainly (spec §3 Story Mode). */
function uncertainties(d: EventDetail): string[] {
  const { event, members } = d;
  const out = [
    'The grouping is automatic: a report here may be about a related but different event. Each report below shows the words it shared.',
  ];
  if (event.outlets === 1)
    out.push(
      `Every report is from one outlet, ${event.outletNames[0]}. No other outlet in FreAlgo’s sources is grouped here.`,
    );
  const argued = members.filter((m) => m.articleType === 'OPINION' || m.articleType === 'ANALYSIS');
  if (argued.length)
    out.push(
      `${argued.length} of ${members.length} pieces are opinion or analysis, as labelled by their publishers.`,
    );
  const unknown = members.filter((m) => m.articleType === 'UNKNOWN').length;
  if (unknown)
    out.push(
      `${unknown} of ${members.length} reports carry no publisher signal of whether they are news, opinion or analysis.`,
    );
  const estimated = members.filter((m) => m.publishedAtEstimated).length;
  if (estimated)
    out.push(
      `${estimated} reports had no publication time in their feed; FreAlgo shows the time it first saw them.`,
    );
  out.push(
    `Only reports in ${languageName(event.language)} are grouped here; coverage in other languages is not shown.`,
    'FreAlgo does not verify facts or assess claims. Read the original reports for what each outlet says.',
  );
  return out;
}

const SECTIONS = [
  ['what-happened', 'What happened?'],
  ['where', 'Where?'],
  ['why-it-matters', 'Why does it matter?'],
  ['what-sources-report', 'What do sources report?'],
  ['uncertain', 'What remains uncertain?'],
  ['timeline', 'Timeline'],
  ['next-dates', 'Next known dates'],
] as const;

/**
 * Story Mode (FreAlgo 2.0, spec §3): one event, answered only from stored evidence. Every
 * statement is either a publisher's own headline (attributed and linked), a count FreAlgo can
 * verify from its data, or a curated entry with a named source. Nothing is generated.
 */
export default async function StoryModePage({ params }: { params: Params }) {
  const detail = await load((await params).event);
  if (!detail) notFound();
  const { event, members } = detail;
  const timelines = isEnabled('timelines');
  const comparable = isEnabled('perspectives') && event.outlets >= 2;

  const named = new Map<string, { name: string; terms: Set<string>; reports: number }>();
  for (const m of members)
    for (const c of m.countries.filter((x) => x.role === 'SUBJECT')) {
      const e = named.get(c.iso2) ?? { name: c.name, terms: new Set<string>(), reports: 0 };
      e.reports += 1;
      if (c.matchedTerm) e.terms.add(stripRules(c.matchedTerm));
      named.set(c.iso2, e);
    }
  const homes = [
    ...new Set(members.map((m) => m.outlet.country?.name).filter((x): x is string => !!x)),
  ];
  const argued = members.filter((m) => m.articleType === 'OPINION' || m.articleType === 'ANALYSIS');
  const interpretations = detail.timeline.filter((t) => t.kind === 'INTERPRETATION');
  const byId = new Map(members.map((m) => [m.id, m]));
  const timeline = [
    ...members.map((m) => ({
      key: m.id,
      at: m.publishedAt,
      when: formatUtc(m.publishedAt),
      report: m,
      curated: null,
    })),
    ...(timelines ? detail.timeline : []).map((t) => ({
      key: t.id,
      at: t.occurredAt,
      when: formatPrecise(t.occurredAt, t.datePrecision),
      report: null,
      curated: t,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.key < b.key ? -1 : 1));

  return (
    <article>
      <p className="text-sm text-muted">
        <Link href="/stories">Stories</Link> <span aria-hidden="true">›</span>{' '}
        <Link href="/stories/events">Events</Link> <span aria-hidden="true">›</span> Story Mode
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
      <p className="measure mt-2 text-muted">
        Headline as published{event.titleOutlet ? ` by ${event.titleOutlet}` : ''}. FreAlgo grouped{' '}
        {event.reports} reports from {event.outlets} {event.outlets === 1 ? 'outlet' : 'outlets'}{' '}
        because their headlines share wording. It does not write summaries: everything below is the
        publishers’ own words, counts from FreAlgo’s data, or curated entries with a named source.
      </p>
      {event.isFixture ? (
        <p className="mt-2">
          <FixtureBadge />
        </p>
      ) : null}
      <nav aria-label="In this story" className="mt-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SECTIONS.filter(([id]) => timelines || (id !== 'timeline' && id !== 'next-dates')).map(
            ([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ),
          )}
          {comparable ? (
            <li>
              <Link href={`/perspectives/${event.slug}`}>Compare outlets</Link>
            </li>
          ) : null}
        </ul>
      </nav>

      <section aria-labelledby="what-happened" className="mt-8">
        <h2 id="what-happened" className="text-xl font-semibold">
          What happened?
        </h2>
        <p className="measure mt-1 text-sm text-muted">
          The publishers’ own headlines, in order of publication. FreAlgo has not checked them
          against each other.
        </p>
        <ol className="mt-3 space-y-2" data-testid="headlines">
          {members.map((m) => {
            const href = safeHref(m.url);
            return (
              <li key={m.id} className="measure">
                <span className="text-sm text-muted">
                  <time dateTime={m.publishedAt}>{formatUtc(m.publishedAt)}</time> · {m.outlet.name}
                  :
                </span>{' '}
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {m.title}
                    <ExternalIcon className="ml-1 inline-block size-4 align-baseline text-muted" />
                    <span className="sr-only"> (opens the original in a new tab)</span>
                  </a>
                ) : (
                  m.title
                )}
              </li>
            );
          })}
        </ol>
        {event.sharedTerms.length ? (
          <p className="mt-3 text-sm" data-testid="shared-wording">
            <span className="text-muted">Shared wording (not verified facts): </span>
            {event.sharedTerms.join(', ')}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="where" className="mt-8">
        <h2 id="where" className="text-xl font-semibold">
          Where?
        </h2>
        {named.size ? (
          <ul className="mt-2 space-y-1 text-sm">
            {[...named].map(([iso2, c]) => (
              <li key={iso2}>
                <Link href={`/?country=${iso2}`}>{c.name}</Link>: named in {c.reports} of{' '}
                {members.length} reports
                {c.terms.size ? ` (as “${[...c.terms].join('”, “')}”)` : ''}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No report names a country in its headline or excerpt, so FreAlgo does not say where this
            happened.
          </p>
        )}
        {homes.length ? (
          <p className="mt-2 text-sm text-muted">
            Where the outlets are based (not where the event happened): {homes.join(', ')}.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="why-it-matters" className="mt-8">
        <h2 id="why-it-matters" className="text-xl font-semibold">
          Why does it matter?
        </h2>
        <p className="measure mt-2 text-sm text-muted">
          FreAlgo does not decide why a story matters or how important it is.
        </p>
        {argued.length ? (
          <>
            <p className="mt-2 text-sm">Pieces their publishers label as opinion or analysis:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {argued.map((m) => (
                <li key={m.id}>
                  {m.title}{' '}
                  <span className="text-muted">
                    ({m.articleType === 'OPINION' ? 'opinion' : 'analysis'}, {m.outlet.name})
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {timelines && interpretations.length ? (
          <>
            <p className="mt-3 text-sm">Curated context, attributed to its source:</p>
            <ul className="mt-1 space-y-2 text-sm">
              {interpretations.map((t) => (
                <li key={t.id}>
                  <CuratedKind kind={t.kind} /> {t.text}{' '}
                  <a href={safeHref(t.sourceUrl) ?? undefined} rel="noopener noreferrer">
                    {t.sourceName}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {!argued.length && !(timelines && interpretations.length) ? (
          <p className="mt-2 text-sm text-muted">
            No opinion or analysis pieces and no curated context are attached to this event.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="what-sources-report" className="mt-8">
        <h2 id="what-sources-report" className="text-xl font-semibold">
          What do sources report?
        </h2>
        <p className="measure mt-1 text-sm text-muted">
          Every report in the event, oldest first, with its outlet label and why it was grouped
          here.{' '}
          {comparable ? (
            <Link href={`/perspectives/${event.slug}`}>Compare the outlets side by side</Link>
          ) : null}
        </p>
        <div data-testid="event-reports">
          {members.map((m) => {
            const matched = m.membership.matchedArticleId
              ? byId.get(m.membership.matchedArticleId)
              : undefined;
            return (
              <StoryCard
                key={m.id}
                article={m}
                why={{
                  query: {},
                  sort: 'oldest',
                  reasons: [
                    `Grouped into this event because its headline shares “${m.membership.sharedTerms.join('”, “')}”${
                      matched ? ` with “${matched.title}” (${matched.outlet.name})` : ''
                    }; similarity ${m.membership.score.toFixed(2)} on a 0–1 scale.`,
                  ],
                }}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="uncertain" className="mt-8">
        <h2 id="uncertain" className="text-xl font-semibold">
          What remains uncertain?
        </h2>
        <ul className="measure mt-2 list-disc space-y-1 pl-5 text-sm" data-testid="uncertainties">
          {uncertainties(detail).map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </section>

      {timelines ? (
        <>
          <section aria-labelledby="timeline" className="mt-8">
            <h2 id="timeline" className="text-xl font-semibold">
              Timeline
            </h2>
            <p className="measure mt-1 text-sm text-muted">
              Reports by publication time, plus curated entries. Curated entries say whether they
              are a fact, an interpretation or an analogy, and cite a source.
            </p>
            <ol className="mt-3 border-l border-border pl-4" data-testid="timeline">
              {timeline.map((t) => (
                <li key={t.key} className="relative py-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="absolute top-3.5 -left-[21px] size-2 rounded-full bg-border-strong"
                  />
                  <span className="text-muted">
                    <time dateTime={t.at}>{t.when}</time>
                  </span>{' '}
                  {t.report ? (
                    <>
                      <span className="text-muted">Report ·</span> {t.report.outlet.name}: “
                      {t.report.title}”
                    </>
                  ) : t.curated ? (
                    <>
                      <CuratedKind kind={t.curated.kind} /> {t.curated.text}{' '}
                      <span className="text-muted">
                        Source:{' '}
                        <a
                          href={safeHref(t.curated.sourceUrl) ?? undefined}
                          rel="noopener noreferrer"
                        >
                          {t.curated.sourceName}
                        </a>
                        ; curated by {t.curated.curatedBy}.
                      </span>
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="next-dates" className="mt-8">
            <h2 id="next-dates" className="text-xl font-semibold">
              Next known dates
            </h2>
            {detail.upcoming.length ? (
              <ul className="mt-2 space-y-2 text-sm" data-testid="next-dates">
                {detail.upcoming.map((t) => (
                  <li key={t.id}>
                    <time dateTime={t.occurredAt}>
                      {formatPrecise(t.occurredAt, t.datePrecision)}
                    </time>{' '}
                    <CuratedKind kind={t.kind} /> {t.text}{' '}
                    <span className="text-muted">
                      Source:{' '}
                      <a href={safeHref(t.sourceUrl) ?? undefined} rel="noopener noreferrer">
                        {t.sourceName}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                No upcoming dates have been curated for this event. FreAlgo does not predict dates.
              </p>
            )}
          </section>
        </>
      ) : null}

      <p className="mt-10 border-t border-border pt-4 text-sm text-muted">
        Grouping method v{CLUSTER_METHOD_VERSION}: reports in the same language whose headlines
        share distinctive words within {WINDOW_HOURS} hours.{' '}
        <Link href="/methodology#events">How events are formed and where the method fails</Link>.
      </p>
    </article>
  );
}
