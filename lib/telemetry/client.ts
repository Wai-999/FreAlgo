'use client';

/**
 * Anonymous client health counters (e.g. "WebGL unavailable"). One event of each kind per
 * browser session, no identifiers, no user agent, never sent when the browser signals Global
 * Privacy Control or Do Not Track.
 */
import type { ClientEvent } from './events';

export function sendClientEvent(event: ClientEvent): void {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl || nav.doNotTrack === '1') return;
    const key = `frealgo:evt:${event}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    void fetch('/api/v1/telemetry/client', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Telemetry must never affect the experience.
  }
}
