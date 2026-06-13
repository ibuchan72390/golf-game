import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __golfTest: {
      ready: boolean;
      getState(): { phase: string; holedOut: boolean; lie: number; distToPin: number; club: string; ballPos: { x: number; y: number; z: number } };
      swing(intent: { club?: string; power?: number; contactError?: number }): void;
      roundState(): { phase: string; index: number; total: number; pars: number[] } | null;
      nextHole(): void;
    };
  }
}

const GREEN = 2, SAND = 3, ROUGH = 1;

async function holeOutCurrent(page: import('@playwright/test').Page) {
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => window.__golfTest.getState());
    if (s.holedOut) return;
    const d = s.distToPin;
    let club: string, power: number;
    // Strand-2 checkpoint uses the M2 4-club bag (driver/iron7/wedge/putter).
    // Task 11 Step 6 broadens this to the 8-club ids once Strand 3 lands.
    if (s.lie === GREEN) { club = 'putter'; power = 0.85; }
    else if (s.lie === SAND) { club = 'wedge'; power = Math.min(1, (Math.sqrt(9.81 * Math.max(d, 5)) / 30) / 0.85); }
    else {
      club = d > 130 ? 'driver' : d > 50 ? 'iron7' : 'wedge';
      const v = club === 'driver' ? Math.sqrt((9.81 * d) / 0.47) / 70 : Math.sqrt(9.81 * d) / (club === 'iron7' ? 50 : 30);
      power = Math.min(1, s.lie === ROUGH ? v / 0.72 : v);
    }
    await page.evaluate(([c, p]) => window.__golfTest.swing({ club: c as string, power: p as number, contactError: 0 }), [club, power]);
    await page.waitForFunction(() => { const st = window.__golfTest.getState(); return st.phase === 'aiming' || st.phase === 'holed'; });
  }
}

test('plays a full 9-hole round to completion', async ({ page }) => {
  await page.goto('/?round=42&instant=1');
  await page.waitForFunction(() => window.__golfTest?.ready === true);
  expect((await page.evaluate(() => window.__golfTest.roundState()))?.pars.length).toBe(9);

  for (let hole = 0; hole < 9; hole++) {
    // Wait for this hole to be in the playing state (handles both first hole and after nextHole)
    await page.waitForFunction(() => window.__golfTest.roundState()?.phase === 'playing');
    await page.waitForFunction(() => !!window.__golfTest.getState());
    await holeOutCurrent(page);
    // Wait for the round to register hole-complete (needs a RAF cycle after holedOut)
    await page.waitForFunction(() => {
      const rs = window.__golfTest.roundState();
      return rs?.phase === 'hole-complete' || rs?.phase === 'round-complete';
    });
    // advance past the hole-complete card
    await page.evaluate(() => window.__golfTest.nextHole());
  }

  await expect(page.locator('#summary-continue')).toBeVisible({ timeout: 15000 });
  const rs = await page.evaluate(() => window.__golfTest.roundState());
  expect(rs?.phase).toBe('round-complete');
  expect(rs?.total).toBeGreaterThan(20); // 9 holes, several strokes each
});
