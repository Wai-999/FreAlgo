'use client';

import { useEffect } from 'react';
import { RESTORE_FOCUS_KEY } from './country-sheet';

/**
 * After the country sheet closes, return focus to the control that opened it (the country's
 * entry in the list), or to the map region if the list is not visible.
 */
export function FocusRestorer({ sheetOpen }: { sheetOpen: boolean }) {
  useEffect(() => {
    if (sheetOpen) return;
    let iso2: string | null = null;
    try {
      iso2 = sessionStorage.getItem(RESTORE_FOCUS_KEY);
      sessionStorage.removeItem(RESTORE_FOCUS_KEY);
    } catch {
      return;
    }
    if (!iso2) return;
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
