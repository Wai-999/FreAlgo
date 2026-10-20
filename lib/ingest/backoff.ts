/**
 * Retry and circuit-breaker policy.
 *
 * Job level (transient errors inside one scheduled attempt): exponential backoff with jitter,
 *   30s, 60s, 120s ... capped at 10 min, randomised to 50–150% to avoid thundering herds.
 * Source level (consecutive failed scheduled attempts): the source's next eligible fetch moves
 *   out exponentially from the 3-hour cadence (3h, 6h, 12h, 24h, then 48h), and after
 *   MAX_CONSECUTIVE_FAILURES the source is set to ERROR (circuit open) until an operator resets it.
 */
export const JOB_ATTEMPTS = 3;
export const MAX_CONSECUTIVE_FAILURES = 8;
const JOB_BASE_MS = 30_000;
const JOB_CAP_MS = 10 * 60_000;
const CADENCE_MS = 3 * 3_600_000;
const CIRCUIT_CAP_MS = 48 * 3_600_000;

export function jobBackoffMs(attemptsMade: number, random: () => number = Math.random): number {
  const exp = Math.min(JOB_CAP_MS, JOB_BASE_MS * 2 ** Math.max(0, attemptsMade - 1));
  return Math.round(exp * (0.5 + random()));
}

export function circuitDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(CIRCUIT_CAP_MS, CADENCE_MS * 2 ** (consecutiveFailures - 1));
}

export function nextEligibleAfterFailure(now: Date, consecutiveFailures: number): Date {
  return new Date(now.getTime() + circuitDelayMs(consecutiveFailures));
}

export function shouldOpenCircuit(consecutiveFailures: number): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}
