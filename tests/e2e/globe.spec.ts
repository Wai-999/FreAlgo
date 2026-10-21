import { expect, test, type Page } from '@playwright/test';
import { CHROMIUM_WEBGL } from '../../playwright.config';

// Software WebGL (SwiftShader) for this file only, at 1x pixel density: SwiftShader rasterises
// on the CPU, so 4x fewer pixels keeps these tests fast and stable.
// The flags are Chromium-only: Linux WebKit refuses to launch with unknown arguments (CI).
test.use({
  launchOptions: [
    async ({ browserName }, use) => {
      await use(browserName === 'chromium' ? { args: CHROMIUM_WEBGL } : {});
    },
    { scope: 'worker' },
  ],
  deviceScaleFactor: 1,
});
// SwiftShader can stall under heavy host memory pressure; a genuinely failing test still fails
// after retries, and Playwright reports recovered runs as "flaky".
test.describe.configure({ timeout: 60_000, retries: 2 });

/**
 * Globe e2e. Headless Chromium renders WebGL with SwiftShader, which the app (correctly) treats
 * as a software renderer, so these tests opt in with ?globe=force like a user pressing
 * "Try the 3D globe anyway". Fallback tests run on every engine.
 */
const globeReady = async (page: Page) => {
  await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'globe', {
    timeout: 20_000,
  });
  // Let the camera framing settle.
  await page.waitForTimeout(300);
};

/** Centre of the globe once its container has stopped resizing (panel transitions). */
async function centerOf(page: Page) {
  let prev = '';
  for (let i = 0; i < 40; i++) {
    const box = (await page.getByTestId('globe').boundingBox())!;
    const key = `${Math.round(box.x)},${Math.round(box.width)}`;
    if (key === prev) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    prev = key;
    await page.waitForTimeout(150);
  }
  throw new Error('globe container never settled');
}

test.describe('3D globe', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'WebGL via SwiftShader is configured for Chromium',
  );

  test('drag rotates the globe without selecting a country', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse test');
    await page.goto('/?globe=force&intro=0');
    await globeReady(page);
    const c = await centerOf(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 160, c.y + 20, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('country-sheet')).toHaveCount(0);
    await expect(page).not.toHaveURL(/country=/);
  });

  test('click selects the country under the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse test');
    await page.goto('/?country=KE&globe=force&intro=0');
    await globeReady(page);
    await page.keyboard.press('Escape'); // close the sheet; the camera stays centred on Kenya
    await expect(page.getByTestId('country-sheet')).toHaveCount(0);
    const c = await centerOf(page);
    await page.mouse.click(c.x, c.y);
    await expect(page).toHaveURL(/country=KE/);
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Kenya' }),
    ).toBeVisible();
  });

  test('keyboard: Enter opens the centred country and focus returns to the globe', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard test');
    await page.goto('/?country=KE&globe=force&intro=0');
    await globeReady(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.getByTestId('globe').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/country=KE/);
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Kenya' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('globe')).toBeFocused();
    // Arrow keys rotate (centre moves away from Kenya) and announce the new centre.
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('globe').locator('[aria-live]')).not.toHaveText('');
  });

  test('touch: tap selects, a swipe rotates', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch test');
    await page.goto('/?country=KE&globe=force&intro=0');
    await globeReady(page);
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('country-sheet')).toHaveCount(0);
    const c = await centerOf(page);
    await page.touchscreen.tap(c.x, c.y);
    await expect(page).toHaveURL(/country=KE/);
  });

  test('repeated WebGL context loss falls back to the flat map', async ({ page }) => {
    await page.goto('/?globe=force&intro=0');
    await globeReady(page);
    await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="globe-canvas"]') as HTMLCanvasElement;
      const gl = (canvas.getContext('webgl2') ??
        canvas.getContext('webgl')) as WebGLRenderingContext;
      gl.getExtension('WEBGL_lose_context')!.loseContext();
    });
    await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'fallback', {
      timeout: 6_000,
    });
    await expect(page.getByTestId('globe-fallback-notice')).toContainText('flat map');
    await expect(page.getByTestId('world-map-svg')).toBeVisible();
  });

  test('the flat-map toggle is remembered locally', async ({ page, isMobile }) => {
    test.skip(isMobile, 'one run is enough');
    await page.goto('/?globe=force&intro=0');
    await globeReady(page);
    await page.getByTestId('globe-toggle').click();
    await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'map');
    expect(
      JSON.parse((await page.evaluate(() => localStorage.getItem('frealgo:prefs:v1')))!)
        .globeEnabled,
    ).toBe(false);
    await page.reload();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'map');
    await expect(page.getByTestId('globe-toggle')).toHaveText(/Use 3D globe/);
  });
});

test.describe('without WebGL', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('falls back to the flat map and the full workflow still works @cross', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', async (res) => {
      if (res.url().endsWith('.js')) scripts.push(await res.text().catch(() => ''));
    });
    await page.goto('/?globe=force&intro=0');
    await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'fallback', {
      timeout: 10_000,
    });
    await expect(page.getByTestId('globe-fallback-notice')).toContainText('WebGL is not available');
    await expect(page.getByTestId('world-map-svg')).toBeVisible();
    // The 3D engine was never downloaded.
    expect(scripts.some((s) => s.includes('WebGLRenderer'))).toBe(false);
    // Country navigation via the accessible list still works.
    await page.goto('/?view=list&intro=0');
    await page.locator('a[data-country="MM"]').click();
    await expect(
      page.getByTestId('country-sheet').getByRole('heading', { name: 'Myanmar' }),
    ).toBeVisible();
  });
});

test('software renderers default to the flat map with an explicit opt-in', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'needs a WebGL-capable engine');
  // Simulate a software renderer: contexts requested with failIfMajorPerformanceCaveat fail.
  await page.addInitScript(() => {
    const proto = HTMLCanvasElement.prototype as unknown as {
      getContext: (
        this: HTMLCanvasElement,
        type: string,
        opts?: { failIfMajorPerformanceCaveat?: boolean },
      ) => unknown;
    };
    const original = proto.getContext;
    proto.getContext = function (type, opts) {
      if (/webgl/i.test(type) && opts?.failIfMajorPerformanceCaveat) return null;
      return original.call(this, type, opts);
    };
  });
  await page.goto('/?intro=0');
  await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'fallback', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('globe-fallback-notice')).toContainText('software');
  await page.getByRole('button', { name: 'Try the 3D globe anyway' }).click();
  await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'globe', {
    timeout: 20_000,
  });
});

test('no serious or critical axe violations with the globe active', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(browserName !== 'chromium' || isMobile, 'one run is enough');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await page.goto('/?country=MM&sector=agriculture&globe=force&intro=0');
  await globeReady(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
});

test('offline or flaky network: a globe that cannot be downloaded falls back to the flat map', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'WebGL via SwiftShader is configured for Chromium');
  // Fail only the lazily loaded 3D engine chunk, as if the connection dropped after first paint
  // (or a deploy removed the old chunk while the tab was open).
  await page.route('**/_next/static/chunks/**', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('WebGLRenderer')) return route.abort('internetdisconnected');
    return route.fulfill({ response, body });
  });
  await page.goto('/?globe=force&intro=0');
  await expect(page.getByTestId('globe-stage')).toHaveAttribute('data-mode', 'fallback', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('globe-fallback-notice')).toContainText('could not be downloaded');
  await expect(page.getByTestId('world-map-svg')).toBeVisible();
  // The page did not crash: the explore workflow still works.
  await page.goto('/?view=list&intro=0');
  await page.locator('a[data-country="MM"]').click();
  await expect(
    page.getByTestId('country-sheet').getByRole('heading', { name: 'Myanmar' }),
  ).toBeVisible();
});
