/**
 * Event clustering (FreAlgo 2.0, M4): groups reports about the same event. Deterministic,
 * lexical and explainable; no model, embedding or engagement signal.
 *
 * Method v1:
 * - Each report becomes a set of terms: headline words (lower-cased, stopwords and numbers
 *   removed, at least 3 letters) plus the countries its text names ("@RU"). A feed's default
 *   country and the publisher's home country are not used: they say nothing about the event.
 * - Term weight = smoothed inverse document frequency over the same-language reports of the last
 *   7 days, so words that appear in many headlines ("says", "new") count little.
 * - Similarity of two reports = weighted overlap: weight of shared terms / total weight of the
 *   shorter headline (so a short and a long headline about the same thing still match).
 * - Reports about different countries are never grouped: when both are about at least one
 *   country, they must share one.
 * - Grouped reports must share a name: a country both headlines name, or a word capitalised
 *   inside a headline (Nepal, Ebola, DOJ). Two reports that share only common words ("voters
 *   choose") are kept apart even when those words are rare this week.
 * - Reports are processed oldest first. A report joins an existing event (same language, last
 *   report within 72 hours) when its closest member qualifies (similarity ≥ JOIN, at least
 *   MIN_SHARED distinctive words in common, a shared name) and its mean similarity to all members
 *   is ≥ JOIN_MEAN (guards against chaining unrelated stories). Otherwise it pairs with an
 *   unclustered report under the same rule, or stays alone. Reports left alone are retried once
 *   new events exist, so one run equals several runs. Events only grow; never split or merged.
 * - An event is shown under one member's own headline, verbatim: the one most similar to the
 *   others (ties: the earliest). It can change as reports join; the event's address never does.
 * Limits (shown to readers): reports in different languages are never grouped; scripts without
 * spaces (CJK, Thai, Burmese) are not clustered; shared wording is not proof of the same event.
 */
export const CLUSTER_METHOD_VERSION = 1;
export const WINDOW_HOURS = 72;
export const JOIN = 0.3;
export const JOIN_MEAN = 0.25;
export const MIN_SHARED = 2;

const STOP: Record<string, string[]> = {
  en: [
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'into',
    'over',
    'after',
    'about',
    'says',
    'said',
    'say',
    'will',
    'has',
    'have',
    'had',
    'was',
    'were',
    'are',
    'its',
    'his',
    'her',
    'their',
    'they',
    'what',
    'who',
    'how',
    'why',
    'when',
    'new',
    'more',
    'than',
    'but',
    'not',
    'out',
    'off',
    'amid',
    'as',
    'at',
    'by',
    'in',
    'of',
    'on',
    'to',
    'up',
    'is',
    'be',
    'an',
    'a',
    'it',
    'can',
    'could',
    'would',
    'should',
    'may',
    'might',
    'been',
    'being',
    'also',
    'just',
    'now',
    'all',
    'one',
    'two',
    'first',
    'last',
    'year',
    'years',
    'day',
    'days',
    'week',
    'live',
    'latest',
    'news',
    'update',
    'updates',
    'report',
    'reports',
    'watch',
    'video',
    'how',
    'why',
  ],
  pt: [
    'que',
    'para',
    'com',
    'por',
    'uma',
    'dos',
    'das',
    'nos',
    'nas',
    'aos',
    'pelo',
    'pela',
    'sobre',
    'entre',
    'após',
    'como',
    'mais',
    'diz',
    'segundo',
    'será',
    'são',
    'foi',
    'tem',
    'ser',
    'não',
    'sem',
    'ano',
    'anos',
    'dia',
    'hoje',
    'novo',
    'nova',
  ],
  es: [
    'que',
    'para',
    'con',
    'por',
    'una',
    'los',
    'las',
    'del',
    'sobre',
    'entre',
    'tras',
    'como',
    'más',
    'dice',
    'según',
    'será',
    'son',
    'fue',
    'tiene',
    'ser',
    'sin',
    'año',
    'años',
    'día',
    'hoy',
    'nuevo',
    'nueva',
  ],
  fr: [
    'que',
    'pour',
    'avec',
    'par',
    'une',
    'des',
    'les',
    'dans',
    'sur',
    'entre',
    'après',
    'comme',
    'plus',
    'dit',
    'selon',
    'sera',
    'sont',
    'été',
    'est',
    'pas',
    'sans',
    'ans',
    'jour',
    'nouveau',
    'nouvelle',
    'aux',
    'qui',
  ],
};
// "fixture" marks FreAlgo's fictional test data in every language; it is never event wording.
const MARKERS = ['fixture'];
const stopwords = (language: string | null) =>
  new Set([...(STOP[baseLang(language)] ?? STOP.en!), ...MARKERS]);
const NO_SPACE_SCRIPT = /[぀-ヿ㐀-鿿가-힯฀-๿က-႟ក-៿຀-໿]/u;

export function baseLang(language: string | null): string {
  return (language ?? 'en').toLowerCase().split('-')[0] || 'en';
}

/** Headline terms for clustering; empty when the language cannot be tokenised by spaces. */
export function terms(
  headline: string,
  language: string | null,
  countries: string[] = [],
): string[] {
  if (NO_SPACE_SCRIPT.test(headline)) return [];
  const stop = stopwords(language);
  const words = headline
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !stop.has(w));
  return [...new Set([...words, ...countries.map((c) => `@${c}`)])].sort();
}

/**
 * Name words: capitalised words that are not the first word of the headline (lower-cased), plus
 * "@XX" for each country the text names. Used only for the "shared name" requirement.
 */
export function names(
  headline: string,
  language: string | null,
  textCountries: string[] = [],
): string[] {
  if (NO_SPACE_SCRIPT.test(headline)) return [];
  const stop = stopwords(language);
  const words = headline
    .normalize('NFKC')
    .replace(/['’]s\b/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(1)
    .filter((w) => w.length >= 3 && /^\p{Lu}/u.test(w))
    .map((w) => w.toLowerCase())
    .filter((w) => !stop.has(w));
  return [...new Set([...words, ...textCountries.map((c) => `@${c}`)])].sort();
}

/** True when the two reports share a country named in both texts or a name word. */
export function shareName(a: ClusterInput, b: ClusterInput): boolean {
  const inBoth = new Set(a.terms.filter((t) => b.terms.includes(t)));
  const named = new Set([...a.names, ...b.names]);
  for (const t of named) {
    if (t.startsWith('@') ? a.names.includes(t) && b.names.includes(t) : inBoth.has(t)) return true;
  }
  return false;
}

export type Idf = (term: string) => number;

/** Smoothed inverse document frequency over a corpus of term sets. */
export function idfFrom(corpus: string[][]): Idf {
  const df = new Map<string, number>();
  for (const doc of corpus) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = corpus.length;
  return (t) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;
}

export function similarity(
  a: string[],
  b: string[],
  idf: Idf,
): { score: number; shared: string[] } {
  const sb = new Set(b);
  const shared = a.filter((t) => sb.has(t));
  const weight = (xs: string[]) => xs.reduce((n, t) => n + idf(t), 0);
  const den = Math.min(weight(a), weight(b));
  return { score: den ? weight(shared) / den : 0, shared };
}

/** Both reports name countries but none in common → treated as different events. */
export function countriesConflict(a: string[], b: string[]): boolean {
  const ca = a.filter((t) => t.startsWith('@'));
  const cb = new Set(b.filter((t) => t.startsWith('@')));
  return ca.length > 0 && cb.size > 0 && !ca.some((t) => cb.has(t));
}

/** A term counts as distinctive when it appears in at most 10 % of the corpus (or 3 reports). */
export function isDistinctive(idf: Idf, corpusSize: number): (t: string) => boolean {
  const limit = Math.max(3, Math.floor(corpusSize * 0.1));
  const minIdf = Math.log((corpusSize + 1) / (limit + 1)) + 1;
  return (t) => idf(t) >= minIdf;
}

export interface ClusterInput {
  id: string;
  publishedAt: Date;
  language: string;
  terms: string[];
  /** See names(). */
  names: string[];
  outletId: string;
}

export interface ExistingEvent {
  id: string;
  language: string;
  lastAt: Date;
  members: ClusterInput[];
}

export type ClusterDecision =
  | {
      kind: 'join';
      articleId: string;
      eventId: string;
      /** The member it matched best. */
      matchedArticleId: string;
      score: number;
      shared: string[];
    }
  | { kind: 'create'; seed: ClusterInput; partner: ClusterInput; score: number; shared: string[] };

/**
 * Decides, oldest first, which unclustered reports join an event or start one with another
 * unclustered report. Pure: callers persist the decisions.
 */
export function clusterDecisions(
  unclustered: ClusterInput[],
  events: ExistingEvent[],
  idf: Idf,
  distinctive: (t: string) => boolean,
): ClusterDecision[] {
  const windowMs = WINDOW_HOURS * 3_600_000;
  const open = events.map((e) => ({ ...e, members: [...e.members], newId: null as string | null }));
  const singles: ClusterInput[] = [];
  const decisions: ClusterDecision[] = [];
  const sorted = [...unclustered]
    .filter((a) => a.terms.length > 0)
    .sort((x, y) => x.publishedAt.getTime() - y.publishedAt.getTime() || (x.id < y.id ? -1 : 1));

  // A report is admitted when its best qualifying pair (score ≥ JOIN, ≥ MIN_SHARED distinctive
  // words, a shared name) exists and its mean similarity to all members is ≥ JOIN_MEAN.
  const admits = (a: ClusterInput, members: ClusterInput[]) => {
    let best: { score: number; shared: string[]; id: string } | null = null;
    let total = 0;
    for (const m of members) {
      if (countriesConflict(a.terms, m.terms)) return null;
      const s = similarity(a.terms, m.terms, idf);
      total += s.score;
      const sharedDistinct = s.shared.filter((t) => !t.startsWith('@') && distinctive(t));
      if (
        s.score >= JOIN &&
        sharedDistinct.length >= MIN_SHARED &&
        shareName(a, m) &&
        (!best || s.score > best.score)
      )
        best = { score: s.score, shared: sharedDistinct, id: m.id };
    }
    if (!best || total / members.length < JOIN_MEAN) return null;
    return { score: Math.round(best.score * 1000) / 1000, shared: best.shared, matched: best.id };
  };

  const tryJoin = (a: ClusterInput): boolean => {
    const t = a.publishedAt.getTime();
    let chosen: {
      ev: (typeof open)[number];
      score: number;
      shared: string[];
      matched: string;
    } | null = null;
    for (const ev of open) {
      if (ev.language !== a.language) continue;
      if (Math.abs(t - ev.lastAt.getTime()) > windowMs) continue;
      const r = admits(a, ev.members);
      if (r && (!chosen || r.score > chosen.score)) chosen = { ev, ...r };
    }
    if (!chosen) return false;
    chosen.ev.members.push(a);
    if (t > chosen.ev.lastAt.getTime()) chosen.ev.lastAt = a.publishedAt;
    decisions.push({
      kind: 'join',
      articleId: a.id,
      eventId: chosen.ev.newId ?? chosen.ev.id,
      matchedArticleId: chosen.matched,
      score: chosen.score,
      shared: chosen.shared,
    });
    return true;
  };

  for (const a of sorted) {
    const t = a.publishedAt.getTime();
    if (tryJoin(a)) continue;
    let pair: { s: ClusterInput; score: number; shared: string[]; matched: string } | null = null;
    for (const s of singles) {
      if (s.language !== a.language || Math.abs(t - s.publishedAt.getTime()) > windowMs) continue;
      const r = admits(a, [s]);
      if (r && (!pair || r.score > pair.score)) pair = { s, ...r };
    }
    if (pair) {
      singles.splice(singles.indexOf(pair.s), 1);
      const newId = `new:${pair.s.id}`;
      open.push({
        id: newId,
        newId,
        language: a.language,
        lastAt: a.publishedAt,
        members: [pair.s, a],
      });
      decisions.push({
        kind: 'create',
        seed: pair.s,
        partner: a,
        score: pair.score,
        shared: pair.shared,
      });
    } else {
      singles.push(a);
    }
  }
  // Reports left alone may match an event formed after them; retry until nothing changes, so one
  // run gives the same result as several runs over the same reports.
  for (let changed = true; changed;) {
    changed = false;
    for (const a of [...singles]) {
      if (tryJoin(a)) {
        singles.splice(singles.indexOf(a), 1);
        changed = true;
      }
    }
  }
  return decisions;
}

/** Index of the member whose headline is most similar to the others; ties go to the earliest. */
export function representative(members: ClusterInput[], idf: Idf): number {
  const order = members
    .map((m, i) => ({ m, i }))
    .sort(
      (x, y) => x.m.publishedAt.getTime() - y.m.publishedAt.getTime() || (x.m.id < y.m.id ? -1 : 1),
    );
  let best = order[0]!.i;
  let bestMean = -1;
  for (const { m, i } of order) {
    let total = 0;
    for (const o of members) if (o !== m) total += similarity(m.terms, o.terms, idf).score;
    const mean = members.length > 1 ? total / (members.length - 1) : 0;
    if (mean > bestMean + 1e-9) {
      best = i;
      bestMean = mean;
    }
  }
  return best;
}

/** Terms shared by at least half of an event's reports (shown as "shared wording"). */
export function sharedWording(members: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const m of members)
    for (const t of new Set(m)) if (!t.startsWith('@')) counts.set(t, (counts.get(t) ?? 0) + 1);
  const need = Math.max(2, Math.ceil(members.length / 2));
  return [...counts]
    .filter(([, n]) => n >= need)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([t]) => t);
}
