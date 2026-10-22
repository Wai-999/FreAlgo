'use client';

import { useState } from 'react';
import { clearPreferences, usePreferences, writePreferences } from '@/lib/preferences/store';
import { parsePreferences, type Preferences } from '@/lib/preferences/schema';

/**
 * Explicit, reversible personal settings. Stored in this browser; copied to the server only
 * when a signed-in user presses "Save to my account".
 */
export function SettingsPanel({
  signedIn,
  countries,
}: {
  signedIn: boolean;
  countries: { iso2: string; name: string }[];
}) {
  const [prefs, update, hydrated] = usePreferences();
  const [status, setStatus] = useState<string>('');
  const [addCountry, setAddCountry] = useState('');
  const fieldset = 'space-y-2 rounded-lg border border-border bg-surface p-4';
  const legend = 'px-1 font-semibold text-text';
  const check = 'flex min-h-11 items-center gap-3';
  const btn =
    'min-h-11 rounded-md border border-border-strong px-4 text-sm hover:bg-surface-raised';

  const toServer = (p: Preferences) => ({
    pinnedCountries: p.pinnedCountries,
    outletSlugs: p.outletIds,
    sectors: p.sectors,
    orientations: p.orientations,
    languages: p.languages,
    preferredSort: p.preferredSort,
    reducedMotion: p.motion === 'reduce',
    globeEnabled: p.globeEnabled,
  });

  async function call(method: 'GET' | 'PUT' | 'DELETE') {
    setStatus('Working…');
    const res = await fetch('/api/v1/me/preferences', {
      method,
      headers: method === 'PUT' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'PUT' ? JSON.stringify(toServer(prefs)) : undefined,
      credentials: 'same-origin',
    }).catch(() => null);
    if (!res) return setStatus('Network error; nothing changed.');
    if (method === 'GET') {
      if (res.status === 404)
        return setStatus('No preferences are stored on the server for this account.');
      if (!res.ok) return setStatus('Could not load from your account.');
      const { preferences: s } = await res.json();
      update({
        pinnedCountries: s.pinnedCountries,
        outletIds: s.outletSlugs,
        sectors: s.sectors,
        orientations: s.orientations,
        languages: s.languages,
        preferredSort: s.preferredSort,
        motion: s.reducedMotion ? 'reduce' : prefs.motion === 'reduce' ? 'system' : prefs.motion,
        globeEnabled: s.globeEnabled,
      });
      return setStatus('Loaded preferences from your account into this browser.');
    }
    if (!res.ok) return setStatus('The server did not accept the request; nothing changed.');
    setStatus(
      method === 'PUT' ? 'Saved to your account.' : 'Deleted the copy stored on the server.',
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-panel" aria-busy={!hydrated}>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-muted">
        {status}
      </p>

      <fieldset className={fieldset}>
        <legend className={legend}>Motion and intro</legend>
        <label className={check}>
          <input
            type="checkbox"
            className="size-5"
            checked={prefs.showIntro}
            onChange={(e) => update({ showIntro: e.target.checked })}
          />
          Show the short intro once per visit
        </label>
        {(['system', 'reduce', 'full'] as const).map((m) => (
          <label key={m} className={check}>
            <input
              type="radio"
              name="motion"
              className="size-5"
              checked={prefs.motion === m}
              onChange={() => update({ motion: m })}
            />
            {m === 'system'
              ? 'Follow my device setting for reduced motion'
              : m === 'reduce'
                ? 'Always reduce motion'
                : 'Allow motion even if my device asks to reduce it'}
          </label>
        ))}
        <label className={check}>
          <input
            type="checkbox"
            className="size-5"
            checked={prefs.globeEnabled}
            onChange={(e) => update({ globeEnabled: e.target.checked })}
          />
          Use the 3D globe when my device supports it (the flat map and list always work)
        </label>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Default order</legend>
        {(
          [
            ['newest', 'Newest first'],
            ['oldest', 'Oldest first'],
            ['outlet', 'Outlet name (A–Z)'],
          ] as const
        ).map(([v, label]) => (
          <label key={v} className={check}>
            <input
              type="radio"
              name="sort"
              className="size-5"
              checked={prefs.preferredSort === v}
              onChange={() => update({ preferredSort: v })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Pinned countries</legend>
        <p className="text-sm text-muted">Pinned countries appear first in the country list.</p>
        <ul className="flex flex-wrap gap-2">
          {prefs.pinnedCountries.map((iso2) => (
            <li key={iso2}>
              <button
                type="button"
                className={btn}
                onClick={() =>
                  update({ pinnedCountries: prefs.pinnedCountries.filter((c) => c !== iso2) })
                }
                aria-label={`Unpin ${countries.find((c) => c.iso2 === iso2)?.name ?? iso2}`}
              >
                {countries.find((c) => c.iso2 === iso2)?.name ?? iso2} ✕
              </button>
            </li>
          ))}
          {prefs.pinnedCountries.length === 0 ? (
            <li className="text-sm text-muted">None yet.</li>
          ) : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="pin-country">
            Country to pin
          </label>
          <select
            id="pin-country"
            value={addCountry}
            onChange={(e) => setAddCountry(e.target.value)}
            className="min-h-11 rounded-md border border-border-strong bg-bg px-3 text-text"
          >
            <option value="">Choose a country…</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btn}
            disabled={!addCountry}
            onClick={() => {
              if (addCountry && !prefs.pinnedCountries.includes(addCountry)) {
                update({ pinnedCountries: [...prefs.pinnedCountries, addCountry].slice(0, 50) });
              }
              setAddCountry('');
            }}
          >
            Pin
          </button>
        </div>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Your data</legend>
        <p className="text-sm text-muted">
          These settings live only in this browser
          {signedIn ? ' unless you save them to your account below' : ''}. Nothing about what you
          read is recorded.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => {
              const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'frealgo-local-preferences.json';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export (JSON)
          </button>
          <label className={`${btn} cursor-pointer`}>
            Import (JSON)
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              data-testid="prefs-import"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  JSON.parse(text);
                } catch {
                  setStatus('That file is not valid JSON; nothing was changed.');
                  return;
                }
                // Same validation as stored preferences: unknown or invalid fields fall back.
                writePreferences(parsePreferences(text));
                setStatus('Imported preferences from the file.');
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className={btn}
            onClick={() => {
              clearPreferences();
              setStatus('Cleared all preferences stored in this browser.');
            }}
          >
            Clear browser preferences
          </button>
        </div>
      </fieldset>

      {signedIn ? (
        <fieldset className={fieldset} data-testid="sync-panel">
          <legend className={legend}>Account sync (optional)</legend>
          <p className="text-sm text-muted">
            Copies your explicit choices (not your reading) to your account so another device can
            load them.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => call('PUT')}>
              Save to my account
            </button>
            <button type="button" className={btn} onClick={() => call('GET')}>
              Load from my account
            </button>
            <a
              className={`${btn} inline-flex items-center no-underline`}
              href="/api/v1/me/preferences?download=1"
            >
              Download server copy
            </a>
            <button type="button" className={btn} onClick={() => call('DELETE')}>
              Delete server copy
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
