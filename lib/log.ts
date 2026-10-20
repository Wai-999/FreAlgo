import pino, { type Logger } from 'pino';

/**
 * Structured JSON logger. Never log request bodies, cookies, auth headers, IP addresses or
 * user identifiers; the redaction list is a safety net, not a licence to log secrets.
 */
let root: Logger | undefined;

export function getLogger(): Logger {
  root ??= pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    base: { service: process.env.SERVICE_NAME ?? 'web' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'headers.cookie',
        'headers.authorization',
        '*.password',
        '*.token',
        '*.secret',
        'contactEmail',
      ],
      censor: '[redacted]',
    },
  });
  return root;
}

export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}
