import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __golfTest: {
      ready: boolean;
      getState(): {
        phase: string; strokes: number; ballPos: { x: number; y: number; z: number };
        holedOut: boolean; lie: number; distToPin: number; club: string;
      };
      swing(intent: { club?: string; aimDir?: number; power?: number; contactError?: number }): void;
      placeBall(x: number, z: number): void;
    };
  }
}

const SAND = 3, GREEN = 2, ROUGH = 1;

test('plays a generated par-3 to the cup on a fixed seed', async ({ page }) => {
  await page.goto('/?seed=42&instant=1');
  await page.waitForFunction(() => window.__golfTest?.ready === true);

  const initial = await page.evaluate(() => window.__golfTest.getState());
  expect(initial.phase).toBe('aiming');
  expect(initial.strokes).toBe(0);
  expect(initial.distToPin).toBeGreaterThan(85);

  // Auto-caddie: club by distance/lie; power compensates the lie penalty.
  // Putter power is in FULL-BAR units (Game rescales the bar to the distance),
  // so a firm 0.8 bar is always a reasonable putt.
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => window.__golfTest.getState());
    if (s.holedOut) break;
    const d = s.distToPin;
    let club: string, power: number;
    if (s.lie === GREEN) {
      club = 'putter';
      power = 0.8;
    } else if (s.lie === SAND) {
      club = 'wedge';
      power = Math.min(1, (Math.sqrt(9.81 * Math.max(d, 5)) / 30) / 0.85);
    } else {
      club = d > 140 ? 'driver' : d > 60 ? 'iron7' : 'wedge';
      const v = club === 'driver' ? Math.sqrt((9.81 * d) / 0.47) / 70 : club === 'iron7' ? Math.sqrt((9.81 * d) / 0.69) / 50 : Math.sqrt(9.81 * d) / 30;
      power = Math.min(1, s.lie === ROUGH ? v / 0.72 : v);
    }
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

test('HUD shows par, strokes, and distance', async ({ page }) => {
  await page.goto('/?seed=42&instant=1');
  await page.waitForFunction(() => window.__golfTest?.ready === true);
  await expect(page.locator('#hud-top')).toContainText('Par 3');
  await expect(page.locator('#hud-top')).toContainText('Strokes: 0');
  await expect(page.locator('#hud-top')).toContainText('m');
});
