'use client';

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FeatureIdentity } from '@/lib/geo/features';
import { cappedDpr, chooseQuality, type QualityTier } from '@/lib/geo/globe-quality';
import { sendClientEvent } from '@/lib/telemetry/client';
import GlobeCanvas, { type GlobeApi } from './globe-canvas';

/**
 * The running 3D globe: keyboard controls, hover label, announcements and quality tier around
 * the WebGL canvas. Loaded lazily with three.js; GlobeStage decides whether and when to load it,
 * and keeps the flat map, fallbacks and notices, which must work before this chunk arrives.
 */
export default function GlobeView({
  countries,
  selectedIso2,
  drawn,
  insetRight,
  onSelect,
  onReady,
  onContextLost,
  onContextRestored,
}: {
  countries: { iso2: string; isoNumeric: string | null; name: string; articleCount: number }[];
  selectedIso2: string | null;
  /** The globe has drawn a frame (until then the flat map stays visible underneath). */
  drawn: boolean;
  insetRight: boolean;
  onSelect(identity: FeatureIdentity): void;
  onReady(): void;
  onContextLost(): void;
  onContextRestored(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GlobeApi | null>(null);
  const reducedMotion = useReducedMotionPref();
  const [tier, setTier] = useState<QualityTier>(initialTier);
  const [hover, setHover] = useState<{
    name: string;
    x: number;
    y: number;
    country: boolean;
  } | null>(null);
  const [announce, setAnnounce] = useState('');
  const byIso = useMemo(() => new Map(countries.map((c) => [c.iso2, c])), [countries]);

  const onSlowFrames = useCallback(() => {
    setTier((t) => {
      if (t === 'low') return t;
      sendClientEvent('globe_quality_downgraded');
      return t === 'high' ? 'medium' : 'low';
    });
  }, []);
  const onHover = useCallback(
    (identity: FeatureIdentity | null, x: number, y: number) => {
      // The wrapper starts at the stage's top-left corner, like the label.
      const rect = ref.current?.getBoundingClientRect();
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

  const dpr = cappedDpr(
    tier,
    window.devicePixelRatio,
    window.matchMedia('(pointer: coarse)').matches,
  );

  return (
    <>
      <div
        ref={ref}
        className={`absolute inset-y-0 left-0 transition-[opacity,right] duration-200 outline-none ${insetRight ? 'right-0 lg:right-[var(--sheet-w)]' : 'right-0'} ${drawn ? 'opacity-100' : 'opacity-0'} ${hover?.country ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
        role="group"
        aria-roledescription="3D globe"
        aria-label="Globe. Arrow keys rotate, plus and minus zoom, Enter opens the country in the centre. The country list offers the same choices."
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - Enter"
        // Not focusable (or exposed) until the globe has actually drawn.
        tabIndex={drawn ? 0 : -1}
        aria-hidden={drawn ? undefined : true}
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
              if (c) onSelect(c);
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
          <GlobeCanvas
            countries={countries}
            selectedIso2={selectedIso2}
            quality={tier}
            dpr={dpr}
            reducedMotion={reducedMotion}
            apiRef={apiRef}
            onReady={onReady}
            onSelect={onSelect}
            onHover={onHover}
            onContextLost={onContextLost}
            onContextRestored={onContextRestored}
            onSlowFrames={onSlowFrames}
            onCenterChange={onCenterChange}
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>

      {hover && drawn ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[140%] rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-sm whitespace-nowrap text-text"
          style={{ left: hover.x, top: hover.y }}
          aria-hidden="true"
        >
          {hover.name}
        </div>
      ) : null}
    </>
  );
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
