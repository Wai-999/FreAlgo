import Link from 'next/link';
import type { CountryCoverage } from '@/lib/db/coverage';
import { languageName } from '@/lib/format';
import { AlertIcon, InfoIcon } from '@/components/ui/icons';

/** Visible, plain-language coverage limitations for a country. Never hidden behind a toggle. */
export function CoverageNotice({ coverage }: { coverage: CountryCoverage }) {
  const { country, sources } = coverage;
  const notes: { tone: 'warn' | 'info'; text: React.ReactNode }[] = [];

  if (coverage.outlets.length === 0) {
    notes.push({
      tone: 'warn',
      text: (
        <>
          No sources are registered for {country.name}. FreAlgo cannot show news from here yet.
          Coverage is uneven across countries; see the <Link href="/sources">source registry</Link>.
        </>
      ),
    });
  } else if (coverage.fixtureOnly) {
    notes.push({
      tone: 'warn',
      text: (
        <>Only fixture (demo) data exists for {country.name}. These are not real news stories.</>
      ),
    });
  }
  if (coverage.hasRealSources && sources.active === 0) {
    notes.push({
      tone: 'info',
      text: (
        <>
          Real feeds for {country.name} are registered but paused until their publisher terms are
          reviewed.
        </>
      ),
    });
  }
  if (sources.stale + sources.failing > 0) {
    notes.push({
      tone: 'warn',
      text: (
        <>
          {sources.stale + sources.failing} source
          {sources.stale + sources.failing === 1 ? ' is' : 's are'} stale or failing, so recent
          stories may be missing. <Link href="/status">Feed freshness</Link>
        </>
      ),
    });
  }
  if (coverage.missingOfficialLanguages.length > 0 && coverage.outlets.length > 0) {
    notes.push({
      tone: 'info',
      text: (
        <>
          Language gap: official language{coverage.missingOfficialLanguages.length > 1 ? 's' : ''}{' '}
          {coverage.missingOfficialLanguages.map((l) => languageName(l)).join(', ')}{' '}
          {coverage.missingOfficialLanguages.length > 1 ? 'have' : 'has'} no registered source.
          Sources here publish in{' '}
          {coverage.languagesAvailable.map((l) => languageName(l)).join(', ') ||
            'unknown languages'}
          .
        </>
      ),
    });
  }
  if (coverage.paywalledOutlets.length > 0) {
    notes.push({
      tone: 'info',
      text: (
        <>Paywalled: {coverage.paywalledOutlets.join(', ')}. Links may require a subscription.</>
      ),
    });
  }

  if (notes.length === 0) return null;
  return (
    <ul
      className="space-y-2"
      aria-label={`Coverage notes for ${country.name}`}
      data-testid="coverage-notice"
    >
      {notes.map((n, i) => (
        <li key={i}>
          <div
            role="note"
            className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${n.tone === 'warn' ? 'border-warning/50 text-text' : 'border-border text-muted'}`}
          >
            {n.tone === 'warn' ? (
              <AlertIcon className="mt-0.5 shrink-0 text-warning" />
            ) : (
              <InfoIcon className="mt-0.5 shrink-0 text-muted" />
            )}
            <span>{n.text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
