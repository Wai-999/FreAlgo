import { test as base, expect } from '@playwright/test';

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
