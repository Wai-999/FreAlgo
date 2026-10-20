'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** Renders the viewer's local time after hydration; the server renders nothing (UTC is shown already). */
export function LocalTime({ iso }: { iso: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!isClient) return null;
  const d = new Date(iso);
  // dateStyle/timeStyle cannot be combined with timeZoneName, so list the fields explicitly.
  const text = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
  return <span className="text-muted"> · your time {text}</span>;
}
