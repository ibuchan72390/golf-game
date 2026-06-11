import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __golfTest: {
      ready: boolean;
      getState(): { phase: string; strokes: number; ballPos: { x: number; y: number; z: number }; holedOut: boolean };
      swing(intent: { club?: string; aimDir?: number; power?: number; contactError?: number }): void;
    };
  }
}

test('drive then putt out on a fixed seed', async ({ page }) => {
  await page.goto('/?seed=42&instant=1');
  await page.waitForFunction(() => window.__golfTest?.ready === true);

  const initial = await page.evaluate(() => window.__golfTest.getState());
  expect(initial.phase).toBe('aiming');
  expect(initial.strokes).toBe(0);

  await page.evaluate(() => window.__golfTest.swing({ club: 'driver', power: 1, contactError: 0 }));
  await page.waitForFunction(() => window.__golfTest.getState().phase === 'aiming');
  const afterDrive = await page.evaluate(() => window.__golfTest.getState());
  expect(afterDrive.strokes).toBe(1);
  expect(afterDrive.ballPos.z).toBeLessThan(-100);

  // Keep swinging toward the hole until it drops (deterministic, so bounded).
  // Power formulas are derived from the sim: linear damping k=0.3 means a rolling
  // ball loses ~0.3 m/s per meter, and the cup captures below 3 m/s — so the
  // putter aims to arrive at ~2 m/s. Airborne clubs use the vacuum-range formula
  // v = sqrt(g·dist / sin(2·launch)); drag makes them land short, which converges.
  for (let i = 0; i < 12; i++) {
    const s = await page.evaluate(() => window.__golfTest.getState());
    if (s.holedOut) break;
    const dist = Math.hypot(s.ballPos.x, s.ballPos.z + 150);
    const club = dist > 120 ? 'iron7' : dist > 25 ? 'wedge' : 'putter';
    const power =
      club === 'putter'
        ? Math.min(1, (2 + 0.3 * dist) / 12)
        : club === 'wedge'
          ? Math.min(1, Math.sqrt(9.81 * dist) / 30)
          : Math.min(1, Math.sqrt((9.81 * dist) / 0.69) / 50);
    await page.evaluate(
      ([c, p]) => window.__golfTest.swing({ club: c as string, power: p as number, contactError: 0 }),
      [club, power],
    );
    await page.waitForFunction(() => {
      const st = window.__golfTest.getState();
      return st.phase === 'aiming' || st.phase === 'holed';
    });
  }

  const final = await page.evaluate(() => window.__golfTest.getState());
  expect(final.holedOut).toBe(true);
  await expect(page.locator('#hud-msg')).toBeVisible();
});

test('HUD shows strokes and distance', async ({ page }) => {
  await page.goto('/?seed=42&instant=1');
  await page.waitForFunction(() => window.__golfTest?.ready === true);
  await expect(page.locator('#hud-top')).toContainText('Strokes: 0');
  await expect(page.locator('#hud-top')).toContainText('150 m');
});
