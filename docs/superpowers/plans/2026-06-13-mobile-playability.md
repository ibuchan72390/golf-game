# Mobile Playability Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game playable on touch (iPad) and informed: per-club approximate carry on the club selector, on-screen ◄ ► aim arrows, and an all-8-clubs-reachable selector layout.

**Architecture:** A pure `approxCarry(id, stats)` helper (per-club base carry measured against the sim, scaled by effective max speed) feeds a HUD distance readout. The HUD gains hold-to-repeat aim-arrow buttons wired to the existing `game.adjustAim`, and the club row wraps so all 8 clubs are reachable. The sim/physics are untouched. Spec: `docs/superpowers/specs/2026-06-13-mobile-playability-design.md`.

**Tech Stack:** Existing M1/M2/M3 stack (TypeScript, Vite, Three.js, Rapier, Vitest, Playwright, GitHub Actions/Pages).

---

## Conventions (read first)

- All prior conventions hold (sim/course purity, single-line commits, TDD, per-file `// @vitest-environment jsdom` for UI tests that touch `document`).
- The HUD is recreated every hole in `mountHole` (`src/main.ts`); the club buttons have ids `club-<id>` and labels set from `CLUBS[id].name`. The keyboard aim path is `game.adjustAim(∓0.03)` in `onKeydown`. `holeHooks.getState()` (main.ts:311) is the in-hole state the boot-level `__golfTest` delegates to.
- Work happens in a worktree branch created at execution time (orchestrator's job). Paths relative to repo root.

## File structure

```
src/sim/clubs.ts        # MODIFY: add approxCarry(id, stats) + BASE_CARRY map
src/sim/carry.test.ts   # NEW: calibration test (approxCarry within 15% of real sim carry)
src/sim/clubs.test.ts   # MODIFY: pure approxCarry behavior (rises with maxSpeed, putter 0)
src/ui/hud.ts           # MODIFY: setLoadout (distance labels), aim arrows + onAim, club row flex-wrap
src/ui/hud.test.ts      # NEW: jsdom — distance labels written, aim button fires onAim
src/main.ts             # MODIFY: hud.setLoadout(loadout); hud.onAim → adjustAim; aimDir in getState
e2e/touch.spec.ts       # NEW: iPad real-DOM — aim arrow changes aimDir, putter reachable; desktop key aim
e2e/visual.spec.ts      # MODIFY (re-baseline) — HUD changed
README.md               # MODIFY: controls
```

---

### Task 1: `approxCarry` helper

**Files:**
- Modify: `src/sim/clubs.ts`, `src/sim/clubs.test.ts`
- Test: `src/sim/carry.test.ts`

`approxCarry(id, stats)` returns the approximate total distance (carry + roll) a full-power shot travels on a flat fairway, for display. Per-club base distances are measured against the real sim (a calibration test guards them); the value scales with the club's effective `maxSpeed` so it rises when Power is upgraded.

- [ ] **Step 1: Write the pure behaviour test** (append to `src/sim/clubs.test.ts`)

```ts
import { approxCarry, effectiveStats, CLUBS } from './clubs';

describe('approxCarry', () => {
  it('orders clubs by distance (driver > 7 iron > sand wedge) and putter is ~0', () => {
    const d = approxCarry('driver', CLUBS.driver);
    const i7 = approxCarry('iron7', CLUBS.iron7);
    const sw = approxCarry('sandWedge', CLUBS.sandWedge);
    expect(d).toBeGreaterThan(i7);
    expect(i7).toBeGreaterThan(sw);
    expect(approxCarry('putter', CLUBS.putter)).toBeLessThan(20);
  });
  it('rises when Power is upgraded', () => {
    const base = approxCarry('driver', CLUBS.driver);
    const up = approxCarry('driver', effectiveStats('driver', { power: 6, accuracy: 0, forgiveness: 0, spin: 0 }));
    expect(up).toBeGreaterThan(base);
  });
});
```

- [ ] **Step 2: Write the calibration test `src/sim/carry.test.ts`** (guards the base distances against the real sim)

```ts
// src/sim/carry.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { approxCarry, BASE_LOADOUT } from './clubs';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import type { ClubId, HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

// full-power flat-fairway carry+roll for a club, measured from the sim
function realCarry(club: ClubId): number {
  const hole = flatHoleFile(SURFACE.fairway);
  const state: HoleState = {
    seed: 1, ballPos: { x: 0, y: 0, z: -5 }, holePos: { x: 0, y: 0, z: -400 }, // pin far: no capture
    holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: SURFACE.fairway,
  };
  const { newState } = resolveShot(state, { club, aimDir: 0, power: 1, contactError: 0 }, BASE_LOADOUT);
  return Math.abs(newState.ballPos.z) - 5;
}

describe('approxCarry calibration (within 15% of the real sim, base loadout)', () => {
  for (const club of ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'pitchingWedge', 'sandWedge'] as const) {
    it(`${club}`, () => {
      const real = realCarry(club);
      const shown = approxCarry(club, BASE_LOADOUT[club]);
      expect(Math.abs(shown - real) / real).toBeLessThan(0.15);
    });
  }
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run src/sim/carry.test.ts src/sim/clubs.test.ts`
Expected: FAIL — `approxCarry` not exported.

- [ ] **Step 4: Implement `approxCarry` + `BASE_CARRY` in `src/sim/clubs.ts`**

```ts
// src/sim/clubs.ts (additions)
import type { ClubId, ClubStats } from './types';

/**
 * Approximate full-power total distance (carry + roll) on a flat fairway, per club,
 * for the HUD readout. These base values are measured from the deterministic sim;
 * carry.test.ts asserts they stay within 15% of resolveShot, so if physics is
 * retuned the test flags drift. Display value scales linearly with the club's
 * effective max speed, so it rises with Power upgrades (approximate by design).
 */
const BASE_CARRY: Record<ClubId, number> = {
  driver: 190, wood3: 175, iron5: 155, iron7: 130, iron9: 105, pitchingWedge: 75, sandWedge: 55, putter: 0,
};

export function approxCarry(id: ClubId, stats: ClubStats): number {
  const base = BASE_CARRY[id];
  if (base === 0) return 0;
  return base * (stats.maxSpeed / CLUBS[id].maxSpeed);
}
```

- [ ] **Step 5: Calibrate `BASE_CARRY` to pass the 15% test**

Run: `npx vitest run src/sim/carry.test.ts`
For each failing club, print `realCarry(club)` and set `BASE_CARRY[club]` to that measured value (rounded). Re-run until all clubs pass within 15%. The numbers above are estimates — replace them with the measured carries. (The `(stats.maxSpeed / CLUBS[id].maxSpeed)` ratio is 1 at base loadout, so the test compares `BASE_CARRY[id]` directly to the measured carry.)

- [ ] **Step 6: Run the suite**

Run: `npx vitest run src/sim` → all pass. `npm run lint`, `npm run typecheck` clean.

- [ ] **Step 7: Commit**

```powershell
git add src/sim/clubs.ts src/sim/clubs.test.ts src/sim/carry.test.ts
git commit -m "feat: approxCarry per-club distance helper"
```

---

### Task 2: HUD distance readout

**Files:**
- Modify: `src/ui/hud.ts`, `src/main.ts`
- Test: `src/ui/hud.test.ts`

- [ ] **Step 1: Write the failing jsdom test `src/ui/hud.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createHud } from './hud';
import { BASE_LOADOUT } from '../sim/clubs';

describe('hud distance readout', () => {
  it('setLoadout writes approximate carry onto full-swing club buttons, not the putter', () => {
    const root = document.createElement('div');
    const hud = createHud(root);
    hud.setLoadout(BASE_LOADOUT);
    const driver = root.querySelector('#club-driver') as HTMLElement;
    const putter = root.querySelector('#club-putter') as HTMLElement;
    expect(driver.textContent).toMatch(/\d+\s*m/); // e.g. "Driver · ≈190 m"
    expect(putter.textContent).not.toMatch(/\d+\s*m/); // putter shows no carry
    expect(putter.textContent).toContain('Putter');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/hud.test.ts` → FAIL (`setLoadout` not a function).

- [ ] **Step 3: Add `setLoadout` to `src/ui/hud.ts`**

Add to the imports:

```ts
import { CLUBS, approxCarry } from '../sim/clubs';
import type { ClubId, ClubLoadout, HoleState } from '../sim/types';
```

(`ClubLoadout` is added to the existing `../sim/types` import; `approxCarry` to the existing `../sim/clubs` import.)

Add to the `Hud` interface:

```ts
  setLoadout(loadout: ClubLoadout): void;
```

Implement it in the returned object (writes the carry into each club button's label):

```ts
    setLoadout(loadout) {
      for (const id of CLUB_IDS) {
        const b = root.querySelector(`#club-${id}`) as HTMLElement;
        const carry = approxCarry(id, loadout[id]);
        b.textContent = carry > 0 ? `${CLUBS[id].name} · ≈${Math.round(carry)} m` : CLUBS[id].name;
      }
    },
```

(The `update()` method only sets `style.background`/`color` on the club buttons, never `textContent`, so these labels persist across updates.)

- [ ] **Step 4: Call `setLoadout` from `src/main.ts`**

In `mountHole`, right after `const hud = createHud(hudRoot);`, add:

```ts
    hud.setLoadout(loadout);
```

(`loadout` is in scope in `boot`; `mountHole` closes over it. It reflects upgrades because `loadout` is re-derived on each upgrade and the hole is freshly mounted each round.)

- [ ] **Step 5: Verify**

Run: `npx vitest run` (all pass), `npm run lint`, `npm run typecheck`, `npm run build` clean.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/hud.ts src/ui/hud.test.ts src/main.ts
git commit -m "feat: per-club distance readout in the club selector"
```

### Task 3: Touch aim arrows + aimDir hook

**Files:**
- Modify: `src/ui/hud.ts`, `src/main.ts`
- Test: `src/ui/hud.test.ts`

Two on-screen ◄ ► buttons in the HUD, hold-to-repeat, wired to `game.adjustAim`. Shown only during the `aiming` phase. They must not trigger the canvas swing (separate DOM, `pointer-events:auto`, `stopPropagation`).

- [ ] **Step 1: Add the failing aim test** (append to `src/ui/hud.test.ts`)

```ts
import { vi } from 'vitest';

describe('hud aim arrows', () => {
  it('fires onAim with direction on pointerdown of an arrow', () => {
    const root = document.createElement('div');
    const hud = createHud(root);
    const dirs: number[] = [];
    hud.onAim((dir) => dirs.push(dir));
    const right = root.querySelector('#aim-right') as HTMLElement;
    right.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    // stop the repeat so the test doesn't leave a timer running
    right.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs[0]).toBe(1);
  });

  it('shows arrows only while aiming', () => {
    const root = document.createElement('div');
    const hud = createHud(root);
    const wrap = root.querySelector('#aim-controls') as HTMLElement;
    // update() drives visibility by phase; build a minimal hole state
    const hole = { par: 3 } as never;
    const state = { strokes: 0, holePos: { x: 0, y: 0, z: -10 }, ballPos: { x: 0, y: 0, z: 0 }, lie: 0, hole } as never;
    hud.update('aiming', state, 'driver');
    expect(wrap.style.display).not.toBe('none');
    hud.update('flying', state, 'driver');
    expect(wrap.style.display).toBe('none');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/hud.test.ts` → FAIL (`onAim` / `#aim-right` missing).

- [ ] **Step 3: Add the aim controls to `src/ui/hud.ts`**

Add the markup inside `createHud`'s `root.innerHTML` template (before the closing `<style>`), positioned bottom-right above the help text, thumb-reachable and clear of the left-side clubs/meter:

```html
    <div id="aim-controls" style="position:absolute;bottom:46px;right:12px;display:flex;gap:10px;pointer-events:auto;">
      <button id="aim-left" style="${chip}border:none;cursor:pointer;font-size:22px;width:56px;height:56px;border-radius:28px;display:flex;align-items:center;justify-content:center;">◄</button>
      <button id="aim-right" style="${chip}border:none;cursor:pointer;font-size:22px;width:56px;height:56px;border-radius:28px;display:flex;align-items:center;justify-content:center;">►</button>
    </div>
```

Grab the element + add the field and helper near the other `get(...)` calls:

```ts
  const aimControls = get('#aim-controls');
  const aimLeft = get('#aim-left'), aimRight = get('#aim-right');
  let aimCb: (dir: number) => void = () => {};
```

Wire press-and-hold (immediate fire + repeat; cleared on release/leave/cancel):

```ts
  function bindAim(btn: HTMLElement, dir: number): void {
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aimCb(dir); // immediate nudge
      stop();
      timer = setInterval(() => aimCb(dir), 90); // hold-to-repeat
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, (e) => {
        e.stopPropagation();
        stop();
      });
    }
  }
  bindAim(aimLeft, -1);
  bindAim(aimRight, 1);
```

Add `onAim` to the interface and the returned object:

```ts
// interface:
  onAim(cb: (dir: number) => void): void;
// returned object:
    onAim(cb) {
      aimCb = cb;
    },
```

In `update(phase, hole, club)`, toggle the controls by phase (add at the end of the method body):

```ts
      aimControls.style.display = phase === 'aiming' ? 'flex' : 'none';
```

- [ ] **Step 4: Wire it in `src/main.ts` + expose `aimDir`**

In `mountHole`, after `hud.onClubSelect(...)`, add:

```ts
    hud.onAim((dir) => game.adjustAim(dir * 0.03));
```

Add `aimDir` to the in-hole `getState` (in the `holeHooks = { getState: () => ({ ... }) }` object):

```ts
        aimDir: game.aimDir,
```

And extend the `holeHooks` TYPE declaration (the `getState(): { ... }` shape near the top of `boot`) to include `aimDir: number`.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/ui/hud.test.ts` (passes), full `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run build` clean.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/hud.ts src/ui/hud.test.ts src/main.ts
git commit -m "feat: on-screen touch aim arrows"
```

---

### Task 4: Club selector reachable on mobile (flex-wrap)

**Files:**
- Modify: `src/ui/hud.ts`

The club row currently overflows the viewport at mobile widths, hiding clubs past the sand wedge (including the putter). Make it wrap so all 8 chips are always on-screen and tappable, without overlapping the aim arrows (bottom-right) or meter (bottom-left).

- [ ] **Step 1: Wrap the club row**

In `createHud`'s template, change the `#hud-clubs` div style from:

```
position:absolute;bottom:84px;left:12px;display:flex;gap:6px;pointer-events:auto;
```

to (wrap, constrained width that leaves room for the aim arrows on the right, raised so wrapped rows don't collide with the meter/prompt):

```
position:absolute;bottom:84px;left:12px;right:150px;display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto;justify-content:flex-start;
```

(`right:150px` reserves the bottom-right corner for the aim controls so the wrapped chips never overlap them; the row grows upward as it wraps, clear of the meter at `bottom:18px` and prompt at `bottom:52px`.)

- [ ] **Step 2: Verify nothing overlaps at mobile widths**

Run `npm run dev`, then in a browser at a narrow viewport (DevTools device toolbar, ~768px and ~390px wide) confirm: all 8 club chips wrap and are visible/tappable, the aim arrows sit clear in the bottom-right, and the swing meter/prompt are unobstructed. (The orchestrator does the authoritative visual pass; you confirm the server serves and the layout doesn't error.)

Run `npm run typecheck`, `npm run lint`, `npx vitest run` (the hud distance/aim tests still pass), `npm run build` — all clean.

- [ ] **Step 3: Commit**

```powershell
git add src/ui/hud.ts
git commit -m "fix: wrap club selector so all clubs are reachable on mobile"
```

---

### Task 5: e2e (real DOM, iPad) + visual re-baseline + README

**Files:**
- Create: `e2e/touch.spec.ts`
- Modify: `e2e/visual.spec.ts` (re-baseline), `README.md`
- Delete: `e2e/visual.spec.ts-snapshots/` (HUD changed — gate self-skips until re-baselined)

- [ ] **Step 1: Write `e2e/touch.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __golfTest: {
      ready: boolean;
      getState(): { phase: string; club: string; aimDir: number } | null;
    };
  }
}

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
```

- [ ] **Step 2: Run the new e2e**

Run: `npm run test:e2e e2e/touch.spec.ts` → 6 passed (3 tests × desktop + ipad). The `toBeInViewport` putter check is the real reachability gate — if it fails on the ipad project, the wrap from Task 4 needs adjusting (the chips must fit; reduce chip padding or the reserved `right` gap), not the test. Re-run the full `npm run test:e2e` so the round/upgrade/prompts/settings specs still pass.

- [ ] **Step 3: Re-baseline visuals**

The HUD now has aim arrows, per-club distances, and a wrapped club row, so the `round-aiming` snapshots (and any HUD-bearing ones) will differ. Delete the baselines so the CI visual gate self-skips until regenerated post-merge:

```powershell
Remove-Item -Recurse -Force e2e\visual.spec.ts-snapshots
```

(`e2e/visual.spec.ts` itself needs no change — its tests still target the right screens; only the baseline pixels change. If the `course-select`/`menu`/`upgrade`/`gallery` shots are unaffected they'll simply be regenerated identically.)

- [ ] **Step 4: Update `README.md` controls**

In the Develop/controls section, add touch controls alongside the keyboard ones:

```markdown
- Controls: ←/→ or the on-screen ◄ ► arrows to aim · hold-release (default): hold to charge, release, tap the band · tap a club chip (or 1–4) to select — each chip shows its approximate carry · ⚙ settings
```

- [ ] **Step 5: Full verification**

Run: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run test:e2e` (touch + round + upgrade + prompts + settings pass; visual skips locally), `npm run build` — all green.

- [ ] **Step 6: Commit**

```powershell
git add e2e README.md
git commit -m "test: touch e2e; re-baseline visuals; readme controls"
```

---

## End-of-pass verification checklist

- [ ] All local gates green (unit incl. carry calibration, touch + functional e2e, lint, typecheck, build).
- [ ] Manual (orchestrator, mobile viewport): aim arrows rotate the ball's aim and hold-to-repeat works; all 8 clubs (incl. putter) reachable; each club chip shows an approximate carry that rises after a Power upgrade; desktop keyboard aim unaffected; swing input not triggered by the arrows.
- [ ] Post-merge: push → CI green (visual gate self-skips, baselines deleted) → run "Update visual snapshots" workflow → pull → empty commit to re-trigger → confirm visual gate hard-passes + Pages deploys. (Same flow as M1/M2/M3.)
- [ ] iPad real-device check: aiming + club selection usable by touch (the whole point of this pass).

