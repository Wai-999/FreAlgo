import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidate, swr } from '@/lib/cache/swr';

describe('swr cache', () => {
  afterEach(() => {
    invalidate();
    vi.useRealTimers();
  });

  it('shares one load between concurrent cold misses (no stampede)', async () => {
    let calls = 0;
    const load = () =>
      new Promise<number>((resolve) => {
        calls += 1;
        setTimeout(() => resolve(42), 10);
      });
    const results = await Promise.all(Array.from({ length: 20 }, () => swr('k', 1000, 1000, load)));
    expect(results).toEqual(Array(20).fill(42));
    expect(calls).toBe(1);
  });

  it('does not cache a failed cold load, so the next request retries', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(7);
    await expect(swr('f', 1000, 1000, failing)).rejects.toThrow('db down');
    await expect(swr('f', 1000, 1000, failing)).resolves.toBe(7);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('serves stale while one background refresh runs, then the fresh value', async () => {
    vi.useFakeTimers();
    let release: (v: number) => void = () => {};
    const load = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(() => new Promise<number>((r) => (release = r)));
    expect(await swr('s', 100, 1000, load)).toBe(1);
    vi.advanceTimersByTime(150);
    expect(await swr('s', 100, 1000, load)).toBe(1); // stale; refresh started
    expect(await swr('s', 100, 1000, load)).toBe(1); // still stale; refresh not duplicated
    release(2);
    await vi.runAllTimersAsync();
    expect(await swr('s', 100, 1000, load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
