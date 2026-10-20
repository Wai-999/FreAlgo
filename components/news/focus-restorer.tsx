'use client';

import { useEffect } from 'react';
import { RESTORE_FOCUS_KEY } from './country-sheet';

const RESTORE_TARGET_KEY = 'frealgo:restore-target';

/**
 * After the country sheet closes, return focus to the control that opened it (the country's
 * entry in the list), or to the map region if the list is not visible.
 */
export function FocusRestorer({ sheetOpen }: { sheetOpen: boolean }) {
  useEffect(() => {
    if (sheetOpen) return;
    let iso2: string | null = null;
    let target: string | null = null;
    try {
      iso2 = sessionStorage.getItem(RESTORE_FOCUS_KEY);
      target = sessionStorage.getItem(RESTORE_TARGET_KEY);
      sessionStorage.removeItem(RESTORE_FOCUS_KEY);
      sessionStorage.removeItem(RESTORE_TARGET_KEY);
    } catch {
      return;
    }
    if (!iso2) return;
    // Opened from the globe: return focus to the globe.
    const globe = document.querySelector<HTMLElement>('[data-globe-focus]');
    if (target === 'globe' && globe) {
      globe.focus();
      return;
    }
    const link = document.querySelector<HTMLElement>(`a[data-country="${CSS.escape(iso2)}"]`);
    if (link && link.offsetParent !== null) {
      link.focus();
      link.scrollIntoView({ block: 'nearest' });
      return;
    }
    document.querySelector<HTMLElement>('[data-focus-fallback]')?.focus();
  }, [sheetOpen]);
  return null;
}
