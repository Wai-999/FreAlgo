/**
 * Builds lib/ingest/tagging/gazetteer.generated.json: country names per language, used by the
 * auditable text-match country tagger. Source: i18n-iso-countries@7.14.0 (MIT).
 * Run: node --import tsx scripts/generate-gazetteer.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const LANGS = [
  'en',
  'fr',
  'de',
  'es',
  'pt',
  'it',
  'nl',
  'ja',
  'zh',
  'ko',
  'ar',
  'ru',
  'id',
  'tr',
  'sw',
  'vi',
  'th',
  'hi',
  'uk',
  'pl',
];

const out: Record<string, Record<string, string[]>> = {};
for (const lang of LANGS) {
  const data = JSON.parse(
    readFileSync(require.resolve(`i18n-iso-countries/langs/${lang}.json`), 'utf8'),
  ) as { countries: Record<string, string | string[]> };
  out[lang] = {};
  for (const [iso2, names] of Object.entries(data.countries)) {
    const list = (Array.isArray(names) ? names : [names])
      .map((n) => n.trim())
      // Drop ISO-style inverted names ("Korea, Republic of") and bare codes ("US", "UK"):
      // they rarely occur in prose and codes are handled by curated aliases instead.
      .filter((n) => n.length >= 2 && !n.includes(',') && !/^[A-Z.]{2,5}$/.test(n));
    if (list.length) out[lang][iso2] = [...new Set(list)];
  }
}
writeFileSync(
  'lib/ingest/tagging/gazetteer.generated.json',
  JSON.stringify({ _source: 'i18n-iso-countries@7.14.0 (MIT)', names: out }) + '\n',
);
console.log(`Wrote gazetteer for ${LANGS.length} languages`);
