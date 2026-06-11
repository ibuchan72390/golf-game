# Milestone 1: Walking Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, tested, playable single flat hole: aim, 3-click swing, real physics flight, hole-out detection, stroke counting — with CI and GitHub Pages deploy live from this milestone.

**Architecture:** Pure-TypeScript deterministic sim core (Rapier WASM physics, seeded RNG, fixed timestep) with zero DOM/Three imports. Three.js renders the world and plays back trajectories the sim returns. DOM overlay HUD. Small state machine wires it together. See `docs/superpowers/specs/2026-06-11-golf-game-design.md`.

**Tech Stack:** TypeScript, Vite, Three.js, `@dimforge/rapier3d-compat`, Vitest, Playwright, GitHub Actions, GitHub Pages.

**Conventions used throughout:**
- World units are meters. Y is up. The test hole runs from tee at origin toward **−Z**.
- `aimDir` is yaw in radians; direction vector = `(sin(aimDir), 0, -cos(aimDir))`, so `aimDir = 0` points straight down the hole.
- Unit tests are co-located: `src/foo/bar.test.ts` next to `src/foo/bar.ts`. Playwright tests live in `e2e/`.
- Every commit message follows `type: summary` (feat/test/chore/ci).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.ts`, `src/style.css`

- [ ] **Step 1: Initialize package and install dependencies**

```powershell
npm init -y
npm pkg set type=module
npm install three @dimforge/rapier3d-compat
npm install -D typescript vite vitest @types/three eslint typescript-eslint @playwright/test
```

- [ ] **Step 2: Set npm scripts**

Edit `package.json` so its `scripts` block is exactly:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

(Keep the other fields npm generated; only replace `scripts`.)

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts`** (Vitest config rides along; Rapier excluded from prebundling because its inlined WASM doesn't need it)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write `eslint.config.js`**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ['dist/', 'test-results/', 'playwright-report/'],
});
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>Golf</title>
  </head>
  <body>
    <canvas id="game-canvas"></canvas>
    <div id="hud"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/style.css`**

```css
html, body { margin: 0; height: 100%; overflow: hidden; background: #aee7f8; }
#game-canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#hud { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; }
```

- [ ] **Step 8: Write placeholder `src/main.ts`**

```ts
import './style.css';

console.log('golf: scaffold ok');
```

- [ ] **Step 9: Verify scaffold**

Run: `npm run build` → Expected: `vite build` succeeds, `dist/` created.
Run: `npm run lint` → Expected: no errors.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 10: Commit**

```powershell
git add -A
git commit -m "chore: scaffold vite + typescript project"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/sim/rng.ts`
- Test: `src/sim/rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/rng.test.ts
import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('same seed produces identical sequences', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toEqual(b());
  });

  it('outputs stay in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/rng.test.ts`
Expected: FAIL — cannot resolve `./rng`.

- [ ] **Step 3: Implement mulberry32**

```ts
// src/sim/rng.ts
/** Deterministic PRNG (mulberry32). Never use Math.random() in src/sim. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/rng.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/rng.ts src/sim/rng.test.ts
git commit -m "feat: seeded deterministic rng"
```

---

### Task 3: Sim types and club table

**Files:**
- Create: `src/sim/types.ts`, `src/sim/clubs.ts`
- Test: `src/sim/clubs.test.ts`

- [ ] **Step 1: Write `src/sim/types.ts`** (contracts straight from the spec)

```ts
// src/sim/types.ts
export type ClubId = 'driver' | 'iron7' | 'wedge' | 'putter';

export interface ClubStats {
  name: string;
  /** ball speed in m/s at power = 1 */
  maxSpeed: number;
  /** launch angle in degrees */
  launchDeg: number;
  /** max yaw dispersion in radians at |contactError| = 1 */
  accuracy: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotIntent {
  club: ClubId;
  /** yaw radians; dir = (sin, 0, -cos) so 0 faces -Z */
  aimDir: number;
  /** 0..1 fraction of club max speed */
  power: number;
  /** -1..1, 0 = pure strike; from swing input quality */
  contactError: number;
}

export interface HoleState {
  seed: number;
  ballPos: Vec3;
  holePos: Vec3;
  /** capture radius in meters */
  holeRadius: number;
  strokes: number;
  holedOut: boolean;
}

export interface TrajectorySample {
  /** seconds since strike */
  t: number;
  pos: Vec3;
}

export interface ShotResult {
  newState: HoleState;
  trajectory: TrajectorySample[];
}
```

- [ ] **Step 2: Write the failing test for launch velocity math**

```ts
// src/sim/clubs.test.ts
import { describe, expect, it } from 'vitest';
import { CLUBS, launchVelocity } from './clubs';

describe('launchVelocity', () => {
  it('full-power pure strike at aim 0 flies straight down -Z', () => {
    const v = launchVelocity(CLUBS.driver, { club: 'driver', aimDir: 0, power: 1, contactError: 0 }, 1);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(CLUBS.driver.maxSpeed, 6);
  });

  it('power scales speed linearly', () => {
    const half = launchVelocity(CLUBS.iron7, { club: 'iron7', aimDir: 0, power: 0.5, contactError: 0 }, 1);
    expect(Math.hypot(half.x, half.y, half.z)).toBeCloseTo(CLUBS.iron7.maxSpeed * 0.5, 6);
  });

  it('positive contactError pushes the shot offline', () => {
    const v = launchVelocity(CLUBS.driver, { club: 'driver', aimDir: 0, power: 1, contactError: 1 }, 1);
    expect(Math.abs(v.x)).toBeGreaterThan(0.5);
  });

  it('putter launches flat', () => {
    const v = launchVelocity(CLUBS.putter, { club: 'putter', aimDir: 0, power: 0.5, contactError: 0 }, 1);
    expect(v.y).toBeCloseTo(0, 6);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/sim/clubs.test.ts`
Expected: FAIL — cannot resolve `./clubs`.

- [ ] **Step 4: Implement `src/sim/clubs.ts`**

```ts
// src/sim/clubs.ts
import type { ClubId, ClubStats, ShotIntent, Vec3 } from './types';

const DEG2RAD = Math.PI / 180;

export const CLUBS: Record<ClubId, ClubStats> = {
  driver: { name: 'Driver', maxSpeed: 70, launchDeg: 14, accuracy: 0.12 },
  iron7: { name: '7 Iron', maxSpeed: 50, launchDeg: 22, accuracy: 0.08 },
  wedge: { name: 'Wedge', maxSpeed: 30, launchDeg: 45, accuracy: 0.06 },
  putter: { name: 'Putter', maxSpeed: 12, launchDeg: 0, accuracy: 0.02 },
};

/**
 * Initial ball velocity for a shot. `wobble` (0..1, from the seeded RNG)
 * scales how much of the club's max dispersion this contactError costs.
 */
export function launchVelocity(club: ClubStats, intent: ShotIntent, wobble: number): Vec3 {
  const speed = club.maxSpeed * intent.power;
  const yaw = intent.aimDir + intent.contactError * club.accuracy * (0.5 + 0.5 * wobble);
  const pitch = club.launchDeg * DEG2RAD * (1 - 0.2 * Math.abs(intent.contactError));
  return {
    x: speed * Math.cos(pitch) * Math.sin(yaw),
    y: speed * Math.sin(pitch),
    z: -speed * Math.cos(pitch) * Math.cos(yaw),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/sim/clubs.test.ts` → Expected: 4 passed.

- [ ] **Step 6: Commit**

```powershell
git add src/sim/types.ts src/sim/clubs.ts src/sim/clubs.test.ts
git commit -m "feat: sim types and club launch math"
```

---

### Task 4: resolveShot — deterministic physics flight

**Files:**
- Create: `src/sim/shot.ts`
- Test: `src/sim/shot.test.ts`

- [ ] **Step 1: Write the failing tests** (determinism guard + sanity ranges — exact golden coordinates get locked in later, once a baseline exists)

```ts
// src/sim/shot.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import type { HoleState, ShotIntent } from './types';

function flatHole(): HoleState {
  return {
    seed: 42,
    ballPos: { x: 0, y: 0, z: 0 },
    holePos: { x: 0, y: 0, z: -150 },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
  };
}

const fullDrive: ShotIntent = { club: 'driver', aimDir: 0, power: 1, contactError: 0 };

beforeAll(async () => {
  await initPhysics();
});

describe('resolveShot', () => {
  it('is deterministic: identical state + intent → identical trajectory', () => {
    const a = resolveShot(flatHole(), fullDrive);
    const b = resolveShot(flatHole(), fullDrive);
    expect(JSON.stringify(a.trajectory)).toEqual(JSON.stringify(b.trajectory));
    expect(a.newState).toEqual(b.newState);
  });

  it('a pure full drive flies far, straight, and comes to rest', () => {
    const { newState, trajectory } = resolveShot(flatHole(), fullDrive);
    expect(newState.ballPos.z).toBeLessThan(-120);
    expect(newState.ballPos.z).toBeGreaterThan(-320);
    expect(Math.abs(newState.ballPos.x)).toBeLessThan(0.5);
    expect(newState.strokes).toBe(1);
    expect(newState.holedOut).toBe(false);
    expect(trajectory.length).toBeGreaterThan(10);
    const peak = Math.max(...trajectory.map((s) => s.pos.y));
    expect(peak).toBeGreaterThan(5);
  });

  it('different seeds disperse a mishit differently', () => {
    const mishit: ShotIntent = { club: 'driver', aimDir: 0, power: 1, contactError: 0.8 };
    const a = resolveShot({ ...flatHole(), seed: 1 }, mishit);
    const b = resolveShot({ ...flatHole(), seed: 2 }, mishit);
    expect(a.newState.ballPos.x).not.toEqual(b.newState.ballPos.x);
  });

  it('increments strokes and preserves hole identity fields', () => {
    const { newState } = resolveShot(flatHole(), fullDrive);
    expect(newState.seed).toBe(42);
    expect(newState.holePos).toEqual({ x: 0, y: 0, z: -150 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/shot.test.ts`
Expected: FAIL — cannot resolve `./shot`.

- [ ] **Step 3: Implement `src/sim/shot.ts`**

```ts
// src/sim/shot.ts
import RAPIER from '@dimforge/rapier3d-compat';
import { CLUBS, launchVelocity } from './clubs';
import { createRng } from './rng';
import type { HoleState, ShotIntent, ShotResult, TrajectorySample } from './types';

export const BALL_RADIUS = 0.021;
const TIMESTEP = 1 / 120;
const MAX_STEPS = 120 * 30; // 30 s simulated cap
const SAMPLE_EVERY = 2; // record at 60 Hz
const REST_SPEED = 0.05; // m/s
const REST_STEPS = 60; // must stay slow this many steps (0.5 s)
const CAPTURE_SPEED = 3.0; // m/s — max speed at which the cup grabs the ball

let rapierReady: Promise<unknown> | null = null;

/** Must resolve before the first resolveShot call (app boot / test beforeAll). */
export function initPhysics(): Promise<unknown> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/**
 * Deterministically simulate one shot to rest. Fresh Rapier world per call +
 * fixed timestep + seeded RNG ⇒ identical results everywhere, forever.
 */
export function resolveShot(state: HoleState, intent: ShotIntent): ShotResult {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = TIMESTEP;

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.1, 500)
      .setTranslation(0, -0.1, 0)
      .setRestitution(0.4)
      .setFriction(0.8),
  );

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(state.ballPos.x, Math.max(state.ballPos.y, 0) + BALL_RADIUS, state.ballPos.z)
      .setLinearDamping(0.3) // crude air drag + rolling resistance for M1
      .setAngularDamping(2.0)
      .setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS).setRestitution(0.55).setFriction(0.6).setDensity(1100),
    body,
  );

  const rng = createRng(state.seed + state.strokes * 1013);
  const v = launchVelocity(CLUBS[intent.club], intent, rng());
  body.setLinvel(v, true);

  const trajectory: TrajectorySample[] = [];
  let holedOut = false;
  let slowStreak = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    world.step();
    const p = body.translation();
    const vel = body.linvel();
    const speed = Math.hypot(vel.x, vel.y, vel.z);

    if (step % SAMPLE_EVERY === 0) {
      trajectory.push({ t: (step + 1) * TIMESTEP, pos: { x: p.x, y: p.y, z: p.z } });
    }

    const distToHole = Math.hypot(p.x - state.holePos.x, p.z - state.holePos.z);
    if (distToHole < state.holeRadius && speed < CAPTURE_SPEED) {
      holedOut = true;
      break;
    }

    slowStreak = speed < REST_SPEED ? slowStreak + 1 : 0;
    if (slowStreak >= REST_STEPS) break;
  }

  const final = body.translation();
  const restPos = holedOut
    ? { ...state.holePos }
    : { x: final.x, y: Math.max(final.y - BALL_RADIUS, 0), z: final.z };
  trajectory.push({ t: trajectory.length > 0 ? trajectory[trajectory.length - 1]!.t + TIMESTEP : TIMESTEP, pos: restPos });

  world.free();

  return {
    newState: { ...state, ballPos: restPos, strokes: state.strokes + 1, holedOut },
    trajectory,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/shot.test.ts`
Expected: 4 passed. If the range assertions fail, tune `setLinearDamping` / restitution until a full drive carries 120–320 m — these constants are gameplay tuning; the test documents the contract.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/shot.ts src/sim/shot.test.ts
git commit -m "feat: deterministic resolveShot with rapier"
```

---

### Task 5: Hole-out behavior

**Files:**
- Modify: `src/sim/shot.ts` (only if tests force tuning)
- Test: `src/sim/holeout.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/holeout.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import type { HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

function onGreen(metersFromHole: number): HoleState {
  return {
    seed: 7,
    ballPos: { x: 0, y: 0, z: -150 + metersFromHole },
    holePos: { x: 0, y: 0, z: -150 },
    holeRadius: 0.15,
    strokes: 2,
    holedOut: false,
  };
}

describe('hole-out', () => {
  it('a firm short putt drops', () => {
    const { newState } = resolveShot(onGreen(1.5), {
      club: 'putter',
      aimDir: 0,
      power: 0.25,
      contactError: 0,
    });
    expect(newState.holedOut).toBe(true);
    expect(newState.ballPos).toEqual({ x: 0, y: 0, z: -150 });
    expect(newState.strokes).toBe(3);
  });

  it('a blasted putt skips the cup', () => {
    const { newState } = resolveShot(onGreen(1.5), {
      club: 'putter',
      aimDir: 0,
      power: 1,
      contactError: 0,
    });
    expect(newState.holedOut).toBe(false);
    expect(newState.ballPos.z).toBeLessThan(-150.5); // rolled past
  });

  it('a putt aimed sideways misses', () => {
    const { newState } = resolveShot(onGreen(1.5), {
      club: 'putter',
      aimDir: Math.PI / 4,
      power: 0.25,
      contactError: 0,
    });
    expect(newState.holedOut).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/sim/holeout.test.ts`
Expected: ideally PASS against Task 4's implementation. If "firm short putt drops" fails, the capture window is too strict for the damping curve — raise `CAPTURE_SPEED` toward 4.0 or `holeRadius` stays a state value (don't touch), and re-run until green. If "blasted putt" captures, lower `CAPTURE_SPEED`. Tune only those constants in `src/sim/shot.ts`.

- [ ] **Step 3: Run the whole sim suite**

Run: `npx vitest run src/sim` → Expected: all pass (rng, clubs, shot, holeout).

- [ ] **Step 4: Commit**

```powershell
git add src/sim
git commit -m "test: hole-out capture contract"
```

---

### Task 6: 3-click meter logic (pure)

**Files:**
- Create: `src/input/threeClick.ts`
- Test: `src/input/threeClick.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/input/threeClick.test.ts
import { describe, expect, it } from 'vitest';
import { ThreeClickMeter, meterValue } from './threeClick';

describe('meterValue', () => {
  it('oscillates 0 → 1 → 0 over one period', () => {
    expect(meterValue(0, 1600)).toBeCloseTo(0);
    expect(meterValue(400, 1600)).toBeCloseTo(0.5);
    expect(meterValue(800, 1600)).toBeCloseTo(1);
    expect(meterValue(1200, 1600)).toBeCloseTo(0.5);
    expect(meterValue(1600, 1600)).toBeCloseTo(0);
  });
});

describe('ThreeClickMeter', () => {
  it('walks idle → power → accuracy → done and emits an intent', () => {
    const m = new ThreeClickMeter();
    expect(m.phase).toBe('idle');
    m.begin(1000);
    expect(m.phase).toBe('power');
    m.click(1000 + 800); // meter at peak → full power
    expect(m.phase).toBe('accuracy');
    m.click(1000 + 1600 + 160); // value 0.2, just past target 0.1
    expect(m.phase).toBe('done');
    const r = m.result();
    expect(r.power).toBeCloseTo(1);
    expect(r.contactError).toBeCloseTo((0.2 - 0.1) / 0.9, 5);
  });

  it('clicking the accuracy target exactly gives pure contact', () => {
    const m = new ThreeClickMeter();
    m.begin(0);
    m.click(800);
    m.click(1600 + 80); // value 0.1 === target
    expect(m.result().contactError).toBeCloseTo(0, 5);
  });

  it('contactError stays within [-1, 1]', () => {
    const m = new ThreeClickMeter();
    m.begin(0);
    m.click(800);
    m.click(1600); // value 0 → below target → small negative error
    expect(m.result().contactError).toBeGreaterThanOrEqual(-1);
    expect(m.result().contactError).toBeLessThanOrEqual(1);
    expect(m.result().contactError).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/threeClick.test.ts`
Expected: FAIL — cannot resolve `./threeClick`.

- [ ] **Step 3: Implement `src/input/threeClick.ts`**

```ts
// src/input/threeClick.ts
export const METER_PERIOD_MS = 1600;
export const ACCURACY_TARGET = 0.1;

export type MeterPhase = 'idle' | 'power' | 'accuracy' | 'done';

/** Triangle wave 0 → 1 → 0 across one period. Pure function of time. */
export function meterValue(elapsedMs: number, periodMs = METER_PERIOD_MS): number {
  const phase = ((elapsedMs % periodMs) + periodMs) % periodMs / periodMs;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

/**
 * Classic 3-click swing: begin() starts the meter, first click() locks power,
 * second click() measures contact error vs ACCURACY_TARGET.
 */
export class ThreeClickMeter {
  phase: MeterPhase = 'idle';
  private startMs = 0;
  private power = 0;
  private contactError = 0;

  begin(nowMs: number): void {
    this.phase = 'power';
    this.startMs = nowMs;
  }

  value(nowMs: number): number {
    return this.phase === 'power' || this.phase === 'accuracy' ? meterValue(nowMs - this.startMs) : 0;
  }

  click(nowMs: number): void {
    if (this.phase === 'power') {
      this.power = meterValue(nowMs - this.startMs);
      this.phase = 'accuracy';
    } else if (this.phase === 'accuracy') {
      const v = meterValue(nowMs - this.startMs);
      this.contactError = Math.max(-1, Math.min(1, (v - ACCURACY_TARGET) / (1 - ACCURACY_TARGET)));
      this.phase = 'done';
    }
  }

  result(): { power: number; contactError: number } {
    return { power: this.power, contactError: this.contactError };
  }

  reset(): void {
    this.phase = 'idle';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/threeClick.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/input
git commit -m "feat: three-click swing meter logic"
```

---

### Task 7: Three.js scene

**Files:**
- Create: `src/render/scene.ts`

No unit test — rendering is covered by Playwright visual snapshots (Task 11). Keep this file free of game logic.

- [ ] **Step 1: Implement `src/render/scene.ts`**

```ts
// src/render/scene.ts
import * as THREE from 'three';
import type { Vec3 } from '../sim/types';

export interface GameScene {
  render(): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  /** snap camera behind the ball looking down the aim line */
  frameBall(): void;
  resize(): void;
}

export function createScene(canvas: HTMLCanvasElement, holePos: Vec3): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xaee7f8);
  scene.fog = new THREE.Fog(0xaee7f8, 200, 600);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.4);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshLambertMaterial({ color: 0x7ec850 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const cup = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222 }),
  );
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(holePos.x, 0.01, holePos.z);
  scene.add(cup);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
    new THREE.MeshLambertMaterial({ color: 0xeceff1 }),
  );
  pole.position.set(holePos.x, 1.1, holePos.z);
  scene.add(pole);

  const flag = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.7, 4),
    new THREE.MeshLambertMaterial({ color: 0xff5252 }),
  );
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(holePos.x + 0.4, 1.9, holePos.z);
  scene.add(flag);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12), // oversized for visibility — cartoon ball
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  scene.add(ball);

  const aimLine = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0.15, 0),
    6,
    0xffffff,
    1,
    0.5,
  );
  scene.add(aimLine);

  let aimYaw = 0;

  const api: GameScene = {
    render: () => renderer.render(scene, camera),
    setBallPosition: (p) => {
      ball.position.set(p.x, Math.max(p.y, 0) + 0.12, p.z);
      aimLine.position.set(p.x, 0.15, p.z);
    },
    setAimDir: (yaw) => {
      aimYaw = yaw;
      aimLine.setDirection(new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).normalize());
    },
    frameBall: () => {
      const back = new THREE.Vector3(-Math.sin(aimYaw), 0, Math.cos(aimYaw));
      camera.position.copy(ball.position).addScaledVector(back, 8).add(new THREE.Vector3(0, 3, 0));
      camera.lookAt(ball.position.x + Math.sin(aimYaw) * 20, 0, ball.position.z - Math.cos(aimYaw) * 20);
    },
    resize: () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
  };

  api.resize();
  return api;
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck` and `npm run lint` → Expected: clean. (Visual verification happens in Task 9 when main.ts wires it up.)

- [ ] **Step 3: Commit**

```powershell
git add src/render/scene.ts
git commit -m "feat: three.js flat-hole scene"
```

---

### Task 8: Trajectory playback

**Files:**
- Create: `src/render/playback.ts`
- Test: `src/render/playback.test.ts`

- [ ] **Step 1: Write the failing tests** (pure interpolation logic — testable without Three.js)

```ts
// src/render/playback.test.ts
import { describe, expect, it } from 'vitest';
import { TrajectoryPlayback } from './playback';
import type { TrajectorySample } from '../sim/types';

const samples: TrajectorySample[] = [
  { t: 0, pos: { x: 0, y: 0, z: 0 } },
  { t: 1, pos: { x: 0, y: 10, z: -50 } },
  { t: 2, pos: { x: 0, y: 0, z: -100 } },
];

describe('TrajectoryPlayback', () => {
  it('interpolates between samples', () => {
    const p = new TrajectoryPlayback(samples);
    expect(p.advance(0.5)).toEqual({ x: 0, y: 5, z: -25 });
    expect(p.done).toBe(false);
  });

  it('finishes at the last sample and reports done', () => {
    const p = new TrajectoryPlayback(samples);
    const end = p.advance(10);
    expect(end).toEqual({ x: 0, y: 0, z: -100 });
    expect(p.done).toBe(true);
  });

  it('handles a single-sample trajectory', () => {
    const p = new TrajectoryPlayback([{ t: 0.1, pos: { x: 1, y: 0, z: 2 } }]);
    expect(p.advance(0.01)).toEqual({ x: 1, y: 0, z: 2 });
    expect(p.done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/playback.test.ts`
Expected: FAIL — cannot resolve `./playback`.

- [ ] **Step 3: Implement `src/render/playback.ts`**

```ts
// src/render/playback.ts
import type { TrajectorySample, Vec3 } from '../sim/types';

/** Replays a sim trajectory in wall-clock time; the renderer never simulates. */
export class TrajectoryPlayback {
  done = false;
  private elapsed = 0;

  constructor(private readonly samples: TrajectorySample[]) {
    if (samples.length === 0) throw new Error('empty trajectory');
  }

  /** Advance by dt seconds, returning the interpolated ball position. */
  advance(dt: number): Vec3 {
    this.elapsed += dt;
    const last = this.samples[this.samples.length - 1]!;
    if (this.samples.length === 1 || this.elapsed >= last.t) {
      this.done = true;
      return { ...last.pos };
    }
    let i = 0;
    while (i < this.samples.length - 1 && this.samples[i + 1]!.t < this.elapsed) i++;
    const a = this.samples[i]!;
    const b = this.samples[i + 1]!;
    const span = b.t - a.t || 1;
    const f = Math.min(Math.max((this.elapsed - a.t) / span, 0), 1);
    return {
      x: a.pos.x + (b.pos.x - a.pos.x) * f,
      y: a.pos.y + (b.pos.y - a.pos.y) * f,
      z: a.pos.z + (b.pos.z - a.pos.z) * f,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/playback.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/render/playback.ts src/render/playback.test.ts
git commit -m "feat: trajectory playback interpolation"
```

---

### Task 9: Game state machine, HUD, and wiring

**Files:**
- Create: `src/app/game.ts`, `src/ui/hud.ts`
- Modify: `src/main.ts`
- Test: `src/app/game.test.ts`

- [ ] **Step 1: Write the failing test for the game logic** (game is constructed headless — render and HUD are injected, so tests pass fakes)

```ts
// src/app/game.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { Game } from './game';
import { initPhysics } from '../sim/shot';

beforeAll(async () => {
  await initPhysics();
});

function makeGame() {
  return new Game(42, {
    onStateChange: () => {},
    setBallPosition: () => {},
    setAimDir: () => {},
    frameBall: () => {},
  });
}

describe('Game', () => {
  it('starts in aiming with 0 strokes, ball on tee', () => {
    const g = makeGame();
    expect(g.phase).toBe('aiming');
    expect(g.hole.strokes).toBe(0);
    expect(g.hole.ballPos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('default aim points at the hole', () => {
    const g = makeGame();
    expect(g.aimDir).toBeCloseTo(0, 5);
  });

  it('performSwing flies the ball, then settles back to aiming with +1 stroke', () => {
    const g = makeGame();
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    expect(g.phase).toBe('flying');
    g.update(60); // advance well past flight duration
    expect(g.phase).toBe('aiming');
    expect(g.hole.strokes).toBe(1);
    expect(g.hole.ballPos.z).toBeLessThan(-100);
  });

  it('holing out reaches the holed phase', () => {
    const g = makeGame();
    g.hole.ballPos = { x: 0, y: 0, z: -148.5 };
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 0.25, contactError: 0 });
    g.update(60);
    expect(g.phase).toBe('holed');
    expect(g.hole.holedOut).toBe(true);
  });

  it('adjustAim rotates and re-aims', () => {
    const g = makeGame();
    g.adjustAim(0.2);
    expect(g.aimDir).toBeCloseTo(0.2, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/game.test.ts`
Expected: FAIL — cannot resolve `./game`.

- [ ] **Step 3: Implement `src/app/game.ts`**

```ts
// src/app/game.ts
import { resolveShot } from '../sim/shot';
import type { HoleState, ShotIntent, Vec3 } from '../sim/types';
import { TrajectoryPlayback } from '../render/playback';

export type GamePhase = 'aiming' | 'metering' | 'flying' | 'holed';

/** Render-side callbacks; the Game never touches Three.js or the DOM. */
export interface GameView {
  onStateChange(phase: GamePhase, hole: HoleState): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  frameBall(): void;
}

export function makeFlatHole(seed: number): HoleState {
  return {
    seed,
    ballPos: { x: 0, y: 0, z: 0 },
    holePos: { x: 0, y: 0, z: -150 },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
  };
}

export class Game {
  phase: GamePhase = 'aiming';
  hole: HoleState;
  aimDir: number;
  private playback: TrajectoryPlayback | null = null;
  private pendingState: HoleState | null = null;

  constructor(seed: number, private readonly view: GameView) {
    this.hole = makeFlatHole(seed);
    this.aimDir = this.aimToHole();
    this.syncView();
  }

  aimToHole(): number {
    const dx = this.hole.holePos.x - this.hole.ballPos.x;
    const dz = this.hole.holePos.z - this.hole.ballPos.z;
    return Math.atan2(dx, -dz);
  }

  adjustAim(deltaYaw: number): void {
    if (this.phase !== 'aiming') return;
    this.aimDir += deltaYaw;
    this.view.setAimDir(this.aimDir);
    this.view.frameBall();
  }

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.view.onStateChange(phase, this.hole);
  }

  performSwing(intent: ShotIntent): void {
    if (this.phase === 'flying' || this.phase === 'holed') return;
    const result = resolveShot(this.hole, intent);
    this.pendingState = result.newState;
    this.playback = new TrajectoryPlayback(result.trajectory);
    this.setPhase('flying');
  }

  /** Advance playback by dt seconds (call from rAF loop or tests). */
  update(dt: number): void {
    if (this.phase !== 'flying' || !this.playback || !this.pendingState) return;
    const pos = this.playback.advance(dt);
    this.view.setBallPosition(pos);
    if (this.playback.done) {
      this.hole = this.pendingState;
      this.playback = null;
      this.pendingState = null;
      this.aimDir = this.hole.holedOut ? this.aimDir : this.aimToHole();
      this.view.setAimDir(this.aimDir);
      this.view.setBallPosition(this.hole.ballPos);
      this.view.frameBall();
      this.setPhase(this.hole.holedOut ? 'holed' : 'aiming');
    }
  }

  private syncView(): void {
    this.view.setBallPosition(this.hole.ballPos);
    this.view.setAimDir(this.aimDir);
    this.view.frameBall();
    this.view.onStateChange(this.phase, this.hole);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/game.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Implement `src/ui/hud.ts`**

```ts
// src/ui/hud.ts
import type { GamePhase } from '../app/game';
import type { ClubId, HoleState } from '../sim/types';
import { CLUBS } from '../sim/clubs';

export interface Hud {
  update(phase: GamePhase, hole: HoleState, club: ClubId): void;
  setMeter(visible: boolean, value: number): void;
}

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = `
    <div id="hud-top" style="position:absolute;top:12px;left:12px;background:rgba(38,50,56,.85);color:#fff;padding:6px 14px;border-radius:14px;font-size:14px;"></div>
    <div id="hud-club" style="position:absolute;bottom:64px;left:12px;background:rgba(38,50,56,.85);color:#ffca28;padding:6px 14px;border-radius:14px;font-size:14px;"></div>
    <div id="hud-msg" style="position:absolute;top:40%;width:100%;text-align:center;color:#fff;font-size:42px;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.4);display:none;"></div>
    <div id="hud-meter" style="position:absolute;bottom:18px;left:12px;width:240px;height:18px;background:#263238;border-radius:9px;display:none;">
      <div style="position:absolute;left:10%;top:-3px;width:3px;height:24px;background:#ffca28;"></div>
      <div id="hud-meter-fill" style="position:absolute;left:0;top:0;height:100%;width:0%;background:linear-gradient(90deg,#66bb6a,#ffca28,#ef5350);border-radius:9px;"></div>
    </div>
    <div id="hud-help" style="position:absolute;bottom:18px;right:12px;color:rgba(255,255,255,.9);font-size:12px;text-align:right;">←/→ aim · space/click/tap: start meter, set power, set accuracy</div>
  `;
  const top = root.querySelector('#hud-top') as HTMLElement;
  const clubEl = root.querySelector('#hud-club') as HTMLElement;
  const msg = root.querySelector('#hud-msg') as HTMLElement;
  const meter = root.querySelector('#hud-meter') as HTMLElement;
  const fill = root.querySelector('#hud-meter-fill') as HTMLElement;

  return {
    update(phase, hole, club) {
      const dist = Math.hypot(
        hole.holePos.x - hole.ballPos.x,
        hole.holePos.z - hole.ballPos.z,
      );
      top.textContent = `Strokes: ${hole.strokes} · ⛳ ${dist.toFixed(0)} m`;
      top.dataset.strokes = String(hole.strokes);
      top.dataset.phase = phase;
      clubEl.textContent = CLUBS[club].name;
      msg.style.display = phase === 'holed' ? 'block' : 'none';
      msg.textContent = phase === 'holed' ? `In! ${hole.strokes} strokes` : '';
    },
    setMeter(visible, value) {
      meter.style.display = visible ? 'block' : 'none';
      fill.style.width = `${(value * 100).toFixed(1)}%`;
    },
  };
}
```

- [ ] **Step 6: Wire everything in `src/main.ts`** (replaces the placeholder)

```ts
// src/main.ts
import './style.css';
import { createScene } from './render/scene';
import { createHud } from './ui/hud';
import { Game, makeFlatHole, type GamePhase } from './app/game';
import { initPhysics } from './sim/shot';
import { ThreeClickMeter } from './input/threeClick';
import type { ClubId, HoleState, ShotIntent } from './sim/types';

async function boot() {
  await initPhysics();

  const params = new URLSearchParams(location.search);
  const seed = Number(params.get('seed') ?? 42);
  const instant = params.has('instant'); // tests: skip flight animation

  const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const hudRoot = document.querySelector('#hud') as HTMLElement;

  const holePos = makeFlatHole(seed).holePos;
  const scene = createScene(canvas, holePos);
  const hud = createHud(hudRoot);

  let club: ClubId = 'driver';
  const meter = new ThreeClickMeter();

  const game = new Game(seed, {
    onStateChange: (phase: GamePhase, hole: HoleState) => hud.update(phase, hole, club),
    setBallPosition: (p) => scene.setBallPosition(p),
    setAimDir: (yaw) => scene.setAimDir(yaw),
    frameBall: () => scene.frameBall(),
  });

  const clubKeys: Record<string, ClubId> = { '1': 'driver', '2': 'iron7', '3': 'wedge', '4': 'putter' };

  function pressAction() {
    if (game.phase === 'aiming' && meter.phase === 'idle') {
      meter.begin(performance.now());
      game.setPhase('metering');
    } else if (meter.phase === 'power' || meter.phase === 'accuracy') {
      meter.click(performance.now());
      if (meter.phase === 'done') {
        const { power, contactError } = meter.result();
        meter.reset();
        hud.setMeter(false, 0);
        game.performSwing({ club, aimDir: game.aimDir, power, contactError });
        if (instant) game.update(60);
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') game.adjustAim(-0.03);
    if (e.key === 'ArrowRight') game.adjustAim(0.03);
    if (e.key === ' ') { e.preventDefault(); pressAction(); }
    const c = clubKeys[e.key];
    if (c && game.phase === 'aiming') { club = c; hud.update(game.phase, game.hole, club); }
  });
  canvas.addEventListener('pointerdown', pressAction);
  window.addEventListener('resize', () => scene.resize());

  let last = performance.now();
  function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    if (meter.phase === 'power' || meter.phase === 'accuracy') {
      hud.setMeter(true, meter.value(now));
    }
    game.update(dt);
    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Deterministic hooks for Playwright — not a public API.
  (window as unknown as Record<string, unknown>).__golfTest = {
    getState: () => ({ phase: game.phase, strokes: game.hole.strokes, ballPos: game.hole.ballPos, holedOut: game.hole.holedOut }),
    swing: (intent: Partial<ShotIntent>) => {
      game.performSwing({
        club: intent.club ?? club,
        aimDir: intent.aimDir ?? game.aimDir,
        power: intent.power ?? 1,
        contactError: intent.contactError ?? 0,
      });
      if (instant) game.update(60);
    },
    ready: true,
  };
}

void boot();
```

- [ ] **Step 7: Verify the full game manually**

Run: `npm run dev`, open the printed URL.
Expected: green field, white ball, flag 150 m out; space starts the meter, two more presses swing; ball flies, camera re-frames; strokes increment; sinking a putt shows "In!". Also verify `npm run typecheck`, `npm run lint`, `npm test` all pass.

- [ ] **Step 8: Commit**

```powershell
git add src
git commit -m "feat: playable walking-skeleton hole with 3-click swing"
```

---

### Task 10: Playwright integration test

**Files:**
- Create: `playwright.config.ts`, `e2e/playthrough.spec.ts`

- [ ] **Step 1: Install browsers**

```powershell
npx playwright install chromium
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { args: ['--use-angle=swiftshader'] }, // software WebGL: same pixels everywhere
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
    { name: 'ipad', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
  ],
});
```

- [ ] **Step 3: Write `e2e/playthrough.spec.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:e2e`
Expected: 4 passed (2 tests × 2 projects). If the play-out loop fails to hole within 12 swings, the auto-caddie power constants need a nudge — print `dist` per loop and adjust the club thresholds; determinism means once it passes, it always passes.

- [ ] **Step 5: Commit**

```powershell
git add playwright.config.ts e2e
git commit -m "test: e2e playthrough on fixed seed"
```

---

### Task 11: Visual snapshot test

**Files:**
- Create: `e2e/visual.spec.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Write `e2e/visual.spec.ts`** (snapshots are CI-generated only — local GPUs disagree with CI's software rasterizer)

```ts
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
```

- [ ] **Step 2: Add Playwright outputs to `.gitignore`**

Append these lines to `.gitignore`:

```
test-results/
playwright-report/
```

- [ ] **Step 3: Verify the skip works locally**

Run: `npm run test:e2e`
Expected: playthrough tests pass; visual test reports "skipped" (no CI env). Baselines will be created by the CI snapshot-update workflow in Task 12.

- [ ] **Step 4: Commit**

```powershell
git add e2e/visual.spec.ts .gitignore
git commit -m "test: ci-only visual snapshot of aiming view"
```

---

### Task 12: GitHub Actions CI + Pages deploy + snapshot updater

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/update-snapshots.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build -- --base=/${{ github.event.repository.name }}/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 2: Write `.github/workflows/update-snapshots.yml`** (manual re-baseline when a visual change is intentional)

```yaml
name: Update visual snapshots

on:
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.ref_name }}
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test e2e/visual.spec.ts --update-snapshots
        env:
          CI: 'true'
      - name: Commit updated baselines
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add e2e/*-snapshots/
          git diff --cached --quiet || git commit -m "chore: update visual snapshot baselines"
          git push
```

- [ ] **Step 3: Commit**

```powershell
git add .github
git commit -m "ci: test gate, pages deploy, snapshot updater"
```

- [ ] **Step 4: Create the GitHub repo and push** (requires user's GitHub account; `gh` CLI). CI triggers on `main`, so rename the local branch first:

```powershell
git branch -M main
gh repo create golf-game --public --source . --push
```

Expected: repo created, `main` pushed, CI run starts.

- [ ] **Step 5: Enable GitHub Pages and generate first baselines**

1. Repo Settings → Pages → Build and deployment → Source: **GitHub Actions** (or run `gh api repos/{owner}/golf-game/pages -X POST -f build_type=workflow`).
2. Run the snapshot updater once to create baselines: `gh workflow run update-snapshots.yml`, wait for it to push the baseline commit, then `git pull`.
3. Re-run / wait for CI on main: `gh run watch` → Expected: test job green (visual test now has baselines), deploy job publishes.

- [ ] **Step 6: Verify the deployed game**

Open `https://<username>.github.io/golf-game/` → Expected: the playable hole, identical to local dev.

---

### Task 13: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Golf Game

A web-based 3D golf game — low-poly cartoon style, deterministic physics.
Play it: `https://<username>.github.io/golf-game/`

## Develop

- `npm install` then `npm run dev`
- Controls: ←/→ aim · space/click/tap drives the 3-click meter · 1–4 select club
- `?seed=N` fixes the RNG seed; `&instant=1` skips flight animation

## Test

- `npm test` — unit (sim core is pure + deterministic; golden tests are exact)
- `npm run test:e2e` — Playwright playthrough; visual snapshots run in CI only
  (re-baseline via the "Update visual snapshots" workflow)

## Architecture

See `docs/superpowers/specs/2026-06-11-golf-game-design.md`. Load-bearing rule:
`src/sim/` never imports DOM or Three.js, and never calls `Math.random()`.
```

- [ ] **Step 2: Commit and push**

```powershell
git add README.md
git commit -m "docs: readme"
git push
```

---

## Verification checklist (end of milestone)

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` all green locally
- [ ] CI green on main, including visual snapshot comparison
- [ ] Game playable at the GitHub Pages URL on desktop browser
- [ ] Game playable on an iPad (tap drives the meter) — manual check
- [ ] Determinism: same seed + same swings = same result, locally and in CI
