'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { FOCUS_SHEET_KEY } from '@/components/news/country-sheet';
import { useWorkspaceNav } from '@/components/news/nav-anchor';
import { GlobeIcon, MenuIcon } from '@/components/ui/icons';
import type { FeatureIdentity } from '@/lib/geo/features';
import { cappedDpr, chooseQuality, type QualityTier } from '@/lib/geo/globe-math';
import { usePreferences } from '@/lib/preferences/store';
import { sendClientEvent } from '@/lib/telemetry/client';
import type { GlobeApi } from './globe-canvas';
import { GlobeErrorBoundary } from './globe-error-boundary';

/**
 * Stage that progressively enhances the server-rendered flat map into the 3D globe.
 *
 *  - SSR / no JS / WebGL unavailable → the SVG map (children) and the country list keep working.
 *  - The globe bundle is dynamically imported (ssr: false) and WebGL is initialised only after
 *    the stage is visible and a capability check passes; hidden stages unmount the canvas.
 *  - Software renderers (major performance caveat) fall back to 2D unless the user opts in.
 *  - Context loss: wait for a restore once; a second loss or no restore → 2D fallback.
 *  - A globe chunk that fails to download, or a crash inside it, → 2D fallback (error boundary).
 */
const GlobeCanvas = dynamic(() => import('./globe-canvas'), { ssr: false, loading: () => null });

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

function initialTier(): QualityTier {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return chooseQuality({
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    devicePixelRatio: window.devicePixelRatio,
  });
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

function useReducedMotionPref(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      mql.addEventListener('change', cb);
      window.addEventListener('frealgo:prefs', cb);
      return () => {
        mql.removeEventListener('change', cb);
        window.removeEventListener('frealgo:prefs', cb);
      };
    },
    () => {
      const m = document.documentElement.dataset.motion;
      return (
        m === 'reduce' ||
        (m !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      );
    },
    () => false,
  );
}

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
  const apiRef = useRef<GlobeApi | null>(null);
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const reducedMotion = useReducedMotionPref();

  const [visible, setVisible] = useState(false);
  // The globe is an enhancement: start it only once the main thread is idle after hydration, so
  // it never competes with first paint or the first interactions.
  const [idle, setIdle] = useState(false);
  const [capability, setCapability] = useState<Capability>('unknown');
  const [tier, setTier] = useState<QualityTier>('medium');
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [forceClicked, setForceClicked] = useState(false);
  const [hover, setHover] = useState<{
    name: string;
    x: number;
    y: number;
    country: boolean;
  } | null>(null);
  const [notice, setNotice] = useState<{ text: string; relatedIso2?: string } | null>(null);
  const [announce, setAnnounce] = useState('');
  const lostCount = useRef(0);
  const restoreTimer = useRef<number | null>(null);
  const byIso = useMemo(() => new Map(countries.map((c) => [c.iso2, c])), [countries]);

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
          setTier((t) => (t === 'medium' ? initialTier() : t));
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
  const onSlowFrames = useCallback(() => {
    setTier((t) => {
      if (t === 'low') return t;
      sendClientEvent('globe_quality_downgraded');
      return t === 'high' ? 'medium' : 'low';
    });
  }, []);
  const onReady = useCallback(() => {
    setReady(true);
    sendClientEvent('globe_ready');
  }, []);
  const onHover = useCallback(
    (identity: FeatureIdentity | null, x: number, y: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!identity || !rect) return setHover(null);
      const c = identity.iso2 ? byIso.get(identity.iso2) : null;
      setHover({
        name: c
          ? `${c.name} · ${c.articleCount ? `${c.articleCount} stories` : 'no stories yet'}`
          : identity.name,
        x: x - rect.left,
        y: y - rect.top,
        country: !!identity.iso2,
      });
    },
    [byIso],
  );
  const onCenterChange = useCallback((identity: FeatureIdentity | null) => {
    setAnnounce(identity ? `Centred on ${identity.name}` : 'Centred on open ocean');
  }, []);

  const dpr = isClient
    ? cappedDpr(tier, window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches)
    : 1;

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
        <div
          className={`absolute inset-y-0 left-0 transition-[opacity,right] duration-200 outline-none ${insetRight ? 'right-0 lg:right-[var(--sheet-w)]' : 'right-0'} ${mode === 'globe' ? 'opacity-100' : 'opacity-0'} ${hover?.country ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
          role="group"
          aria-roledescription="3D globe"
          aria-label="Globe. Arrow keys rotate, plus and minus zoom, Enter opens the country in the centre. The country list offers the same choices."
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - Enter"
          // Not focusable (or exposed) until the globe has actually drawn.
          tabIndex={mode === 'globe' ? 0 : -1}
          aria-hidden={mode === 'globe' ? undefined : true}
          data-globe-focus
          data-testid="globe"
          onKeyDown={(e) => {
            const api = apiRef.current;
            if (!api) return;
            const step = e.shiftKey ? 15 : 5;
            const keys: Record<string, () => void> = {
              ArrowLeft: () => api.rotateBy(-step, 0),
              ArrowRight: () => api.rotateBy(step, 0),
              ArrowUp: () => api.rotateBy(0, step),
              ArrowDown: () => api.rotateBy(0, -step),
              '+': () => api.zoomBy(0.85),
              '=': () => api.zoomBy(0.85),
              '-': () => api.zoomBy(1.18),
              Enter: () => {
                const c = api.centerIdentity();
                if (c) select(c);
                else setAnnounce('No country in the centre. Rotate to a country first.');
              },
            };
            const fn = keys[e.key];
            if (fn) {
              e.preventDefault();
              fn();
            }
          }}
        >
          <div className="absolute inset-0" aria-hidden="true">
            <GlobeErrorBoundary onError={onGlobeError}>
              <GlobeCanvas
                countries={countries}
                selectedIso2={selectedIso2}
                quality={tier}
                dpr={dpr}
                reducedMotion={reducedMotion}
                apiRef={apiRef}
                onReady={onReady}
                onSelect={select}
                onHover={onHover}
                onContextLost={onContextLost}
                onContextRestored={onContextRestored}
                onSlowFrames={onSlowFrames}
                onCenterChange={onCenterChange}
              />
            </GlobeErrorBoundary>
          </div>
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
        </div>
      ) : null}

      {hover && mode === 'globe' ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[140%] rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-sm whitespace-nowrap text-text"
          style={{ left: hover.x, top: hover.y }}
          aria-hidden="true"
        >
          {hover.name}
        </div>
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
                Open {byIso.get(notice.relatedIso2)?.name ?? notice.relatedIso2}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
