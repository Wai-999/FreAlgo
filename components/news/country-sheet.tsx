'use client';

import { AnimatePresence, LazyMotion, m, useDragControls, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { CloseIcon } from '@/components/ui/icons';
import { NavAnchor, useWorkspaceNav } from './nav-anchor';

export const RESTORE_FOCUS_KEY = 'frealgo:restore-focus';
export const FOCUS_SHEET_KEY = 'frealgo:focus-sheet';

function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

const loadMotionFeatures = () => import('./motion-features').then((mod) => mod.default);

/** Keeps the sheet mounted across country changes (spatial memory) and runs exit transitions. */
export function SheetPresence({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <AnimatePresence>{children}</AnimatePresence>
    </LazyMotion>
  );
}

/**
 * Country sheet.
 *  Desktop (≥1024px): anchored, non-modal side panel (role=region); the map stays usable.
 *  Mobile: modal bottom sheet (role=dialog, aria-modal) with drag handle, explicit close button,
 *  focus trap, inert background and Escape. Without JavaScript it renders in place with a close link.
 */
export function CountrySheet({
  iso2,
  title,
  subtitle,
  closeHref,
  contentKey,
  header,
  children,
}: {
  iso2: string;
  title: string;
  subtitle: string;
  closeHref: string;
  /** Changes when the list content changes (country/sector/filters/page) to reset scroll. */
  contentKey: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery('(min-width: 1024px)', true);
  const reduceMotion = useReducedMotion();
  const nav = useWorkspaceNav();
  const headingId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const modal = !isDesktop;
  const lastIso = useRef<string | null>(null);

  const close = () => {
    try {
      sessionStorage.setItem(RESTORE_FOCUS_KEY, iso2);
    } catch {
      // storage may be unavailable
    }
    nav?.navigate(closeHref);
  };

  // Move focus to the heading when the user opens or switches country (not on a cold deep link).
  useEffect(() => {
    let requested = false;
    try {
      requested = sessionStorage.getItem(FOCUS_SHEET_KEY) === '1';
      sessionStorage.removeItem(FOCUS_SHEET_KEY);
    } catch {
      // ignore
    }
    if ((lastIso.current !== null && lastIso.current !== iso2) || requested) {
      headingRef.current?.focus({ preventScroll: true });
    }
    lastIso.current = iso2;
  }, [iso2]);

  // New content (country, sector, filters or page) starts at the top of the list.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [contentKey]);

  // Escape closes; on mobile, Tab is trapped inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('details[open]') && target.tagName === 'SUMMARY') return;
        e.preventDefault();
        close();
      }
      if (e.key === 'Tab' && modal && sheetRef.current) {
        const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => n.offsetParent !== null,
        );
        if (!nodes.length) return;
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, closeHref, iso2]);

  // Modal on mobile: make the rest of the page inert while the sheet is open.
  useEffect(() => {
    if (!modal) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-inert-under-sheet]'));
    nodes.forEach((n) => (n.inert = true));
    if (!sheetRef.current?.contains(document.activeElement))
      headingRef.current?.focus({ preventScroll: true });
    return () => nodes.forEach((n) => (n.inert = false));
  }, [modal]);

  // Server render and hydration use the final position (so the sheet is visible without JS);
  // client-side opens animate in.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <m.section
      key="country-sheet"
      ref={sheetRef}
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={headingId}
      data-testid="country-sheet"
      data-mode={modal ? 'dialog' : 'panel'}
      initial={hydrated ? (isDesktop ? { opacity: 0, x: 24 } : { y: '100%' }) : false}
      animate={isDesktop ? { opacity: 1, x: 0 } : { y: 0 }}
      exit={isDesktop ? { opacity: 0, x: 24 } : { y: '100%' }}
      transition={transition}
      drag={modal ? 'y' : false}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120 || info.velocity.y > 700) close();
      }}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[86dvh] flex-col rounded-t-2xl border-t border-border-strong bg-surface shadow-2xl lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:z-20 lg:h-auto lg:w-[var(--sheet-w)] lg:rounded-none lg:border-t-0 lg:border-l lg:border-border lg:shadow-none"
    >
      {modal ? (
        <div
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
          aria-hidden="true"
          data-testid="sheet-handle"
        >
          <span className="h-1.5 w-12 rounded-full bg-border-strong" />
        </div>
      ) : null}
      <header className="shrink-0 border-b border-border px-4 pt-2 pb-3 lg:pt-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none"
            >
              {title}
            </h2>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
          <NavAnchor
            href={closeHref}
            onClick={() => {
              try {
                sessionStorage.setItem(RESTORE_FOCUS_KEY, iso2);
              } catch {
                // ignore
              }
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border-strong text-text no-underline hover:bg-surface-raised"
            aria-label={`Close ${title}`}
            data-testid="sheet-close"
          >
            <CloseIcon />
          </NavAnchor>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="safe-bottom relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
        aria-busy={nav?.pending || undefined}
        data-testid="sheet-scroll"
      >
        {nav?.pending ? (
          <div
            className="sticky top-0 z-10 h-0.5 w-full overflow-hidden bg-border"
            role="status"
            aria-label="Loading"
          >
            <div className="h-full w-1/3 animate-pulse bg-accent" />
          </div>
        ) : null}
        {/* Notices, sectors and filters scroll with the stories so nothing is ever pushed
            off-screen on short (mobile) viewports; only the title row stays fixed. */}
        {header ? <div className="space-y-3 border-b border-border py-3">{header}</div> : null}
        {children}
      </div>
    </m.section>
  );
}
