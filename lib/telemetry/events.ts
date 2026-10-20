/** Allow-listed anonymous client health events (shared by the client sender and the API). */
export const CLIENT_EVENTS = [
  'globe_ready',
  'webgl_unavailable',
  'webgl_software_renderer',
  'webgl_context_lost',
  'globe_fallback',
  'globe_quality_downgraded',
  'globe_load_error',
] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
