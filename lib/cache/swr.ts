/**
 * Tiny in-process stale-while-revalidate cache for hot, non-personal reads (country summaries,
 * sectors, outlet registry). Fresh for `ttlMs`; served stale for up to `staleMs` while one
 * background refresh runs; errors during refresh keep serving the stale value.
 */
interface Entry<T> {
  value: T;
  at: number;
  refreshing?: Promise<void>;
}

const store = new Map<string, Entry<unknown>>();
/** Cold loads in flight, so concurrent misses share one query instead of stampeding the DB. */
const pending = new Map<string, Promise<unknown>>();

export async function swr<T>(
  key: string,
  ttlMs: number,
  staleMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < ttlMs) return hit.value;
  if (hit && now - hit.at < ttlMs + staleMs) {
    if (!hit.refreshing) {
      hit.refreshing = load()
        .then((value) => {
          store.set(key, { value, at: Date.now() });
        })
        .catch(() => {
          hit.refreshing = undefined;
        });
    }
    return hit.value;
  }
  const inflight = pending.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;
  const p = load()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

export function invalidate(prefix = ''): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
