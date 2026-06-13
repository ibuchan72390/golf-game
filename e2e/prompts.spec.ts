import { expect, test } from '@playwright/test';

test('hold-and-release prompts walk the stages', async ({ page }) => {
  await page.goto('/?round=42');
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await expect(page.locator('#hud-prompt')).toHaveText('HOLD TO CHARGE');
  await page.locator('#game-canvas').dispatchEvent('pointerdown', { pointerId: 1 });
  await expect(page.locator('#hud-prompt')).toHaveText('RELEASE TO SET POWER');
  await page.locator('#game-canvas').dispatchEvent('pointerup', { pointerId: 1 });
  await expect(page.locator('#hud-prompt')).toHaveText('TAP THE GREEN BAND');
});
