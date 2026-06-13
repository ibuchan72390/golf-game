import { expect, test } from '@playwright/test';

test.skip(!process.env.CI && !process.env.RUN_VISUAL, 'visual snapshots run in CI (or RUN_VISUAL=1)');

async function ready(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true);
  await page.waitForTimeout(800);
}

test('menu', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#menu-play')).toBeVisible();
  await expect(page).toHaveScreenshot('menu.png');
});

test('round aiming view (hole 1)', async ({ page }) => {
  // Boots into a round; snapshots the first hole's behind-ball aiming view.
  // (For a guaranteed par-5/dogleg shot, pick a round seed whose hole 1 is par-5
  //  by inspecting ?dev=courses, and use it here — otherwise hole 1 is fine.)
  await page.goto('/?round=42&instant=1');
  await ready(page);
  await expect(page).toHaveScreenshot('round-aiming.png');
});

test('course-select', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('#menu-play').click();
  await expect(page.locator('#course-random')).toBeVisible();
  await expect(page).toHaveScreenshot('course-select.png');
});

test('upgrade screen', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => (window as unknown as { __golfTest: { grantPoints?(n: number): void } }).__golfTest.grantPoints?.(50));
  await page.locator('#menu-upgrade').click();
  await expect(page).toHaveScreenshot('upgrade.png');
});

test('course gallery', async ({ page }) => {
  await page.goto('/?dev=courses');
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('dev-courses.png', { fullPage: true });
});
