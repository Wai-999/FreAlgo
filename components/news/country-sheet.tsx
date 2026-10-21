'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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

/** Drag distance (px) or release speed (px/s) that closes the mobile sheet. */
const CLOSE_OFFSET = 120;
const CLOSE_VELOCITY = 700;
/** The sheet follows the finger with some resistance. */
const DRAG_RESISTANCE = 0.6;

/** Present while the last sheet plays its exit transition; call it when the transition ends. */
const SheetExitContext = createContext<(() => void) | null>(null);

/**
 * Keeps the sheet mounted across country changes (spatial memory). When the URL closes it, the
 * last sheet stays on screen until its CSS exit animation (app/globals.css) has finished.
 */
export function SheetPresence({ children }: { children: ReactNode }) {
  const [last, setLast] = useState<ReactNode>(children);
  if (children && children !== last) setLast(children);
  const onExited = useCallback(() => setLast(null), []);
  const exiting = !children && !!last;
  return (
    <SheetExitContext.Provider value={exiting ? onExited : null}>
      {children || (exiting ? last : null)}
    </SheetExitContext.Provider>
  );
}

/**
 * Country sheet.
 *  Desktop (≥1024px): anchored, non-modal side panel (role=region); the map stays usable.
 *  Mobile: modal bottom sheet (role=dialog, aria-modal) with drag handle, explicit close button,
 *  focus trap, inert background and Escape. Without JavaScript it renders in place with a close link.
 * Transitions are CSS (`.country-sheet` in app/globals.css), so they honour reduced motion.
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
  const nav = useWorkspaceNav();
  const onExited = useContext(SheetExitContext);
  const closing = onExited !== null;
  const headingId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; y: number; t: number; v: number }>(null);
  const dialog = !isDesktop;
  // A closing sheet no longer traps focus or keeps the page inert.
  const modal = dialog && !closing;
  const lastIso = useRef<string | null>(null);

  // Server render and hydration paint the sheet in its final position (visible without JS and
  // not delayed by an animation); only sheets opened on the client animate in.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [animateIn] = useState(hydrated);

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
    if (closing) return;
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
  }, [modal, closing, closeHref, iso2]);

  // Modal on mobile: make the rest of the page inert while the sheet is open.
  useEffect(() => {
    if (!modal) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-inert-under-sheet]'));
    nodes.forEach((n) => (n.inert = true));
    if (!sheetRef.current?.contains(document.activeElement))
      headingRef.current?.focus({ preventScroll: true });
    return () => nodes.forEach((n) => (n.inert = false));
  }, [modal]);

  // Unmount after the exit animation; the timer covers browsers that skip animation events.
  // Reopened before that (another country picked): drop any offset left by a drag-to-close.
  useEffect(() => {
    if (!onExited) {
      if (!drag.current) sheetRef.current?.style.removeProperty('transform');
      return;
    }
    const timer = window.setTimeout(onExited, 400);
    return () => window.clearTimeout(timer);
  }, [onExited]);

  // Mobile drag handle: drag the sheet down to close it, or release to snap back.
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!modal || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      y: e.clientY,
      t: e.timeStamp,
      v: 0,
    };
    sheetRef.current?.setAttribute('data-dragging', '');
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !sheetRef.current) return;
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = ((e.clientY - d.y) / dt) * 1000;
    d.y = e.clientY;
    d.t = e.timeStamp;
    const offset = Math.max(0, e.clientY - d.startY) * DRAG_RESISTANCE;
    sheetRef.current.style.transform = `translateY(${offset}px)`;
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    sheetRef.current?.removeAttribute('data-dragging');
    // A pause before release means the finger stopped: no fling.
    const velocity = e.timeStamp - d.t > 100 ? 0 : d.v;
    const dismiss =
      e.type === 'pointerup' && (e.clientY - d.startY > CLOSE_OFFSET || velocity > CLOSE_VELOCITY);
    // Closing continues from the dragged position (exit animation); otherwise snap back.
    if (dismiss && nav) close();
    else sheetRef.current?.style.removeProperty('transform');
  };

  return (
    <section
      ref={sheetRef}
      role={dialog ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={headingId}
      inert={closing || undefined}
      data-testid="country-sheet"
      data-mode={dialog ? 'dialog' : 'panel'}
      data-state={closing ? 'closing' : 'open'}
      data-enter={animateIn ? '' : undefined}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onExited?.();
      }}
      className="country-sheet fixed inset-x-0 bottom-0 z-30 flex h-[86dvh] flex-col rounded-t-2xl border-t border-border-strong bg-surface shadow-2xl lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:z-20 lg:h-auto lg:w-[var(--sheet-w)] lg:rounded-none lg:border-t-0 lg:border-l lg:border-border lg:shadow-none"
    >
      {dialog ? (
        <div
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
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
    </section>
  );
}
