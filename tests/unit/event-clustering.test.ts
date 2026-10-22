import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clusterDecisions,
  idfFrom,
  isDistinctive,
  names,
  sharedWording,
  similarity,
  terms,
  type ClusterInput,
} from '@/lib/events/cluster';

/** Evaluation on a labelled, fictional headline set (tests/fixtures/events). */
interface Item {
  id: string;
  event: string | null;
  outlet: string;
  h: number;
  lang: string;
  countries: string[];
  title: string;
  crossLanguage?: boolean;
}
const items = (
  JSON.parse(readFileSync('tests/fixtures/events/labelled-headlines.json', 'utf8')) as {
    items: Item[];
  }
).items;
const T0 = Date.parse('2026-10-20T00:00:00Z');
// A week's corpus has hundreds of unrelated headlines; word rarity (IDF) is computed over all of
// them. Neutral, deterministic background headlines model that (vocabulary disjoint from events).
const SUBJECTS = [
  'Council',
  'Museum',
  'Festival',
  'Farmers',
  'Students',
  'Researchers',
  'Workers',
  'Doctors',
  'Artists',
  'Engineers',
];
const VERBS = ['plan', 'open', 'debate', 'celebrate', 'review', 'launch', 'mark', 'discuss'];
const OBJECTS = [
  'harbour project',
  'library hours',
  'river cleanup',
  'music week',
  'bus routes',
  'clinic hours',
  'tree planting',
  'coding classes',
];
const background: string[][] = [];
for (let i = 0; i < 240; i++)
  background.push(
    terms(
      `${SUBJECTS[i % 10]} ${VERBS[(i * 3) % 8]} ${OBJECTS[(i * 7) % 8]} in district ${i}`,
      'en',
    ),
  );
const inputs: ClusterInput[] = items.map((i) => ({
  id: i.id,
  publishedAt: new Date(T0 + i.h * 3_600_000),
  language: i.lang,
  terms: terms(i.title, i.lang, i.countries),
  names: names(i.title, i.lang, i.countries),
  outletId: i.outlet,
}));

function run() {
  const corpus = [...inputs.map((i) => i.terms), ...background];
  const idf = idfFrom(corpus);
  const decisions = clusterDecisions(inputs, [], idf, isDistinctive(idf, corpus.length));
  const clusterOf = new Map<string, string>();
  for (const d of decisions) {
    if (d.kind === 'create') {
      clusterOf.set(d.seed.id, `new:${d.seed.id}`);
      clusterOf.set(d.partner.id, `new:${d.seed.id}`);
    } else clusterOf.set(d.articleId, d.eventId);
  }
  return { decisions, clusterOf };
}

describe('event clustering (method v1)', () => {
  it('tokenises headlines without stopwords or numbers and tags countries', () => {
    expect(
      terms('Magnitude 6.8 earthquake strikes western Nepal, dozens injured', 'en', ['NP']),
    ).toEqual([
      '@NP',
      'dozens',
      'earthquake',
      'injured',
      'magnitude',
      'nepal',
      'strikes',
      'western',
    ]);
    expect(terms('中国の経済と日本', 'ja')).toEqual([]); // scripts without spaces are not clustered
  });

  it('is symmetric and bounded', () => {
    const idf = idfFrom([...inputs.map((i) => i.terms), ...background]);
    const a = inputs[0]!.terms;
    const b = inputs[1]!.terms;
    expect(similarity(a, b, idf).score).toBeCloseTo(similarity(b, a, idf).score, 10);
    expect(similarity(a, a, idf).score).toBe(1);
  });

  it('reaches perfect pairwise precision and high recall on the labelled set', () => {
    const { clusterOf } = run();
    const evalItems = items.filter((i) => !i.crossLanguage);
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let x = 0; x < evalItems.length; x++)
      for (let y = x + 1; y < evalItems.length; y++) {
        const a = evalItems[x]!;
        const b = evalItems[y]!;
        const truth = a.event !== null && a.event === b.event;
        const ca = clusterOf.get(a.id);
        const predicted = ca !== undefined && ca === clusterOf.get(b.id);
        if (predicted && truth) tp++;
        else if (predicted && !truth) fp++;
        else if (!predicted && truth) fn++;
      }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    expect(fp).toBe(0);
    expect(precision).toBe(1);
    expect(recall).toBeGreaterThanOrEqual(0.8);
  });

  it('never groups across languages (documented limitation)', () => {
    const { clusterOf } = run();
    expect(clusterOf.get('x9')).toBeUndefined();
    expect(clusterOf.get('d1')).toBe(clusterOf.get('d2')); // Portuguese pair still groups
  });

  it('does not merge different events that share generic words (central bank, leaders meet)', () => {
    const { clusterOf } = run();
    expect(clusterOf.get('x5')).toBeUndefined(); // US central bank vs Kenya central bank
    expect(clusterOf.get('x6')).toBeUndefined(); // UK leaders meet vs Indonesia–Malaysia leaders
  });

  it('is deterministic and reports the shared distinctive terms for every join', () => {
    const a = run().decisions;
    const b = run().decisions;
    expect(a).toEqual(b);
    for (const d of a) expect(d.shared.length).toBeGreaterThanOrEqual(2);
  });

  it('summarises shared wording without country markers', () => {
    expect(
      sharedWording([
        ['@NP', 'earthquake', 'nepal', 'western'],
        ['@NP', 'earthquake', 'nepal', 'rescuers'],
        ['earthquake', 'western', 'schools'],
      ]),
    ).toEqual(['earthquake', 'nepal', 'western']);
  });
});
