'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFERENCES,
  PREFS_STORAGE_KEY,
  parsePreferences,
  serializePreferences,
  type Preferences,
} from './schema';

/**
 * Browser-local preference store (the default and only store for anonymous users).
 * Subscribers update across components and across tabs (storage event).
 */
const EVENT = 'frealgo:prefs';
let cache: { raw: string | null; value: Preferences } | undefined;

function read(): Preferences {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_STORAGE_KEY);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (cache && cache.raw === raw) return cache.value;
  cache = { raw, value: parsePreferences(raw) };
  return cache.value;
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === PREFS_STORAGE_KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function writePreferences(next: Preferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, serializePreferences(next));
  } catch {
    // Storage disabled (private mode etc.): preferences simply don't persist.
  }
  applyDocumentPreferences(next);
  window.dispatchEvent(new Event(EVENT));
}

export function clearPreferences(): void {
  try {
    localStorage.removeItem(PREFS_STORAGE_KEY);
  } catch {
    // ignore
  }
  applyDocumentPreferences(DEFAULT_PREFERENCES);
  window.dispatchEvent(new Event(EVENT));
}

/** Mirrors the head boot script so changes apply immediately without reload. */
export function applyDocumentPreferences(p: Preferences): void {
  const d = document.documentElement;
  if (p.motion === 'system') delete d.dataset.motion;
  else d.dataset.motion = p.motion;
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void, boolean] {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFERENCES);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const update = useCallback(
    (patch: Partial<Preferences>) => writePreferences({ ...read(), ...patch }),
    [],
  );
  return [prefs, update, hydrated];
}
