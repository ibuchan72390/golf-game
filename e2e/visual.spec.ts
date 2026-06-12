import { expect, test } from '@playwright/test';

test.skip(!process.env.CI && !process.env.RUN_VISUAL, 'visual snapshots run in CI (or RUN_VISUAL=1)');

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await page.waitForTimeout(800); // camera follower settles
}

test('aiming view on generated seed 42', async ({ page }) => {
  await page.goto('/?seed=42');
  await ready(page);
  await expect(page).toHaveScreenshot('aiming-gen-seed42.png');
});

test('putting view on seed 42', async ({ page }) => {
  await page.goto('/?seed=42');
  await ready(page);
  await page.evaluate(() => {
    const t = (window as unknown as {
      __golfTest: { pin: { x: number; z: number }; placeBall(x: number, z: number): void };
    }).__golfTest;
    t.placeBall(t.pin.x, t.pin.z + 3);
  });
  await page.waitForTimeout(800); // camera eases into the putting pose
  await expect(page).toHaveScreenshot('putting-seed42.png');
});

test('course gallery', async ({ page }) => {
  await page.goto('/?dev=courses');
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('dev-courses.png', { fullPage: true });
});
