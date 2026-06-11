import { expect, test } from '@playwright/test';

test.skip(!process.env.CI && !process.env.RUN_VISUAL, 'visual snapshots run in CI (or RUN_VISUAL=1)');

test('aiming view on seed 42', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await page.waitForTimeout(500); // let first frames settle
  await expect(page).toHaveScreenshot('aiming-seed42.png');
});
