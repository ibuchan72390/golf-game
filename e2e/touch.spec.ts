import { expect, test } from '@playwright/test';

async function inHole(page: import('@playwright/test').Page) {
  await page.goto('/?round=42&instant=1');
  await page.waitForFunction(() => window.__golfTest?.ready === true);
  await page.waitForFunction(() => window.__golfTest.getState()?.phase === 'aiming');
}

test('touch: aim arrow rotates the aim', async ({ page }) => {
  await inHole(page);
  const before = (await page.evaluate(() => window.__golfTest.getState()))!.aimDir;
  await page.locator('#aim-right').dispatchEvent('pointerdown', { pointerId: 1 });
  await page.locator('#aim-right').dispatchEvent('pointerup', { pointerId: 1 });
  const after = (await page.evaluate(() => window.__golfTest.getState()))!.aimDir;
  expect(after).not.toBe(before);
});

test('touch: putter is reachable in the wrapped club selector', async ({ page }) => {
  await inHole(page);
  const putter = page.locator('#club-putter');
  await expect(putter).toBeVisible();
  await expect(putter).toBeInViewport(); // wrapped layout keeps it on-screen
  await putter.click();
  expect((await page.evaluate(() => window.__golfTest.getState()))!.club).toBe('putter');
});

test('desktop: keyboard arrow still aims', async ({ page }) => {
  await inHole(page);
  const before = (await page.evaluate(() => window.__golfTest.getState()))!.aimDir;
  await page.keyboard.press('ArrowRight');
  const after = (await page.evaluate(() => window.__golfTest.getState()))!.aimDir;
  expect(after).not.toBe(before);
});
