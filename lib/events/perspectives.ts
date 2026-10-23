import type { CorpusOutlet, EventDetail, EventMember, EventSummary } from '@/lib/db/events';
import { ORIENTATION_INFO, isPositional, type Orientation } from '@/lib/domain/orientation';
import { languageName } from '@/lib/format';
import { terms } from './cluster';

/**
 * Perspective Explorer (FreAlgo 2.0, M4): side-by-side coverage of one event by each outlet.
 *
 * Built only from stored evidence: the outlets' own headlines, their source-level labels with
 * provenance, and the publisher-declared kind of piece. FreAlgo does not verify facts, extract
 * claims or judge framing, so the page says so instead of filling those sections in. Gaps are
 * computed against FreAlgo's own corpus (outlets with reports in the last 7 days), never the
 * world.
 */

export interface OutletColumn {
  outlet: EventMember['outlet'];
  reports: EventMember[];
  /** Headline words this outlet used and no other outlet in the event used. */
  distinctWording: string[];
  types: { NEWS: number; OPINION: number; ANALYSIS: number; UNKNOWN: number };
}

export interface CoverageGap {
  kind: 'single-outlet' | 'orientation' | 'unrated' | 'disputed' | 'language' | 'publisher-country';
  message: string;
}

export interface Perspectives {
  event: EventSummary;
  /** Words used by at least half of the reports. Shared wording, not verified facts. */
  sharedWording: string[];
  /** One column per outlet, ordered by the outlet's first report (then name). Never ranked. */
  columns: OutletColumn[];
  labels: {
    rated: number;
    unrated: number;
    disputed: number;
    machine: number;
    orientations: { orientation: Orientation; label: string; outlets: number }[];
  };
  gaps: CoverageGap[];
  claimsInDispute: { assessed: false; note: string };
  corpus: { outlets: number; days: number };
}

const isRated = (status: string, orientation: string) =>
  (status === 'REVIEWED' || status === 'PROVISIONAL') && isPositional(orientation as Orientation);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildPerspectives(
  detail: EventDetail,
  corpus: CorpusOutlet[],
  days = 7,
): Perspectives {
  const { event, members } = detail;
  const byOutlet = new Map<string, EventMember[]>();
  for (const m of members) byOutlet.set(m.outlet.id, [...(byOutlet.get(m.outlet.id) ?? []), m]);

  const wordsOf = (reports: EventMember[]) =>
    new Set(
      reports.flatMap((r) => terms(r.title, event.language)).filter((t) => !t.startsWith('@')),
    );
  const outletWords = new Map([...byOutlet].map(([id, r]) => [id, wordsOf(r)]));

  const columns: OutletColumn[] = [...byOutlet.values()]
    .map((reports) => {
      const id = reports[0]!.outlet.id;
      const others = new Set([...outletWords].filter(([o]) => o !== id).flatMap(([, w]) => [...w]));
      const types = { NEWS: 0, OPINION: 0, ANALYSIS: 0, UNKNOWN: 0 };
      for (const r of reports) types[r.articleType] += 1;
      return {
        outlet: reports[0]!.outlet,
        reports,
        distinctWording: [...outletWords.get(id)!].filter((w) => !others.has(w)).sort(),
        types,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(a.reports[0]!.publishedAt) - Date.parse(b.reports[0]!.publishedAt) ||
        a.outlet.name.localeCompare(b.outlet.name),
    );

  const labels = columns.map((c) => c.outlet.label);
  const rated = labels.filter((l) => isRated(l.status, l.orientation));
  const orientationCounts = new Map<Orientation, number>();
  for (const l of rated)
    orientationCounts.set(l.orientation, (orientationCounts.get(l.orientation) ?? 0) + 1);

  const gaps: CoverageGap[] = [];
  if (columns.length < 2)
    gaps.push({
      kind: 'single-outlet',
      message:
        'Only one outlet in FreAlgo’s sources has reports in this event, so there is nothing to compare side by side.',
    });

  const corpusRated = corpus.filter((o) => isRated(o.labelStatus, o.orientation));
  if (!corpusRated.length) {
    gaps.push({
      kind: 'orientation',
      message:
        'None of the outlets with reports in FreAlgo this week has a reviewed or provisional orientation label, so FreAlgo cannot show which orientations are missing here.',
    });
  } else {
    const present = new Set(rated.map((l) => l.orientation));
    const missing = new Map<Orientation, number>();
    for (const o of corpusRated) {
      const or = o.orientation as Orientation;
      if (!present.has(or)) missing.set(or, (missing.get(or) ?? 0) + 1);
    }
    for (const [or, n] of [...missing].sort(
      (a, b) => (ORIENTATION_INFO[a[0]].position ?? 0) - (ORIENTATION_INFO[b[0]].position ?? 0),
    ))
      gaps.push({
        kind: 'orientation',
        message: `No report from an outlet labelled ${ORIENTATION_INFO[or].label}. FreAlgo has ${plural(n, 'such outlet')} with reports this week.`,
      });
  }
  const unrated = labels.filter((l) => l.status === 'UNRATED').length;
  if (unrated)
    gaps.push({
      kind: 'unrated',
      message: `${unrated} of ${plural(columns.length, 'outlet')} here ${unrated === 1 ? 'has' : 'have'} no orientation label. Unrated means not assessed, not neutral.`,
    });
  const disputed = labels.filter((l) => l.status === 'DISPUTED').length;
  if (disputed)
    gaps.push({
      kind: 'disputed',
      message: `${plural(disputed, 'outlet label')} here ${disputed === 1 ? 'is' : 'are'} disputed; read the label details before comparing.`,
    });

  const otherLanguages = [
    ...new Set(
      corpus.flatMap((o) => o.languages).filter((l) => l !== event.language && l !== 'und'),
    ),
  ].sort();
  if (otherLanguages.length)
    gaps.push({
      kind: 'language',
      message: `Only reports in ${languageName(event.language)} are grouped into this event (a limit of the method). FreAlgo also has reports this week in: ${otherLanguages.map((l) => languageName(l)).join(', ')}.`,
    });

  const homeCountries = new Set(
    columns.map((c) => c.outlet.country?.iso2).filter((x): x is string => !!x),
  );
  for (const c of event.countries) {
    if (homeCountries.has(c.iso2)) continue;
    const inCorpus = corpus.some((o) => o.country?.iso2 === c.iso2);
    gaps.push({
      kind: 'publisher-country',
      message: inCorpus
        ? `${c.name} is named in these reports, and FreAlgo has outlets based there, but none of them appears in this event.`
        : `${c.name} is named in these reports, but FreAlgo has no source based in ${c.name}.`,
    });
  }

  return {
    event,
    sharedWording: event.sharedTerms,
    columns,
    labels: {
      rated: rated.length,
      unrated,
      disputed,
      machine: labels.filter((l) => l.isMachine).length,
      orientations: [...orientationCounts]
        .sort(
          (a, b) => (ORIENTATION_INFO[a[0]].position ?? 0) - (ORIENTATION_INFO[b[0]].position ?? 0),
        )
        .map(([orientation, outlets]) => ({
          orientation,
          label: ORIENTATION_INFO[orientation].label,
          outlets,
        })),
    },
    gaps,
    claimsInDispute: {
      assessed: false,
      note: 'Not assessed. FreAlgo does not extract, verify or compare claims. Read the original reports to see what each outlet says.',
    },
    corpus: { outlets: corpus.length, days },
  };
}
