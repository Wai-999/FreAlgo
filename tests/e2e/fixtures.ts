import { test as base, expect, type Page } from '@playwright/test';

/**
 * Default e2e fixture: the browser behaves like a device without WebGL, so every spec except
 * globe.spec.ts exercises the 2D fallback deterministically on all engines (headless Firefox and
 * WebKit otherwise render the 3D globe in software, which is slow and not what those specs test).
 */
export const test = base.extend<{ noWebGL: void }>({
  noWebGL: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const proto = HTMLCanvasElement.prototype as unknown as {
          getContext: (this: HTMLCanvasElement, type: string, ...args: unknown[]) => unknown;
        };
        const original = proto.getContext;
        proto.getContext = function (type: string, ...args: unknown[]) {
          if (/webgl/i.test(type)) return null;
          return original.call(this, type, ...args);
        };
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Lets the page come to rest before an accessibility scan: network quiet (best effort; a loaded
 * CI host may never be idle for 500 ms) and every finite CSS animation finished, such as the
 * 1.1 s welcome intro. Scanning mid-fade measures a transient, partly transparent state, which
 * made contrast results depend on runner speed.
 */
export async function settleForAxe(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.race([
      Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  });
}
