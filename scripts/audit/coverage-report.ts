/**
 * Coverage gap report (FreAlgo 2.0, M2): what the source registry covers by region and language,
 * what is active, and where nothing is registered. Static and reproducible from the repository:
 *
 *   node --import tsx scripts/audit/coverage-report.ts > docs/data/coverage-report.md
 *
 * Active status comes from deploy/source-activations.json (the owner's decisions), not from a live
 * database. Publisher home country ≠ story subject (ADR V2-001): a registered outlet in a country
 * is a *potential* local voice, not proof of coverage.
 */
import { readFileSync } from 'node:fs';
import { REAL_SOURCES } from '../../prisma/data/sources';

interface CountryRow {
  iso2: string;
  name: string;
  region: string | null;
  subregion: string | null;
  officialLanguages: string[];
}
const countries = (
  JSON.parse(readFileSync('prisma/data/countries.json', 'utf8')) as { countries: CountryRow[] }
).countries;
const active = new Set(
  (JSON.parse(readFileSync('deploy/source-activations.json', 'utf8')) as { slug: string }[]).map(
    (d) => d.slug,
  ),
);
const byIso = new Map(countries.map((c) => [c.iso2, c]));

type Agg = {
  countries: number;
  withOutlet: Set<string>;
  withActive: Set<string>;
  outlets: number;
  active: number;
};
const regions = new Map<string, Agg>();
const sub = new Map<string, Agg>();
const bump = (m: Map<string, Agg>, key: string) => {
  if (!m.has(key))
    m.set(key, {
      countries: 0,
      withOutlet: new Set(),
      withActive: new Set(),
      outlets: 0,
      active: 0,
    });
  return m.get(key)!;
};
for (const c of countries) {
  bump(regions, c.region ?? 'Unassigned').countries++;
  bump(sub, `${c.region ?? 'Unassigned'} / ${c.subregion ?? '—'}`).countries++;
}
const languages = new Map<string, { feeds: number; active: number }>();
for (const o of REAL_SOURCES) {
  const c = byIso.get(o.countryIso2);
  const isActive = active.has(o.slug);
  for (const m of [
    bump(regions, c?.region ?? 'Unassigned'),
    bump(sub, `${c?.region ?? 'Unassigned'} / ${c?.subregion ?? '—'}`),
  ]) {
    m.withOutlet.add(o.countryIso2);
    m.outlets++;
    if (isActive) {
      m.withActive.add(o.countryIso2);
      m.active++;
    }
  }
  for (const f of o.feeds) {
    const l = (f.language ?? o.language).split('-')[0]!;
    const e = languages.get(l) ?? { feeds: 0, active: 0 };
    e.feeds++;
    if (isActive) e.active++;
    languages.set(l, e);
  }
}

const out: string[] = [];
const feedCount = REAL_SOURCES.reduce((n, o) => n + o.feeds.length, 0);
out.push('# Coverage gap report (source registry)', '');
out.push(
  `Generated from \`prisma/data/sources.ts\` (${REAL_SOURCES.length} outlets, ${feedCount} feeds) and \`deploy/source-activations.json\` (${active.size} outlets approved for activation) by \`scripts/audit/coverage-report.ts\`.`,
  '',
  'A registered outlet in a country is a potential local voice, not proof of coverage: since FreAlgo 2.0, stories count for the countries they are *about* (ADR V2-001). Measured coverage of the live corpus is on `/status#quality` and `/api/v1/sources/health`.',
  '',
);
out.push(
  '## By region',
  '',
  '| Region | Countries | With a registered outlet | With an approved outlet | Outlets (approved) |',
  '| --- | --- | --- | --- | --- |',
);
for (const [r, a] of [...regions].sort((x, y) => x[0].localeCompare(y[0])))
  out.push(
    `| ${r} | ${a.countries} | ${a.withOutlet.size} | ${a.withActive.size} | ${a.outlets} (${a.active}) |`,
  );
out.push('', '## Subregions with no registered outlet', '');
const empty = [...sub]
  .filter(([, a]) => a.withOutlet.size === 0)
  .map(([k, a]) => `${k} (${a.countries})`)
  .sort();
out.push(empty.length ? empty.map((e) => `- ${e}`).join('\n') : 'None.', '');
out.push(
  '## Feed languages',
  '',
  '| Language | Registered feeds | Approved |',
  '| --- | --- | --- |',
);
for (const [l, e] of [...languages].sort((x, y) => y[1].feeds - x[1].feeds))
  out.push(`| ${l} | ${e.feeds} | ${e.active} |`);
const spoken = new Set(countries.flatMap((c) => c.officialLanguages.map((l) => l.split('-')[0]!)));
const missing = [...spoken].filter((l) => !languages.has(l)).sort();
out.push(
  '',
  `Official languages of at least one country with no registered feed: ${missing.length} (${missing.slice(0, 60).join(', ')}${missing.length > 60 ? ', …' : ''}).`,
  '',
);
out.push('## Priorities (from the gaps above)', '');
out.push(
  '1. Activate already-registered, openly licensed sources once the owner approves (Global Voices: CC BY 3.0, 8 language editions).',
  '2. Seek outlets with explicit reuse terms in subregions that have no registered outlet, preferring local-language publishers over international English-language services.',
  '3. Ask publishers in groups B and C of `docs/source-terms-review.md` for permission, starting with countries that have no other source (e.g. Myanmar Now for Myanmar).',
  '',
);
process.stdout.write(out.join('\n'));
