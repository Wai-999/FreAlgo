/**
 * Typed ingestion errors. `retryable` decides whether BullMQ should retry the job; `code` is
 * stored on IngestionRun/FeedSource for operators and the public freshness page.
 */
export class IngestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(code: string, message: string, opts: { retryable: boolean; httpStatus?: number }) {
    super(message);
    this.name = 'IngestError';
    this.code = code;
    this.retryable = opts.retryable;
    this.httpStatus = opts.httpStatus;
  }
}

export const blocked = (message: string) =>
  new IngestError('SSRF_BLOCKED', message, { retryable: false });
export const invalidUrl = (message: string) =>
  new IngestError('INVALID_URL', message, { retryable: false });
export const timeout = (message: string) =>
  new IngestError('TIMEOUT', message, { retryable: true });
export const tooLarge = (message: string) =>
  new IngestError('RESPONSE_TOO_LARGE', message, { retryable: false });
export const network = (message: string) =>
  new IngestError('NETWORK_ERROR', message, { retryable: true });
export const badContentType = (message: string) =>
  new IngestError('UNSUPPORTED_CONTENT_TYPE', message, { retryable: false });
export const robotsDisallowed = (message: string) =>
  new IngestError('ROBOTS_DISALLOWED', message, { retryable: false });
/** robots.txt could not be fetched (5xx/network): retry later, don't open the circuit. */
export const robotsUnreachable = (message: string) =>
  new IngestError('ROBOTS_UNREACHABLE', message, { retryable: true });
export const parseError = (message: string) =>
  new IngestError('PARSE_ERROR', message, { retryable: false });
export const configError = (message: string) =>
  new IngestError('CONFIG_ERROR', message, { retryable: false });

export function httpError(status: number): IngestError {
  // 408/425/429 and 5xx are transient; other 4xx mean "fix the registry entry".
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  return new IngestError(`HTTP_${status}`, `Publisher responded with HTTP ${status}`, {
    retryable,
    httpStatus: status,
  });
}

export function toIngestError(err: unknown): IngestError {
  if (err instanceof IngestError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new IngestError('UNEXPECTED', message.slice(0, 500), { retryable: true });
}
