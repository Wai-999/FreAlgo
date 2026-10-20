/**
 * Live adapter smoke test: fetch + parse + normalize + tag real registry feeds WITHOUT writing to
 * the database. Uses the production fetch path (SSRF policy, robots.txt, size/time limits).
 *
 *   npm run sources:dry-run              # every registry feed
 *   npm run sources:dry-run -- --slug bbc-news --slug npr
 */
import { parseArgs } from 'node:util';
import { normalizeItem } from '../lib/ingest/normalize';
import { tagCountries } from '../lib/ingest/tagging/countries';
import { tagSectors } from '../lib/ingest/tagging/sectors';
import { SECTOR_SLUGS } from '../lib/domain/sectors';
import { REAL_SOURCES } from '../prisma/data/sources';
import { rssProvider } from '../workers/providers/rss';

const { values } = parseArgs({ options: { slug: { type: 'string', multiple: true } } });
const ua =
  process.env.INGEST_USER_AGENT || 'FreAlgoFeedReader/0.1 (personal non-commercial reader)';
const valid = new Set<string>(SECTOR_SLUGS);

async function main() {
  const outlets = REAL_SOURCES.filter((o) => !values.slug?.length || values.slug.includes(o.slug));
  const rows: Record<string, unknown>[] = [];
  await Promise.all(
    outlets.flatMap((o) =>
      o.feeds.map(async (f) => {
        const started = Date.now();
        try {
          const res = await rssProvider.fetch(
            {
              id: 'dry-run',
              url: f.url,
              kind: 'RSS',
              etag: null,
              lastModifiedHeader: null,
              providerConfig: null,
            },
            {
              env: {},
              respectRobots: true,
              fetchOptions: {
                userAgent: ua,
                timeoutMs: 15_000,
                maxBytes: 5 * 1024 * 1024,
                maxRedirects: 3,
              },
            },
          );
          let ok = 0;
          let rejected = 0;
          let estimated = 0;
          let textMatches = 0;
          let sectorTagged = 0;
          for (const item of res.items) {
            const n = normalizeItem(item, {
              feedUrl: res.finalUrl,
              feedLanguage: res.feedLanguage ?? f.language ?? o.language,
              outletLanguage: o.language,
              excerptAllowed: true,
              firstSeenAt: new Date(),
            });
            if (!n.ok) {
              rejected++;
              continue;
            }
            ok++;
            if (n.item.publishedAtEstimated) estimated++;
            const c = tagCountries({
              title: n.item.title,
              excerpt: n.item.excerpt,
              language: n.item.language,
              sourceCountryIso2: o.countryIso2,
              feedDefaultIso2: f.defaultCountryIso2 ?? [],
            });
            if (c.some((t) => t.basis === 'TEXT_MATCH')) textMatches++;
            const s = tagSectors({
              title: n.item.title,
              excerpt: n.item.excerpt,
              language: n.item.language,
              categories: n.item.categories,
              feedDefaultSlugs: [],
              validSlugs: valid,
            });
            if (s.length) sectorTagged++;
          }
          rows.push({
            outlet: o.slug,
            format: res.format,
            http: res.httpStatus,
            items: res.items.length,
            valid: ok,
            rejected,
            estimatedDates: estimated,
            withCountryMatch: textMatches,
            withSector: sectorTagged,
            kb: Math.round(res.bytes / 1024),
            ms: Date.now() - started,
          });
        } catch (err) {
          const e = err as { code?: string; message: string };
          rows.push({
            outlet: o.slug,
            error: `${e.code ?? 'ERROR'}: ${e.message}`.slice(0, 90),
            ms: Date.now() - started,
          });
        }
      }),
    ),
  );
  rows.sort((a, b) => String(a.outlet).localeCompare(String(b.outlet)));
  console.table(rows);
  const failed = rows.filter((r) => r.error).length;
  console.log(
    `${rows.length - failed}/${rows.length} feeds fetched and parsed successfully (no data written).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
