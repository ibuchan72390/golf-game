import { expect, test } from '@playwright/test';

test('buying an upgrade persists across reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__golfTest?.ready === true);
  // seed points directly via the test hook (added below) so we don't play a full round
  await page.evaluate(() => window.__golfTest.grantPoints?.(100));
  await page.locator('#menu-upgrade').click();
  await page.locator('#club-driver').click();
  await page.locator('#buy-power').click();
  const after = await page.evaluate(() => window.__golfTest.profileState());
  expect(after.driverPower).toBe(1);
  expect(after.skillPoints).toBeLessThan(100);

  await page.reload();
  await page.waitForFunction(() => window.__golfTest?.ready === true);
  const reloaded = await page.evaluate(() => window.__golfTest.profileState());
  expect(reloaded.driverPower).toBe(1); // persisted
});
