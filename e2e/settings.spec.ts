import { expect, test } from '@playwright/test';

test('input scheme switches and persists across reload', async ({ page }) => {
  await page.goto('/?round=42');
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await page.locator('#hud-gear').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await page.locator('#scheme-threeClick').check();
  await expect(page.locator('#hud-prompt')).toHaveText('CLICK TO START YOUR SWING');

  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await expect(page.locator('#hud-prompt')).toHaveText('CLICK TO START YOUR SWING');
});
