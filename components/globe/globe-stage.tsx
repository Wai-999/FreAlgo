'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { FOCUS_SHEET_KEY } from '@/components/news/country-sheet';
import { useWorkspaceNav } from '@/components/news/nav-anchor';
import { GlobeIcon, MenuIcon } from '@/components/ui/icons';
import type { FeatureIdentity } from '@/lib/geo/features';
import { usePreferences } from '@/lib/preferences/store';
import { sendClientEvent } from '@/lib/telemetry/client';
import { GlobeErrorBoundary } from './globe-error-boundary';

/**
 * Stage that progressively enhances the server-rendered flat map into the 3D globe.
 *
 *  - SSR / no JS / WebGL unavailable → the SVG map (children) and the country list keep working.
 *  - The globe (GlobeView: canvas, controls, quality tier) is lazily imported with three.js, and
 *    WebGL is initialised only after the stage is visible and a capability check passes; hidden
 *    stages unmount the canvas.
 *  - Software renderers (major performance caveat) fall back to 2D unless the user opts in.
 *  - Context loss: wait for a restore once; a second loss or no restore → 2D fallback.
 *  - A globe chunk that fails to download, or a crash inside it, → 2D fallback (error boundary).
 */
// React.lazy rather than next/dynamic: the globe only ever renders on the client (after idle),
// so next/dynamic's SSR/preload machinery would only add to the first-load bundle.
const GlobeView = lazy(() => import('./globe-view'));

export const RESTORE_TARGET_KEY = 'frealgo:restore-target';
const FORCE_KEY = 'frealgo:globe-force';
type Capability = 'unknown' | 'ok' | 'software' | 'unsupported';

function probeWebGL(): Capability {
  try {
    const canvas = document.createElement('canvas');
    const strict =
      (canvas.getContext('webgl2', {
        failIfMajorPerformanceCaveat: true,
      }) as WebGLRenderingContext | null) ??
      (canvas.getContext('webgl', {
        failIfMajorPerformanceCaveat: true,
      }) as WebGLRenderingContext | null);
    if (strict) {
      strict.getExtension('WEBGL_lose_context')?.loseContext();
      return 'ok';
    }
    const c2 = document.createElement('canvas');
    const any =
      (c2.getContext('webgl2') as WebGLRenderingContext | null) ??
      (c2.getContext('webgl') as WebGLRenderingContext | null);
    if (any) {
      any.getExtension('WEBGL_lose_context')?.loseContext();
      return 'software';
    }
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

export function GlobeStage({
  countries,
  selectedIso2,
  hrefBase,
  insetRight = false,
  children,
}: {
  countries: { iso2: string; isoNumeric: string | null; name: string; articleCount: number }[];
  selectedIso2: string | null;
  /** Query string (without country) carried when picking a country. */
  hrefBase: string;
  /** Keep the globe clear of the anchored country panel on desktop. */
  insetRight?: boolean;
  /** Server-rendered flat map (SSR, no-JS and fallback). */
  children: ReactNode;
}) {
  const [prefs, updatePrefs, hydrated] = usePreferences();
  const nav = useWorkspaceNav();
  const containerRef = useRef<HTMLDivElement>(null);
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [visible, setVisible] = useState(false);
  // The globe is an enhancement: start it only once the main thread is idle after hydration, so
  // it never competes with first paint or the first interactions.
  const [idle, setIdle] = useState(false);
  const [capability, setCapability] = useState<Capability>('unknown');
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [forceClicked, setForceClicked] = useState(false);
  const [notice, setNotice] = useState<{ text: string; relatedIso2?: string } | null>(null);
  const lostCount = useRef(0);
  const restoreTimer = useRef<number | null>(null);

  // Initialise WebGL only once the stage is on screen; probing happens in the observer callback.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0);
        setVisible(isVisible);
        if (isVisible) {
          setCapability((current) => {
            if (current !== 'unknown') return current;
            const cap = probeWebGL();
            if (cap === 'unsupported') sendClientEvent('webgl_unavailable');
            if (cap === 'software') sendClientEvent('webgl_software_renderer');
            return cap;
          });
        }
      },
      { threshold: [0, 0.1] },
    );
    io.observe(el);
    let idleHandle: number | undefined;
    const markIdle = () => setIdle(true);
    const scheduleIdle = () => {
      idleHandle =
        typeof window.requestIdleCallback === 'function'
          ? window.requestIdleCallback(markIdle, { timeout: 2500 })
          : (globalThis.setTimeout(markIdle, 1200) as unknown as number);
    };
    // Mounted after hydration already; don't wait for `load` (which also waits for the map iframe).
    scheduleIdle();
    return () => {
      if (idleHandle !== undefined) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle);
        else globalThis.clearTimeout(idleHandle as unknown as ReturnType<typeof setTimeout>);
      }
      io.disconnect();
      if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
    };
  }, []);

  const forced =
    forceClicked ||
    (isClient &&
      (new URLSearchParams(window.location.search).get('globe') === 'force' ||
        readSession(FORCE_KEY) === '1'));
  const allowed =
    prefs.globeEnabled && (capability === 'ok' || (capability === 'software' && forced));
  const fallbackReason =
    failure ??
    (prefs.globeEnabled && capability === 'software' && !forced
      ? 'This device renders 3D in software, which would be slow.'
      : prefs.globeEnabled && capability === 'unsupported'
        ? 'WebGL is not available in this browser.'
        : null);
  const mode: 'map' | 'globe-loading' | 'globe' | 'fallback' =
    !hydrated || !prefs.globeEnabled
      ? 'map'
      : fallbackReason
        ? 'fallback'
        : allowed && visible && idle
          ? ready
            ? 'globe'
            : 'globe-loading'
          : 'map';
  const showGlobe = mode === 'globe' || mode === 'globe-loading';

  const select = useCallback(
    (identity: FeatureIdentity) => {
      if (!identity.iso2) {
        if (identity.uncoded) {
          setNotice({
            text: `${identity.name}: ${identity.uncoded.note}`,
            relatedIso2: identity.uncoded.relatedIso2,
          });
        }
        return;
      }
      setNotice(null);
      try {
        sessionStorage.setItem(FOCUS_SHEET_KEY, '1');
        sessionStorage.setItem(RESTORE_TARGET_KEY, 'globe');
      } catch {
        // ignore
      }
      const p = new URLSearchParams(hrefBase);
      p.set('country', identity.iso2);
      nav?.navigate(`/?${p.toString()}`);
    },
    [hrefBase, nav],
  );

  const onContextLost = useCallback(() => {
    lostCount.current += 1;
    sendClientEvent('webgl_context_lost');
    if (lostCount.current >= 2) {
      setFailure('The 3D view stopped working repeatedly (graphics context lost).');
      sendClientEvent('globe_fallback');
      return;
    }
    restoreTimer.current = window.setTimeout(() => {
      setFailure('The 3D view could not recover after the graphics context was lost.');
      sendClientEvent('globe_fallback');
    }, 3000);
  }, []);
  const onGlobeError = useCallback((error: unknown) => {
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    setFailure(
      /chunk|import|fetch|load/i.test(text)
        ? 'The 3D globe could not be downloaded (network problem).'
        : 'The 3D view stopped working.',
    );
    sendClientEvent('globe_load_error');
    sendClientEvent('globe_fallback');
  }, []);
  const onContextRestored = useCallback(() => {
    if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
  }, []);
  const onReady = useCallback(() => {
    setReady(true);
    sendClientEvent('globe_ready');
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" data-testid="globe-stage" data-mode={mode}>
      {/* Flat map: always server-rendered; hidden only once the globe has drawn a frame. */}
      <div
        className={mode === 'globe' ? 'invisible' : ''}
        aria-hidden={mode === 'globe' ? true : undefined}
      >
        {children}
      </div>

      {showGlobe ? (
        <GlobeErrorBoundary onError={onGlobeError}>
          {/* The flat map stays visible while the globe chunk downloads. */}
          <Suspense fallback={null}>
            <GlobeView
              countries={countries}
              selectedIso2={selectedIso2}
              drawn={mode === 'globe'}
              insetRight={insetRight}
              onSelect={select}
              onReady={onReady}
              onContextLost={onContextLost}
              onContextRestored={onContextRestored}
            />
          </Suspense>
        </GlobeErrorBoundary>
      ) : null}

      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
        {isClient ? (
          <button
            type="button"
            onClick={() => {
              const next = !(prefs.globeEnabled && !fallbackReason);
              updatePrefs({ globeEnabled: next });
              if (next) {
                setFailure(null);
                setReady(false);
                lostCount.current = 0;
              }
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-bg/80 px-3 text-sm text-text no-underline backdrop-blur hover:bg-surface-raised"
            aria-pressed={showGlobe}
            data-testid="globe-toggle"
          >
            {showGlobe ? <MenuIcon /> : <GlobeIcon />}
            {showGlobe ? 'Use flat map' : 'Use 3D globe'}
          </button>
        ) : null}
        {mode === 'fallback' && fallbackReason ? (
          <div
            role="status"
            className="max-w-xs rounded-md border border-border-strong bg-bg/90 p-3 text-sm text-muted"
            data-testid="globe-fallback-notice"
          >
            <p>{fallbackReason} Showing the flat map. Every feature still works.</p>
            {capability === 'software' && !failure ? (
              <button
                type="button"
                className="mt-2 min-h-11 rounded-md border border-border-strong px-3 text-text"
                onClick={() => {
                  try {
                    sessionStorage.setItem(FORCE_KEY, '1');
                  } catch {
                    // ignore
                  }
                  setForceClicked(true);
                }}
              >
                Try the 3D globe anyway
              </button>
            ) : null}
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            className="max-w-xs rounded-md border border-border-strong bg-bg/90 p-3 text-sm text-muted"
          >
            {notice.text}{' '}
            {notice.relatedIso2 ? (
              <button
                type="button"
                className="underline"
                onClick={() => select({ iso2: notice.relatedIso2!, name: notice.relatedIso2! })}
              >
                Open{' '}
                {countries.find((c) => c.iso2 === notice.relatedIso2)?.name ?? notice.relatedIso2}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
