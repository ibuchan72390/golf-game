# Milestone 2: Real Golf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Procedurally generated par-3 holes with surface lies, putting mode, a hold-and-release swing with always-visible prompts, flight camera + trail, toon look, and the Arcade HUD — replacing the walking skeleton's flat hole and confusing swing.

**Architecture:** A `CourseFile` heightfield-grid format is the contract between the seeded generator (`src/course/`), the sim (Rapier heightfield collider + per-surface strike/roll physics), and the renderer (vertex-colored low-poly terrain mesh). Input grows a second meter behind the existing `ShotIntent` abstraction; settings persist via a versioned localStorage profile. Spec: `docs/superpowers/specs/2026-06-12-milestone-2-design.md`.

**Tech Stack:** Existing M1 stack (TypeScript, Vite, Three.js, `@dimforge/rapier3d-compat`, Vitest, Playwright, GitHub Actions).

---

## Conventions & format refinements (read first)

- **Grid mapping:** `x = (ix - grid.width / 2) * cellSize`, `z = -iz * cellSize`. The grid spans x ∈ [−W·c/2, +W·c/2], z ∈ [0, −D·c]. Tee near z ≈ −10, pin toward −(10+length).
- **Heights are VERTEX values** (length `(width+1)*(depth+1)`, row-major: `iz * (width+1) + ix`). **Surfaces are CELL values** (length `width*depth`, row-major: `iz * width + ix`). This refines the spec's "parallel arrays" wording — Rapier heightfields and bilinear sampling need vertex data; surface lookup needs cell data.
- **RNG draw order inside `resolveShot` is part of the determinism contract:** draw 1 = lie roll, draw 2 = wobble. Never reorder.
- All M1 conventions still hold (meters, Y up, −Z toward pin, `aimDir` → `(sin, 0, -cos)`, sim purity, single-line commit messages).
- Work happens in a worktree branch created at execution time (orchestrator's job). All paths relative to repo root.

## File structure (new/modified)

```
src/course/format.ts        # CourseFile/HoleFile types, SURFACE enum, grid helpers (NEW)
src/course/generate.ts      # seeded par-3 generator (NEW)
src/course/fixtures.ts      # flatHoleFile() test fixture (NEW)
src/sim/lies.ts             # strike modifiers per lie (NEW)
src/sim/surfaces.ts         # per-surface roll physics table (NEW)
src/sim/powerScale.ts       # putter/chip meter rescale (NEW)
src/sim/scoring.ts          # strokes-vs-par names (NEW)
src/sim/shot.ts             # heightfield collider, lie handling (MODIFY)
src/sim/types.ts            # HoleState gains hole + lie (MODIFY)
src/input/holdRelease.ts    # HoldReleaseMeter (NEW)
src/input/threeClick.ts     # gains stage() (MODIFY)
src/save/profile.ts         # versioned localStorage profile (NEW)
src/render/cameraRig.ts     # aiming/flight/settle/putting camera (NEW)
src/render/terrain.ts       # heightfield → vertex-colored mesh (NEW)
src/render/trail.ts         # ball trail + landing marker (NEW)
src/render/scene.ts         # toon materials, outlines, sky, blob shadow (MODIFY)
src/ui/hud.ts               # Arcade HUD v1 rewrite (MODIFY)
src/ui/prompts.ts           # per-scheme stage prompt text (NEW)
src/ui/settings.ts          # gear panel (NEW)
src/app/game.ts             # HoleFile, club ownership, auto-putter, power scaling (MODIFY)
src/main.ts                 # wiring, dev route, hook extensions (MODIFY)
src/dev/courses.ts          # ?dev=courses 2D-canvas gallery (NEW)
e2e/playthrough.spec.ts     # generated-course playthrough (MODIFY)
e2e/prompts.spec.ts         # prompt visibility/stages (NEW)
e2e/settings.spec.ts        # scheme toggle + persistence (NEW)
e2e/visual.spec.ts          # new snapshot set (MODIFY)
README.md                   # controls update (MODIFY)
```

---

### Task 1: Course format and grid helpers

**Files:**
- Create: `src/course/format.ts`
- Test: `src/course/format.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/course/format.test.ts
import { describe, expect, it } from 'vitest';
import { SURFACE, heightAt, surfaceAt, type HoleFile } from './format';

function tinyHole(): HoleFile {
  // 2×2 cells (3×3 vertices), cellSize 10: x ∈ [-10,10], z ∈ [0,-20]
  return {
    par: 3,
    grid: { width: 2, depth: 2, cellSize: 10 },
    heights: [0, 0, 0, 0, 4, 0, 0, 0, 0], // center vertex (ix=1,iz=1) raised 4 m
    surfaces: [SURFACE.fairway, SURFACE.rough, SURFACE.green, SURFACE.sand],
    tee: { x: 0, y: 0, z: 0 },
    pin: { x: 0, y: 0, z: -20 },
    difficulty: 0.5,
  };
}

describe('heightAt', () => {
  it('returns vertex heights at vertices', () => {
    expect(heightAt(tinyHole(), 0, -10)).toBeCloseTo(4); // center vertex
    expect(heightAt(tinyHole(), -10, 0)).toBeCloseTo(0);
  });
  it('bilinearly interpolates between vertices', () => {
    expect(heightAt(tinyHole(), 0, -5)).toBeCloseTo(2); // halfway to center
    expect(heightAt(tinyHole(), -5, -5)).toBeCloseTo(1); // diagonal quarter
  });
  it('clamps out-of-bounds to edge', () => {
    expect(heightAt(tinyHole(), -999, 5)).toBeCloseTo(0);
  });
});

describe('surfaceAt', () => {
  it('maps world position to cell surface', () => {
    expect(surfaceAt(tinyHole(), -5, -5)).toBe(SURFACE.fairway);  // cell (0,0)
    expect(surfaceAt(tinyHole(), 5, -5)).toBe(SURFACE.rough);     // cell (1,0)
    expect(surfaceAt(tinyHole(), -5, -15)).toBe(SURFACE.green);   // cell (0,1)
    expect(surfaceAt(tinyHole(), 5, -15)).toBe(SURFACE.sand);     // cell (1,1)
  });
  it('out-of-bounds is rough', () => {
    expect(surfaceAt(tinyHole(), 999, -5)).toBe(SURFACE.rough);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/course/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement `src/course/format.ts`**

```ts
// src/course/format.ts
import type { Vec3 } from '../sim/types';

export const SURFACE = { fairway: 0, rough: 1, green: 2, sand: 3 } as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];

export interface GridSpec {
  /** cells along x */
  width: number;
  /** cells along -z */
  depth: number;
  /** meters per cell */
  cellSize: number;
}

export interface HoleFile {
  par: 3 | 4 | 5;
  grid: GridSpec;
  /** vertex heights, (width+1)*(depth+1), row-major iz*(width+1)+ix */
  heights: number[];
  /** cell surfaces, width*depth, row-major iz*width+ix */
  surfaces: Surface[];
  tee: Vec3;
  pin: Vec3;
  /** 0..1 */
  difficulty: number;
}

export interface CourseFile {
  version: 1;
  name: string;
  seed: number;
  holes: HoleFile[];
}

/** world x,z → fractional vertex coords (fx along x, fz along -z), clamped to grid */
function toGridCoords(hole: HoleFile, x: number, z: number): { fx: number; fz: number } {
  const { width, depth, cellSize } = hole.grid;
  const fx = Math.min(Math.max(x / cellSize + width / 2, 0), width);
  const fz = Math.min(Math.max(-z / cellSize, 0), depth);
  return { fx, fz };
}

export function heightAt(hole: HoleFile, x: number, z: number): number {
  const { width } = hole.grid;
  const { fx, fz } = toGridCoords(hole, x, z);
  // fx/fz are clamped to [0, width]/[0, depth]; capping at width-1/depth-1 keeps
  // the bilinear cell in range when sampling exactly on the far edge.
  const ix = Math.min(Math.floor(fx), width - 1);
  const iz = Math.min(Math.floor(fz), hole.grid.depth - 1);
  const tx = fx - ix;
  const tz = fz - iz;
  const row = width + 1;
  const h00 = hole.heights[iz * row + ix]!;
  const h10 = hole.heights[iz * row + ix + 1]!;
  const h01 = hole.heights[(iz + 1) * row + ix]!;
  const h11 = hole.heights[(iz + 1) * row + ix + 1]!;
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}

export function surfaceAt(hole: HoleFile, x: number, z: number): Surface {
  const { width, depth, cellSize } = hole.grid;
  const ix = Math.floor(x / cellSize + width / 2);
  const iz = Math.floor(-z / cellSize);
  if (ix < 0 || ix >= width || iz < 0 || iz >= depth) return SURFACE.rough;
  return hole.surfaces[iz * width + ix]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/course/format.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/course
git commit -m "feat: coursefile format and grid sampling"
```

---

### Task 2: Par-3 generator

**Files:**
- Create: `src/course/generate.ts`
- Test: `src/course/generate.test.ts`

- [ ] **Step 1: Write the failing tests** (invariants across many seeds + determinism)

```ts
// src/course/generate.test.ts
import { describe, expect, it } from 'vitest';
import { generateCourse, generateHole } from './generate';
import { SURFACE, heightAt, surfaceAt } from './format';

describe('generateHole invariants (seeds 1..200)', () => {
  for (const batchStart of [1, 51, 101, 151]) {
    it(`seeds ${batchStart}..${batchStart + 49} satisfy all invariants`, () => {
      for (let seed = batchStart; seed < batchStart + 50; seed++) {
        const h = generateHole(seed);
        const len = Math.hypot(h.pin.x - h.tee.x, h.pin.z - h.tee.z);
        expect(len).toBeGreaterThanOrEqual(85);
        expect(len).toBeLessThanOrEqual(190);
        expect(h.par).toBe(3);
        expect(h.heights.length).toBe((h.grid.width + 1) * (h.grid.depth + 1));
        expect(h.surfaces.length).toBe(h.grid.width * h.grid.depth);
        expect(surfaceAt(h, h.pin.x, h.pin.z)).toBe(SURFACE.green);
        expect(surfaceAt(h, h.tee.x, h.tee.z)).not.toBe(SURFACE.sand);
        expect(h.difficulty).toBeGreaterThanOrEqual(0);
        expect(h.difficulty).toBeLessThanOrEqual(1);
        for (const v of h.heights) expect(Math.abs(v)).toBeLessThanOrEqual(6);
        expect(h.tee.y).toBeCloseTo(heightAt(h, h.tee.x, h.tee.z), 5);
        expect(h.pin.y).toBeCloseTo(heightAt(h, h.pin.x, h.pin.z), 5);
      }
    });
  }
});

describe('determinism', () => {
  it('same seed → byte-identical CourseFile', () => {
    expect(JSON.stringify(generateCourse(42))).toEqual(JSON.stringify(generateCourse(42)));
  });
  it('different seeds differ', () => {
    expect(JSON.stringify(generateHole(1))).not.toEqual(JSON.stringify(generateHole(2)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/course/generate.test.ts`
Expected: FAIL — cannot resolve `./generate`.

- [ ] **Step 3: Implement `src/course/generate.ts`**

```ts
// src/course/generate.ts
import { createRng } from '../sim/rng';
import { SURFACE, heightAt, type CourseFile, type HoleFile, type Surface } from './format';

const CELL = 1;
const WIDTH = 60; // cells
const NOISE_WAVELENGTH = 16; // cells
const NOISE_AMPLITUDE = 1.5; // meters

/** deterministic lattice hash for value noise — independent of draw order */
function hash2d(seed: number, ix: number, iz: number): number {
  let h = (seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smooth(x - x0), tz = smooth(z - z0);
  const a = hash2d(seed, x0, z0), b = hash2d(seed, x0 + 1, z0);
  const c = hash2d(seed, x0, z0 + 1), d = hash2d(seed, x0 + 1, z0 + 1);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz; // 0..1
}

export function generateHole(seed: number): HoleFile {
  const rng = createRng(seed);
  const length = 90 + rng() * 90; // 90..180 m tee→pin
  const depth = Math.ceil(length + 40); // cells (CELL=1)
  const tee = { x: 0, y: 0, z: -10 };
  const pinX = (rng() - 0.5) * 24;
  const pin = { x: pinX, y: 0, z: -(10 + length) };
  const greenR = 8 + rng() * 4; // 8..12 m
  const slopeDir = rng() * Math.PI * 2;
  const slopeMag = 0.2 + rng() * 0.3; // green tilt, meters across green radius

  const row = WIDTH + 1;
  const heights = new Array<number>(row * (depth + 1));
  for (let iz = 0; iz <= depth; iz++) {
    for (let ix = 0; ix <= WIDTH; ix++) {
      const x = (ix - WIDTH / 2) * CELL;
      const z = -iz * CELL;
      let h = (valueNoise(seed, ix / NOISE_WAVELENGTH, iz / NOISE_WAVELENGTH) - 0.5) * 2 * NOISE_AMPLITUDE;
      // flatten near tee and green so lies are playable
      const dTee = Math.hypot(x - tee.x, z - tee.z);
      const dPin = Math.hypot(x - pin.x, z - pin.z);
      const flat = Math.min(dTee / 15, 1) * Math.min(Math.max((dPin - greenR) / 15, 0), 1);
      h *= flat;
      if (dPin < greenR) {
        // gently tilted green plane
        h = ((x - pin.x) * Math.cos(slopeDir) + (z - pin.z) * Math.sin(slopeDir)) * (slopeMag / greenR);
      }
      heights[iz * row + ix] = h;
    }
  }

  const surfaces = new Array<Surface>(WIDTH * depth);
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < WIDTH; ix++) {
      const x = (ix + 0.5 - WIDTH / 2) * CELL;
      const z = -(iz + 0.5) * CELL;
      const dPin = Math.hypot(x - pin.x, z - pin.z);
      let s: Surface = SURFACE.rough;
      const t = Math.min(Math.max((z - tee.z) / (pin.z - tee.z), 0), 1);
      const corridorX = tee.x + (pin.x - tee.x) * t;
      if (Math.abs(x - corridorX) < 12 && z <= tee.z + 8 && z >= pin.z - 4) s = SURFACE.fairway;
      if (dPin < greenR) s = SURFACE.green;
      surfaces[iz * WIDTH + ix] = s;
    }
  }

  // 1-3 bunkers guarding the green
  const bunkerCount = 1 + Math.floor(rng() * 3);
  let bunkerArea = 0;
  for (let b = 0; b < bunkerCount; b++) {
    const ang = rng() * Math.PI * 2;
    const dist = greenR + 3 + rng() * 5;
    const r = 3 + rng() * 3;
    const bx = pin.x + Math.cos(ang) * dist;
    const bz = pin.z + Math.sin(ang) * dist;
    if (Math.hypot(bx - tee.x, bz - tee.z) < 15) continue; // never near the tee
    bunkerArea += Math.PI * r * r;
    for (let iz = 0; iz < depth; iz++) {
      for (let ix = 0; ix < WIDTH; ix++) {
        const x = (ix + 0.5 - WIDTH / 2) * CELL;
        const z = -(iz + 0.5) * CELL;
        if (Math.hypot(x - bx, z - bz) < r && surfaces[iz * WIDTH + ix] !== SURFACE.green) {
          surfaces[iz * WIDTH + ix] = SURFACE.sand;
        }
      }
    }
  }

  const hole: HoleFile = {
    par: 3,
    grid: { width: WIDTH, depth, cellSize: CELL },
    heights,
    surfaces,
    tee,
    pin,
    difficulty: 0,
  };
  hole.tee.y = heightAt(hole, tee.x, tee.z);
  hole.pin.y = heightAt(hole, pin.x, pin.z);
  hole.difficulty = Math.min(
    1,
    0.4 * ((length - 90) / 90) + 0.4 * Math.min(bunkerArea / 250, 1) + 0.2 * (1 - (greenR - 8) / 4),
  );
  return hole;
}

export function generateCourse(seed: number): CourseFile {
  return { version: 1, name: `Seed ${seed}`, seed, holes: [generateHole(seed)] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/course/generate.test.ts`
Expected: 6 passed. If an invariant fails on specific seeds (e.g., pin not on green because a bunker overwrote it — it can't, green is protected; or tee on sand — bunkers skip near-tee placements), print the failing seed and adjust the guard constants (`< 15` tee exclusion, corridor bounds), not the tests.

- [ ] **Step 5: Commit**

```powershell
git add src/course
git commit -m "feat: seeded par-3 generator"
```

### Task 3: Heightfield terrain in the sim

**Files:**
- Create: `src/course/fixtures.ts`
- Modify: `src/sim/types.ts`, `src/sim/shot.ts`, `src/sim/shot.test.ts`, `src/sim/holeout.test.ts`, `src/app/game.ts` (minimal compile fix only)
- Test: `src/sim/heightfield.test.ts`

- [ ] **Step 1: Add `hole` and `lie` to `HoleState` in `src/sim/types.ts`**

Append to the imports (type-only — runtime-erased, so no circular-import hazard):

```ts
import type { HoleFile, Surface } from '../course/format';
```

And extend `HoleState`:

```ts
export interface HoleState {
  seed: number;
  ballPos: Vec3;
  holePos: Vec3;
  /** capture radius in meters */
  holeRadius: number;
  strokes: number;
  holedOut: boolean;
  /** terrain this hole is played on */
  hole: HoleFile;
  /** surface under the ball at rest */
  lie: Surface;
}
```

- [ ] **Step 2: Create `src/course/fixtures.ts`**

```ts
// src/course/fixtures.ts — test fixtures, also used by game defaults until M3
import { SURFACE, type HoleFile, type Surface } from './format';

/** Flat 60×200 hole reproducing M1's flat world: pin at (0,0,-150), green disc r=10. */
export function flatHoleFile(fill: Surface = SURFACE.fairway): HoleFile {
  const width = 60, depth = 200, cellSize = 1;
  const heights = new Array<number>((width + 1) * (depth + 1)).fill(0);
  const surfaces = new Array<Surface>(width * depth).fill(fill);
  const pin = { x: 0, y: 0, z: -150 };
  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const x = (ix + 0.5 - width / 2) * cellSize;
      const z = -(iz + 0.5) * cellSize;
      if (Math.hypot(x - pin.x, z - pin.z) < 10) surfaces[iz * width + ix] = SURFACE.green;
    }
  }
  return { par: 3, grid: { width, depth, cellSize }, heights, surfaces, tee: { x: 0, y: 0, z: 0 }, pin, difficulty: 0.1 };
}

/** Ramp rising +0.05 m per +x meter — for verifying heightfield orientation. */
export function rampHoleFile(): HoleFile {
  const base = flatHoleFile();
  for (let iz = 0; iz <= base.grid.depth; iz++) {
    for (let ix = 0; ix <= base.grid.width; ix++) {
      const x = (ix - base.grid.width / 2) * base.grid.cellSize;
      base.heights[iz * (base.grid.width + 1) + ix] = x * 0.05;
    }
  }
  return base;
}
```

- [ ] **Step 3: Write the failing heightfield probe test**

```ts
// src/sim/heightfield.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { flatHoleFile, rampHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import { heightAt } from '../course/format';
import type { HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

function stateAt(x: number, z: number, hole = rampHoleFile()): HoleState {
  return {
    seed: 9, ballPos: { x, y: 0, z }, holePos: hole.pin, holeRadius: 0.15,
    strokes: 0, holedOut: false, hole, lie: SURFACE.fairway,
  };
}

describe('heightfield collider orientation', () => {
  // A zero-power putt settles in place; rest height must match heightAt.
  for (const [x, z] of [[10, -30], [-20, -80], [25, -160]] as const) {
    it(`ball rests on terrain at (${x}, ${z})`, () => {
      const { newState } = resolveShot(stateAt(x, z), { club: 'putter', aimDir: 0, power: 0, contactError: 0 });
      expect(newState.ballPos.y).toBeCloseTo(heightAt(rampHoleFile(), newState.ballPos.x, newState.ballPos.z), 1);
      expect(Math.hypot(newState.ballPos.x - x, newState.ballPos.z - z)).toBeLessThan(3); // may roll a little downslope
    });
  }
  it('flat hole keeps resting at y≈0', () => {
    const { newState } = resolveShot(stateAt(0, -50, flatHoleFile()), { club: 'putter', aimDir: 0, power: 0, contactError: 0 });
    expect(newState.ballPos.y).toBeCloseTo(0, 1);
  });
});
```

Run: `npx vitest run src/sim/heightfield.test.ts` → Expected: FAIL (HoleState shape/compile errors first, then behavior).

- [ ] **Step 4: Modify `src/sim/shot.ts`** — replace the flat cuboid with a heightfield and spawn the ball on the terrain:

Replace the ground-collider block inside `resolveShot` with:

```ts
    buildTerrainCollider(world, state.hole);
```

Change the ball body translation to spawn on the terrain (replaces `Math.max(state.ballPos.y, 0) + BALL_RADIUS`):

```ts
      .setTranslation(
        state.ballPos.x,
        heightAt(state.hole, state.ballPos.x, state.ballPos.z) + BALL_RADIUS,
        state.ballPos.z,
      )
```

Change the rest position (terrain may be below y=0, so drop the floor clamp) and record the lie:

```ts
  const restPos = holedOut
    ? { ...state.holePos }
    : { x: final.x, y: final.y - BALL_RADIUS, z: final.z };
```

```ts
  return {
    newState: {
      ...state,
      ballPos: restPos,
      strokes: state.strokes + 1,
      holedOut,
      lie: surfaceAt(state.hole, restPos.x, restPos.z),
    },
    trajectory,
  };
```

Add the helper and imports at module level:

```ts
import { heightAt, surfaceAt } from '../course/format';
import type { HoleFile } from '../course/format';
```

```ts
/**
 * Rapier heightfields are column-major with rows along Z and columns along X,
 * spanning scale.x × scale.z centered on the collider origin.
 * VERIFY with heightfield.test.ts — if rest heights mirror, flip the iz index
 * to `(depth - iz)` in the f32 fill below.
 */
function buildTerrainCollider(world: RAPIER.World, hole: HoleFile): void {
  const { width, depth, cellSize } = hole.grid;
  const f32 = new Float32Array((depth + 1) * (width + 1));
  for (let iz = 0; iz <= depth; iz++) {
    for (let ix = 0; ix <= width; ix++) {
      f32[ix * (depth + 1) + iz] = hole.heights[iz * (width + 1) + ix]!;
    }
  }
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(depth, width, f32, { x: width * cellSize, y: 1, z: depth * cellSize })
      .setTranslation(0, 0, -(depth * cellSize) / 2)
      .setFriction(0.8)
      .setRestitution(0.4),
  );
}
```

- [ ] **Step 5: Update existing tests' fixtures**

In `src/sim/shot.test.ts` and `src/sim/holeout.test.ts`, the `flatHole()` / `onGreen()` helpers must build the new `HoleState` shape. Both get the same two extra fields:

```ts
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
// inside the helper's returned object:
    hole: flatHoleFile(),
    lie: SURFACE.fairway,
```

In `src/app/game.ts`, make `makeFlatHole` compile against the new shape (full game changes come in Task 14 — this is the minimal fix):

```ts
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';

export function makeFlatHole(seed: number): HoleState {
  const hole = flatHoleFile();
  return {
    seed,
    ballPos: { ...hole.tee },
    holePos: { ...hole.pin },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
    hole,
    lie: SURFACE.fairway,
  };
}
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run` → Expected: all pass (every prior test plus the 4 new heightfield probes). If the ramp probes show mirrored heights (rest y matches `heightAt` at `-x` instead of `x`), flip the `iz` index as the helper comment says and re-run. `npm run lint`, `npm run typecheck` clean.

- [ ] **Step 7: Commit**

```powershell
git add src/course/fixtures.ts src/sim src/app/game.ts
git commit -m "feat: heightfield terrain collider in resolveShot"
```

---

### Task 4: Strike modifiers (lies)

**Files:**
- Create: `src/sim/lies.ts`
- Modify: `src/sim/shot.ts`
- Test: `src/sim/lies.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/lies.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { strikeModifier } from './lies';
import { initPhysics, resolveShot } from './shot';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import type { HoleState, ShotIntent } from './types';

beforeAll(async () => {
  await initPhysics();
});

describe('strikeModifier', () => {
  it('fairway and green are neutral', () => {
    expect(strikeModifier(SURFACE.fairway, 'driver', 0.5)).toEqual({ powerMul: 1, errorMul: 1 });
    expect(strikeModifier(SURFACE.green, 'putter', 0.5)).toEqual({ powerMul: 1, errorMul: 1 });
  });
  it('rough costs 20-35% power across the roll range', () => {
    expect(strikeModifier(SURFACE.rough, 'iron7', 0).powerMul).toBeCloseTo(0.8);
    expect(strikeModifier(SURFACE.rough, 'iron7', 1).powerMul).toBeCloseTo(0.65);
    expect(strikeModifier(SURFACE.rough, 'iron7', 0.5).errorMul).toBeGreaterThan(1);
  });
  it('sand is brutal without the wedge, manageable with it', () => {
    const bare = strikeModifier(SURFACE.sand, 'iron7', 0.5);
    const wedge = strikeModifier(SURFACE.sand, 'wedge', 0.5);
    expect(bare.powerMul).toBeLessThan(0.55);
    expect(wedge.powerMul).toBeGreaterThan(0.75);
    expect(bare.errorMul).toBeGreaterThan(wedge.errorMul);
  });
});

describe('resolveShot applies lie at strike', () => {
  function from(fill: Parameters<typeof flatHoleFile>[0]): HoleState {
    const hole = flatHoleFile(fill);
    return { seed: 11, ballPos: { x: 0, y: 0, z: -20 }, holePos: hole.pin, holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: fill ?? SURFACE.fairway };
  }
  const swing: ShotIntent = { club: 'iron7', aimDir: 0, power: 1, contactError: 0 };
  it('the same swing travels measurably shorter from rough', () => {
    const fairway = resolveShot(from(SURFACE.fairway), swing).newState.ballPos.z;
    const rough = resolveShot(from(SURFACE.rough), swing).newState.ballPos.z;
    expect(Math.abs(rough)).toBeLessThan(Math.abs(fairway) * 0.9);
  });
  it('sand without wedge barely advances; wedge mostly recovers', () => {
    const bare = resolveShot(from(SURFACE.sand), swing).newState.ballPos.z;
    const wedge = resolveShot(from(SURFACE.sand), { ...swing, club: 'wedge' }).newState.ballPos.z;
    const clean = resolveShot(from(SURFACE.fairway), { ...swing, club: 'wedge' }).newState.ballPos.z;
    expect(Math.abs(bare)).toBeLessThan(Math.abs(resolveShot(from(SURFACE.fairway), swing).newState.ballPos.z) * 0.55);
    expect(Math.abs(wedge)).toBeGreaterThan(Math.abs(clean) * 0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/lies.test.ts` → Expected: FAIL — cannot resolve `./lies`.

- [ ] **Step 3: Implement `src/sim/lies.ts`**

```ts
// src/sim/lies.ts
import { SURFACE, type Surface } from '../course/format';
import type { ClubId } from './types';

export interface StrikeModifier {
  powerMul: number;
  errorMul: number;
}

/** Lie penalty at strike. `roll` is a seeded RNG draw in [0,1). */
export function strikeModifier(lie: Surface, club: ClubId, roll: number): StrikeModifier {
  if (lie === SURFACE.rough) return { powerMul: 0.8 - 0.15 * roll, errorMul: 1.6 };
  if (lie === SURFACE.sand) {
    return club === 'wedge'
      ? { powerMul: 0.85, errorMul: 1.2 }
      : { powerMul: 0.45, errorMul: 2.5 };
  }
  return { powerMul: 1, errorMul: 1 };
}
```

- [ ] **Step 4: Integrate into `resolveShot` (`src/sim/shot.ts`)**

Replace the RNG/launch block with (DRAW ORDER IS CONTRACT: lie roll first, wobble second):

```ts
  const rng = createRng(state.seed + state.strokes * 1013);
  const lieAtStrike = surfaceAt(state.hole, state.ballPos.x, state.ballPos.z);
  const mod = strikeModifier(lieAtStrike, intent.club, rng());
  const adjusted: ShotIntent = {
    ...intent,
    power: intent.power * mod.powerMul,
    contactError: Math.max(-1, Math.min(1, intent.contactError * mod.errorMul)),
  };
  const v = launchVelocity(CLUBS[intent.club], adjusted, rng());
```

Add `import { strikeModifier } from './lies';`.

- [ ] **Step 5: Run the suite**

Run: `npx vitest run` → Expected: all pass (5 new lies tests included). The RNG draw-order change alters mishit dispersion values but no existing test pins those exactly. Lint + typecheck clean.

- [ ] **Step 6: Commit**

```powershell
git add src/sim
git commit -m "feat: lie strike modifiers"
```

---

### Task 5: Per-surface roll physics

**Files:**
- Create: `src/sim/surfaces.ts`
- Modify: `src/sim/shot.ts`
- Test: `src/sim/surfaces.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/surfaces.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE, type Surface } from '../course/format';
import type { HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

function rollFrom(fill: Surface): number {
  const hole = flatHoleFile(fill);
  const state: HoleState = {
    seed: 3, ballPos: { x: 0, y: 0, z: -20 }, holePos: { x: 0, y: 0, z: -190 }, // pin far away: pure roll test, no capture
    holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: fill,
  };
  // putter strike has no lie power penalty on green/fairway; use fairway-vs-green-vs-rough relative roll
  const { newState } = resolveShot(state, { club: 'putter', aimDir: 0, power: 0.6, contactError: 0 });
  return Math.abs(newState.ballPos.z) - 20;
}

describe('per-surface roll', () => {
  it('green rolls farther than fairway, fairway farther than rough', () => {
    const green = rollFrom(SURFACE.green);
    const fairway = rollFrom(SURFACE.fairway);
    const rough = rollFrom(SURFACE.rough);
    expect(green).toBeGreaterThan(fairway * 1.15);
    expect(fairway).toBeGreaterThan(rough * 1.5);
  });
  it('sand stops the ball almost immediately', () => {
    expect(rollFrom(SURFACE.sand)).toBeLessThan(2);
  });
});
```

Note: `rollFrom(SURFACE.rough)` and `rollFrom(SURFACE.sand)` include the rough/sand STRIKE penalty from Task 4 as well — that's fine; the assertions compare total advance, which is what gameplay feels.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/surfaces.test.ts` → Expected: FAIL — cannot resolve `./surfaces`.

- [ ] **Step 3: Implement `src/sim/surfaces.ts`**

```ts
// src/sim/surfaces.ts
import { SURFACE, type Surface } from '../course/format';

export interface SurfacePhysics {
  friction: number;
  /** linear damping while the ball is in ground contact */
  damping: number;
}

export const AIR_DAMPING = 0.3;

export const SURFACE_PHYSICS: Record<Surface, SurfacePhysics> = {
  [SURFACE.fairway]: { friction: 0.6, damping: 0.35 },
  [SURFACE.rough]: { friction: 1.2, damping: 1.4 },
  [SURFACE.green]: { friction: 0.45, damping: 0.25 },
  [SURFACE.sand]: { friction: 2.0, damping: 5.0 },
};
```

- [ ] **Step 4: Apply per-step in `src/sim/shot.ts`**

Keep a reference to the ball collider when creating it:

```ts
  const ballCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS).setRestitution(0.55).setFriction(0.6).setDensity(1100),
    body,
  );
```

Inside the step loop, after reading `p` and `vel`, add:

```ts
    const surf = surfaceAt(state.hole, p.x, p.z);
    const grounded = p.y - heightAt(state.hole, p.x, p.z) < BALL_RADIUS * 3;
    body.setLinearDamping(grounded ? SURFACE_PHYSICS[surf].damping : AIR_DAMPING);
    ballCollider.setFriction(SURFACE_PHYSICS[surf].friction);
```

Add `import { AIR_DAMPING, SURFACE_PHYSICS } from './surfaces';`. The body's initial `setLinearDamping(0.3)` stays (it's the air value until the first step).

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run` → Expected: all pass (2 new roll tests included). The fairway grounded damping (0.35 vs old 0.3) slightly shortens roll-out; the M1 range assertions (drive z ∈ (−320, −120)) have ample headroom. If a range test fails, tune `SURFACE_PHYSICS` toward the old 0.3, not the tests. Lint + typecheck clean. Also re-run twice for the determinism guard.

- [ ] **Step 6: Commit**

```powershell
git add src/sim
git commit -m "feat: per-surface roll physics"
```

### Task 6: Putting & chipping power rescale

**Files:**
- Create: `src/sim/powerScale.ts`
- Test: `src/sim/powerScale.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/powerScale.test.ts
import { describe, expect, it } from 'vitest';
import { meterMaxSpeed } from './powerScale';
import { CLUBS } from './clubs';
import { SURFACE } from '../course/format';

describe('meterMaxSpeed', () => {
  it('putter full bar scales with distance (touch on short putts)', () => {
    const short = meterMaxSpeed('putter', SURFACE.green, 3);
    const long = meterMaxSpeed('putter', SURFACE.green, 15);
    expect(short).toBeLessThan(long);
    expect(short).toBeGreaterThanOrEqual(2); // enough to reach + drop
    expect(long).toBeLessThanOrEqual(CLUBS.putter.maxSpeed);
  });
  it('a full-bar putt at 10 m would roll past but not absurdly far', () => {
    // linear damping ≈ 0.3 → roll distance ≈ v0 / 0.3
    const v0 = meterMaxSpeed('putter', SURFACE.green, 10);
    const roll = v0 / 0.3;
    expect(roll).toBeGreaterThan(10);
    expect(roll).toBeLessThan(30);
  });
  it('wedge chips rescale inside 40 m off-green', () => {
    const chip = meterMaxSpeed('wedge', SURFACE.fairway, 20);
    expect(chip).toBeLessThan(CLUBS.wedge.maxSpeed);
    expect(chip).toBeGreaterThan(5);
  });
  it('full swings are untouched', () => {
    expect(meterMaxSpeed('driver', SURFACE.fairway, 200)).toBe(CLUBS.driver.maxSpeed);
    expect(meterMaxSpeed('wedge', SURFACE.fairway, 80)).toBe(CLUBS.wedge.maxSpeed);
    expect(meterMaxSpeed('wedge', SURFACE.green, 20)).toBe(CLUBS.wedge.maxSpeed); // on green you'd putt; no chip rescale
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/powerScale.test.ts` → Expected: FAIL — cannot resolve `./powerScale`.

- [ ] **Step 3: Implement `src/sim/powerScale.ts`**

```ts
// src/sim/powerScale.ts
import { CLUBS } from './clubs';
import { SURFACE, type Surface } from '../course/format';
import type { ClubId } from './types';

/** Matches the grounded green damping; roll distance ≈ v0 / ROLL_DECEL. */
const ROLL_DECEL = 0.3;
const CHIP_RANGE_M = 40;

/**
 * The speed a FULL meter bar maps to for the current shot. The meter's 0..1
 * power output is multiplied by (meterMaxSpeed / club.maxSpeed) by the Game,
 * so the sim itself stays untouched.
 */
export function meterMaxSpeed(club: ClubId, lie: Surface, distToPin: number): number {
  if (club === 'putter') {
    return Math.min(CLUBS.putter.maxSpeed, Math.max(2, ROLL_DECEL * distToPin * 1.8 + 1));
  }
  if (club === 'wedge' && lie !== SURFACE.green && distToPin < CHIP_RANGE_M) {
    return Math.min(CLUBS.wedge.maxSpeed, Math.sqrt(9.81 * Math.max(distToPin, 5)) * 1.2);
  }
  return CLUBS[club].maxSpeed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/powerScale.test.ts` → Expected: 4 passed. The constants (`1.8`, `+1`, `1.2`) are gameplay tuning inside test-pinned ranges — adjust constants, never assertions, if a bound misses.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/powerScale.ts src/sim/powerScale.test.ts
git commit -m "feat: putting and chip meter rescale"
```

---

### Task 7: Scoring names

**Files:**
- Create: `src/sim/scoring.ts`
- Test: `src/sim/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/scoring.test.ts
import { describe, expect, it } from 'vitest';
import { scoreName } from './scoring';

describe('scoreName', () => {
  it('names the classics', () => {
    expect(scoreName(1, 3)).toBe('Ace!');
    expect(scoreName(1, 5)).toBe('Ace!');
    expect(scoreName(2, 5)).toBe('Albatross!');
    expect(scoreName(3, 5)).toBe('Eagle!');
    expect(scoreName(2, 3)).toBe('Birdie!');
    expect(scoreName(3, 3)).toBe('Par');
    expect(scoreName(4, 3)).toBe('Bogey');
    expect(scoreName(5, 3)).toBe('Double Bogey');
    expect(scoreName(7, 3)).toBe('+4');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/scoring.test.ts` → Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 3: Implement `src/sim/scoring.ts`**

```ts
// src/sim/scoring.ts
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'Ace!';
  const diff = strokes - par;
  if (diff <= -3) return 'Albatross!';
  if (diff === -2) return 'Eagle!';
  if (diff === -1) return 'Birdie!';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double Bogey';
  return `+${diff}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/scoring.test.ts` → Expected: 1 passed (9 assertions).

- [ ] **Step 5: Commit**

```powershell
git add src/sim/scoring.ts src/sim/scoring.test.ts
git commit -m "feat: strokes-vs-par score names"
```

---

### Task 8: HoldReleaseMeter + swing stages

**Files:**
- Create: `src/input/holdRelease.ts`
- Modify: `src/input/threeClick.ts` (add `stage()`)
- Test: `src/input/holdRelease.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/input/holdRelease.test.ts
import { describe, expect, it } from 'vitest';
import { CHARGE_MS, HoldReleaseMeter } from './holdRelease';

describe('HoldReleaseMeter', () => {
  it('walks idle → charging → contact → done', () => {
    const m = new HoldReleaseMeter();
    expect(m.phase).toBe('idle');
    expect(m.stage()).toBe('ready');
    m.press(1000);
    expect(m.phase).toBe('charging');
    expect(m.stage()).toBe('charging');
    m.release(1000 + CHARGE_MS); // held full duration → power 1
    expect(m.phase).toBe('contact');
    expect(m.stage()).toBe('contact');
    m.tap(1000 + CHARGE_MS + 225); // contact bar at value 0.5 = band center (period 900)
    expect(m.phase).toBe('done');
    const r = m.result();
    expect(r.power).toBeCloseTo(1);
    expect(r.contactError).toBeCloseTo(0, 5);
  });

  it('short hold gives partial power; over-hold caps at 1', () => {
    const m = new HoldReleaseMeter();
    m.press(0);
    m.release(CHARGE_MS / 2);
    m.tap(CHARGE_MS / 2 + 225);
    expect(m.result().power).toBeCloseTo(0.5);

    const m2 = new HoldReleaseMeter();
    m2.press(0);
    m2.release(CHARGE_MS * 3);
    expect(m2.powerValue()).toBeCloseTo(1);
  });

  it('early/late taps produce signed contactError in [-1, 1]', () => {
    const early = new HoldReleaseMeter();
    early.press(0);
    early.release(CHARGE_MS);
    early.tap(CHARGE_MS + 90); // value 0.2 < 0.5 → negative
    expect(early.result().contactError).toBeLessThan(0);
    expect(early.result().contactError).toBeGreaterThanOrEqual(-1);

    const late = new HoldReleaseMeter();
    late.press(0);
    late.release(CHARGE_MS);
    late.tap(CHARGE_MS + 360); // value 0.8 > 0.5 → positive
    expect(late.result().contactError).toBeGreaterThan(0);
    expect(late.result().contactError).toBeLessThanOrEqual(1);
  });

  it('value() exposes the active bar for the HUD', () => {
    const m = new HoldReleaseMeter();
    m.press(0);
    expect(m.value(CHARGE_MS / 2)).toBeCloseTo(0.5); // charging: power fill
    m.release(CHARGE_MS);
    expect(m.value(CHARGE_MS + 225)).toBeCloseTo(0.5); // contact: sweep position
  });

  it('reset returns to idle', () => {
    const m = new HoldReleaseMeter();
    m.press(0);
    m.reset();
    expect(m.phase).toBe('idle');
    expect(m.stage()).toBe('ready');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/holdRelease.test.ts` → Expected: FAIL — cannot resolve `./holdRelease`.

- [ ] **Step 3: Implement `src/input/holdRelease.ts`**

```ts
// src/input/holdRelease.ts
import { meterValue } from './threeClick';

export const CHARGE_MS = 1200;
export const CONTACT_PERIOD_MS = 900;

export type HoldReleasePhase = 'idle' | 'charging' | 'contact' | 'done';
/** Shared prompt stage across swing schemes (HUD renders text per scheme). */
export type SwingStage = 'ready' | 'charging' | 'contact' | 'swinging';

/**
 * Hold & Release swing: press → power fills over CHARGE_MS (capped at 1);
 * release → locks power, contact bar sweeps (triangle wave); tap → contactError
 * is the signed offset from the bar center, in [-1, 1].
 */
export class HoldReleaseMeter {
  phase: HoldReleasePhase = 'idle';
  private pressMs = 0;
  private releaseMs = 0;
  private power = 0;
  private contactError = 0;

  press(nowMs: number): void {
    if (this.phase !== 'idle') return;
    this.phase = 'charging';
    this.pressMs = nowMs;
  }

  release(nowMs: number): void {
    if (this.phase !== 'charging') return;
    this.power = Math.min(1, (nowMs - this.pressMs) / CHARGE_MS);
    this.releaseMs = nowMs;
    this.phase = 'contact';
  }

  tap(nowMs: number): void {
    if (this.phase !== 'contact') return;
    const v = meterValue(nowMs - this.releaseMs, CONTACT_PERIOD_MS);
    this.contactError = Math.max(-1, Math.min(1, (v - 0.5) * 2));
    this.phase = 'done';
  }

  /** Active bar value for the HUD: power fill while charging, sweep while contact. */
  value(nowMs: number): number {
    if (this.phase === 'charging') return Math.min(1, (nowMs - this.pressMs) / CHARGE_MS);
    if (this.phase === 'contact') return meterValue(nowMs - this.releaseMs, CONTACT_PERIOD_MS);
    return 0;
  }

  powerValue(): number {
    return this.power;
  }

  stage(): SwingStage {
    if (this.phase === 'charging') return 'charging';
    if (this.phase === 'contact') return 'contact';
    if (this.phase === 'done') return 'swinging';
    return 'ready';
  }

  result(): { power: number; contactError: number } {
    return { power: this.power, contactError: this.contactError };
  }

  reset(): void {
    this.phase = 'idle';
  }
}
```

- [ ] **Step 4: Add `stage()` to `ThreeClickMeter` (`src/input/threeClick.ts`)**

```ts
import type { SwingStage } from './holdRelease';
```

```ts
  stage(): SwingStage {
    if (this.phase === 'power') return 'charging';
    if (this.phase === 'accuracy') return 'contact';
    if (this.phase === 'done') return 'swinging';
    return 'ready';
  }
```

(Type-only import — no runtime cycle: `holdRelease.ts` imports `meterValue` as a value, `threeClick.ts` imports only the type back.)

- [ ] **Step 5: Run the suite**

Run: `npx vitest run src/input` → Expected: 9 passed (4 threeClick + 5 holdRelease). Full `npx vitest run`, lint, typecheck clean.

- [ ] **Step 6: Commit**

```powershell
git add src/input
git commit -m "feat: hold-and-release swing meter with shared stages"
```

---

### Task 9: Save profile

**Files:**
- Create: `src/save/profile.ts`
- Test: `src/save/profile.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/save/profile.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, loadProfile, saveProfile, type Profile } from './profile';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  };
}

describe('profile', () => {
  it('missing profile → defaults (v0 → v1 migration)', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE);
  });
  it('corrupt JSON → defaults, no throw', () => {
    expect(loadProfile(fakeStorage({ 'golf-profile': '{not json' }))).toEqual(DEFAULT_PROFILE);
  });
  it('wrong version → defaults', () => {
    expect(loadProfile(fakeStorage({ 'golf-profile': '{"version":99}' }))).toEqual(DEFAULT_PROFILE);
  });
  it('round-trips', () => {
    const s = fakeStorage();
    const p: Profile = { version: 1, settings: { inputScheme: 'threeClick' } };
    saveProfile(s, p);
    expect(loadProfile(s)).toEqual(p);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/save/profile.test.ts` → Expected: FAIL — cannot resolve `./profile`.

- [ ] **Step 3: Implement `src/save/profile.ts`**

```ts
// src/save/profile.ts
export type InputScheme = 'holdRelease' | 'threeClick';

export interface Profile {
  version: 1;
  settings: { inputScheme: InputScheme };
}

export const DEFAULT_PROFILE: Profile = {
  version: 1,
  settings: { inputScheme: 'holdRelease' },
};

const KEY = 'golf-profile';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadProfile(storage: StorageLike): Profile {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      (parsed as Profile).version === 1 &&
      ((parsed as Profile).settings?.inputScheme === 'holdRelease' ||
        (parsed as Profile).settings?.inputScheme === 'threeClick')
    ) {
      return parsed as Profile;
    }
    return structuredClone(DEFAULT_PROFILE);
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(storage: StorageLike, profile: Profile): void {
  storage.setItem(KEY, JSON.stringify(profile));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/save/profile.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/save
git commit -m "feat: versioned save profile"
```

### Task 10: Camera rig

**Files:**
- Create: `src/render/cameraRig.ts`
- Test: `src/render/cameraRig.test.ts`

Camera modes: `aiming` (behind ball, as today), `putting` (lower, closer), `flight` (chase along velocity). "Settle" is not a mode — the damped follower easing toward the aiming goal IS the settle transition, for free.

- [ ] **Step 1: Write the failing tests**

```ts
// src/render/cameraRig.test.ts
import { describe, expect, it } from 'vitest';
import { CameraFollower, cameraGoal } from './cameraRig';

const ball = { x: 0, y: 0, z: -50 };

describe('cameraGoal', () => {
  it('aiming sits behind the ball against aimDir, above it', () => {
    const g = cameraGoal('aiming', ball, 0, null);
    expect(g.pos.z).toBeGreaterThan(ball.z); // behind = +z when aiming -z
    expect(g.pos.y).toBeGreaterThan(2);
    expect(g.look.z).toBeLessThan(ball.z); // looking down the line
  });
  it('putting is lower and closer than aiming', () => {
    const a = cameraGoal('aiming', ball, 0, null);
    const p = cameraGoal('putting', ball, 0, null);
    expect(p.pos.y).toBeLessThan(a.pos.y);
    expect(Math.abs(p.pos.z - ball.z)).toBeLessThan(Math.abs(a.pos.z - ball.z));
  });
  it('flight chases behind the velocity direction', () => {
    const g = cameraGoal('flight', ball, 0, { x: 0, y: 5, z: -30 });
    expect(g.pos.z).toBeGreaterThan(ball.z);
    expect(g.look.z).toBeLessThan(ball.z);
  });
  it('flight with near-zero velocity falls back to aimDir framing', () => {
    const g = cameraGoal('flight', ball, 0, { x: 0, y: 0, z: -0.001 });
    expect(Number.isFinite(g.pos.x)).toBe(true);
    expect(g.pos.z).toBeGreaterThan(ball.z);
  });
});

describe('CameraFollower', () => {
  it('converges to the goal without overshooting', () => {
    const f = new CameraFollower({ x: 0, y: 3, z: 8 }, { x: 0, y: 0, z: -20 });
    const goal = cameraGoal('aiming', { x: 0, y: 0, z: -100 }, 0, null);
    let prevDist = Infinity;
    for (let i = 0; i < 300; i++) {
      f.update(1 / 60, goal);
      const d = Math.hypot(f.pos.x - goal.pos.x, f.pos.y - goal.pos.y, f.pos.z - goal.pos.z);
      expect(d).toBeLessThanOrEqual(prevDist + 1e-9);
      prevDist = d;
    }
    expect(prevDist).toBeLessThan(0.05);
  });
  it('snap jumps instantly', () => {
    const f = new CameraFollower({ x: 0, y: 3, z: 8 }, { x: 0, y: 0, z: -20 });
    const goal = cameraGoal('aiming', ball, 0, null);
    f.snap(goal);
    expect(f.pos).toEqual(goal.pos);
    expect(f.look).toEqual(goal.look);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/cameraRig.test.ts` → Expected: FAIL — cannot resolve `./cameraRig`.

- [ ] **Step 3: Implement `src/render/cameraRig.ts`**

```ts
// src/render/cameraRig.ts — pure math, no Three.js imports (unit-testable)
import type { Vec3 } from '../sim/types';

export type CameraMode = 'aiming' | 'putting' | 'flight';

export interface CameraGoal {
  pos: Vec3;
  look: Vec3;
}

export function cameraGoal(mode: CameraMode, ball: Vec3, aimDir: number, velocity: Vec3 | null): CameraGoal {
  if (mode === 'flight' && velocity) {
    const h = Math.hypot(velocity.x, velocity.z);
    if (h > 0.5) {
      const dx = velocity.x / h, dz = velocity.z / h;
      return {
        pos: { x: ball.x - dx * 10, y: ball.y + 4, z: ball.z - dz * 10 },
        look: { x: ball.x + dx * 5, y: ball.y, z: ball.z + dz * 5 },
      };
    }
  }
  const dx = Math.sin(aimDir), dz = -Math.cos(aimDir);
  const back = mode === 'putting' ? 4 : 8;
  const up = mode === 'putting' ? 1.2 : 3;
  const ahead = mode === 'putting' ? 10 : 20;
  return {
    pos: { x: ball.x - dx * back, y: ball.y + up, z: ball.z - dz * back },
    look: { x: ball.x + dx * ahead, y: ball.y, z: ball.z + dz * ahead },
  };
}

const RATE = 4; // higher = snappier

export class CameraFollower {
  constructor(public pos: Vec3, public look: Vec3) {}

  update(dt: number, goal: CameraGoal): void {
    const f = 1 - Math.exp(-RATE * dt);
    for (const k of ['x', 'y', 'z'] as const) {
      this.pos[k] += (goal.pos[k] - this.pos[k]) * f;
      this.look[k] += (goal.look[k] - this.look[k]) * f;
    }
  }

  snap(goal: CameraGoal): void {
    this.pos = { ...goal.pos };
    this.look = { ...goal.look };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/cameraRig.test.ts` → Expected: 6 passed.

- [ ] **Step 5: Commit**

```powershell
git add src/render/cameraRig.ts src/render/cameraRig.test.ts
git commit -m "feat: camera rig with damped follow"
```

---

### Task 11: Terrain mesh, toon look, scene rewrite

**Files:**
- Create: `src/render/terrain.ts`
- Modify: `src/render/scene.ts`

No unit tests (render layer — Playwright visual snapshots gate it). Typecheck/lint/build + manual dev-server check verify this task.

- [ ] **Step 1: Implement `src/render/terrain.ts`**

```ts
// src/render/terrain.ts
import * as THREE from 'three';
import { SURFACE, type HoleFile, type Surface } from '../course/format';

export const SURFACE_COLORS: Record<Surface, number> = {
  [SURFACE.fairway]: 0x7ec850,
  [SURFACE.rough]: 0x4f7a33,
  [SURFACE.green]: 0x9fdc6a,
  [SURFACE.sand]: 0xe8d28a,
};

/** 3-step gradient map for MeshToonMaterial banding. */
export function makeGradientMap(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([90, 180, 255, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Non-indexed, vertex-colored, flat-shaded low-poly terrain from the heightfield. */
export function buildTerrainMesh(hole: HoleFile, gradientMap: THREE.Texture): THREE.Mesh {
  const { width, depth, cellSize } = hole.grid;
  const row = width + 1;
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new THREE.Color();

  const vx = (ix: number) => (ix - width / 2) * cellSize;
  const vz = (iz: number) => -iz * cellSize;
  const vy = (ix: number, iz: number) => hole.heights[iz * row + ix]!;

  for (let iz = 0; iz < depth; iz++) {
    for (let ix = 0; ix < width; ix++) {
      c.setHex(SURFACE_COLORS[hole.surfaces[iz * width + ix]!]);
      const quad = [
        [vx(ix), vy(ix, iz), vz(iz)],
        [vx(ix), vy(ix, iz + 1), vz(iz + 1)],
        [vx(ix + 1), vy(ix + 1, iz), vz(iz)],
        [vx(ix + 1), vy(ix + 1, iz), vz(iz)],
        [vx(ix), vy(ix, iz + 1), vz(iz + 1)],
        [vx(ix + 1), vy(ix + 1, iz + 1), vz(iz + 1)],
      ];
      for (const [x, y, z] of quad) {
        positions.push(x!, y!, z!);
        colors.push(c.r, c.g, c.b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  return new THREE.Mesh(geo, mat);
}

/** Inverted-hull outline shell for a mesh (classic cartoon outline). */
export function outlineShell(source: THREE.Mesh, scale = 1.06): THREE.Mesh {
  const shell = new THREE.Mesh(
    source.geometry,
    new THREE.MeshBasicMaterial({ color: 0x263238, side: THREE.BackSide }),
  );
  shell.scale.setScalar(scale);
  return shell;
}
```

(Non-indexed triangles + `computeVertexNormals` on non-indexed geometry give per-face normals — the faceted low-poly look without `flatShading` flags.)

- [ ] **Step 2: Rewrite `src/render/scene.ts`**

Full replacement — signature changes from `(canvas, holePos)` to `(canvas, hole: HoleFile)`:

```ts
// src/render/scene.ts
import * as THREE from 'three';
import { heightAt, type HoleFile } from '../course/format';
import type { Vec3 } from '../sim/types';
import { buildTerrainMesh, makeGradientMap, outlineShell } from './terrain';
import { BallTrail } from './trail';
import { CameraFollower, cameraGoal, type CameraMode } from './cameraRig';

export interface GameScene {
  render(): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  /** snap camera straight to the current mode's goal (boot / instant mode) */
  frameBall(): void;
  /** damped camera follow toward the mode's goal — call every frame */
  updateCamera(dt: number, mode: CameraMode, velocity: Vec3 | null): void;
  trailPush(p: Vec3): void;
  trailClear(): void;
  markLanding(p: Vec3): void;
  resize(): void;
}

function makeSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6fc3f0');
  grad.addColorStop(0.7, '#cdeefb');
  grad.addColorStop(1, '#ffe9c2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);
  return new THREE.CanvasTexture(canvas);
}

export function createScene(canvas: HTMLCanvasElement, hole: HoleFile): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xcdeefb, 220, 650);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.5);
  sun.position.set(80, 100, 60);
  scene.add(sun);

  const gradientMap = makeGradientMap();
  scene.add(buildTerrainMesh(hole, gradientMap));

  const pinY = heightAt(hole, hole.pin.x, hole.pin.z);

  const cup = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222 }),
  );
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(hole.pin.x, pinY + 0.02, hole.pin.z);
  scene.add(cup);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
    new THREE.MeshToonMaterial({ color: 0xeceff1, gradientMap }),
  );
  pole.position.set(hole.pin.x, pinY + 1.1, hole.pin.z);
  const poleOutline = outlineShell(pole, 1.4);
  poleOutline.position.copy(pole.position);
  scene.add(pole, poleOutline);

  const flag = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.7, 4),
    new THREE.MeshToonMaterial({ color: 0xff5252, gradientMap }),
  );
  flag.rotation.z = -Math.PI / 2;
  flag.position.set(hole.pin.x + 0.4, pinY + 1.9, hole.pin.z);
  scene.add(flag);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap }),
  );
  scene.add(ball);
  const ballOutline = outlineShell(ball, 1.15);
  scene.add(ballOutline);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Terrain-following dotted aim line (slope-aware on greens by construction)
  const AIM_POINTS = 24;
  const aimGeo = new THREE.BufferGeometry();
  const aimLine = new THREE.Line(
    aimGeo,
    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.6, gapSize: 0.4 }),
  );
  scene.add(aimLine);

  const trail = new BallTrail(scene);
  const follower = new CameraFollower({ x: 0, y: 3, z: 8 }, { x: 0, y: 0, z: -20 });

  let aimYaw = 0;
  let ballPos: Vec3 = { ...hole.tee };

  function rebuildAimLine(): void {
    const pts: THREE.Vector3[] = [];
    const reach = 12;
    for (let i = 0; i <= AIM_POINTS; i++) {
      const d = (i / AIM_POINTS) * reach;
      const x = ballPos.x + Math.sin(aimYaw) * d;
      const z = ballPos.z - Math.cos(aimYaw) * d;
      pts.push(new THREE.Vector3(x, heightAt(hole, x, z) + 0.08, z));
    }
    aimGeo.setFromPoints(pts);
    aimLine.computeLineDistances();
  }

  const api: GameScene = {
    render: () => renderer.render(scene, camera),
    setBallPosition: (p) => {
      ballPos = { ...p };
      const groundY = heightAt(hole, p.x, p.z);
      const y = Math.max(p.y, groundY) + 0.12;
      ball.position.set(p.x, y, p.z);
      ballOutline.position.copy(ball.position);
      blob.position.set(p.x, groundY + 0.03, p.z);
      rebuildAimLine();
    },
    setAimDir: (yaw) => {
      aimYaw = yaw;
      rebuildAimLine();
    },
    frameBall: () => follower.snap(cameraGoal('aiming', ball.position, aimYaw, null)),
    updateCamera: (dt, mode, velocity) => {
      follower.update(dt, cameraGoal(mode, ball.position, aimYaw, velocity));
      camera.position.set(follower.pos.x, follower.pos.y, follower.pos.z);
      camera.lookAt(follower.look.x, follower.look.y, follower.look.z);
    },
    trailPush: (p) => trail.push(p),
    trailClear: () => trail.clear(),
    markLanding: (p) => trail.markLanding(p, heightAt(hole, p.x, p.z)),
    resize: () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
  };

  api.resize();
  api.setBallPosition(ballPos);
  return api;
}
```

This file references `BallTrail` from Task 12 — **implement Tasks 11 and 12 in the same working session if needed**, or stub commit order: Task 12's `trail.ts` is standalone, so if you prefer strict ordering, implement `trail.ts` FIRST within this task's session, but keep the commits separate as written.

- [ ] **Step 3: Verify**

`npm run typecheck` will fail until `trail.ts` exists (Task 12) and `main.ts` is updated (Task 15) — `createScene`'s signature changed. To keep this task self-contained and green: apply the **minimal `main.ts` compile fix** now — change the createScene call to pass a hole file:

```ts
import { flatHoleFile } from './course/fixtures';
// ...
const hole = flatHoleFile();
const scene = createScene(canvas, hole);
```

and replace removed members (`main.ts` calls only `setBallPosition`/`setAimDir`/`frameBall`/`resize`/`render`, all of which still exist — only the constructor call changes). Full main rewiring lands in Task 15.

Run after Task 12 lands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` → all clean/green.

- [ ] **Step 4: Commit** (after Task 12 makes the tree green — see note above)

```powershell
git add src/render/terrain.ts src/render/scene.ts src/main.ts
git commit -m "feat: heightfield terrain mesh and toon look"
```

---

### Task 12: Ball trail and landing marker

**Files:**
- Create: `src/render/trail.ts`

- [ ] **Step 1: Implement `src/render/trail.ts`**

```ts
// src/render/trail.ts
import * as THREE from 'three';
import type { Vec3 } from '../sim/types';

const MAX_POINTS = 90;

export class BallTrail {
  private points: THREE.Vector3[] = [];
  private line: THREE.Line;
  private marker: THREE.Mesh;
  private markerAge = Infinity;

  constructor(scene: THREE.Scene) {
    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
    );
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    scene.add(this.line, this.marker);
  }

  push(p: Vec3): void {
    this.points.push(new THREE.Vector3(p.x, p.y + 0.12, p.z));
    if (this.points.length > MAX_POINTS) this.points.shift();
    this.line.geometry.setFromPoints(this.points);
  }

  markLanding(p: Vec3, groundY: number): void {
    this.marker.position.set(p.x, groundY + 0.05, p.z);
    this.markerAge = 0;
  }

  /** fade the landing pulse; call once per frame */
  update(dt: number): void {
    this.markerAge += dt;
    const mat = this.marker.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.8 - this.markerAge * 0.8);
    const s = 1 + this.markerAge * 1.5;
    this.marker.scale.set(s, s, 1);
  }

  clear(): void {
    this.points = [];
    this.line.geometry.setFromPoints([]);
  }
}
```

Add `trail.update(dt)` to the scene's `updateCamera` body (it runs every frame there — one line: `trail.update(dt);`).

- [ ] **Step 2: Verify the tree is green** (this closes Task 11's pending verification)

Run: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` → all pass. Then `npm run dev` and confirm in a browser: toon-shaded flat course renders, sky gradient, ball with outline, dotted aim line following ground.

- [ ] **Step 3: Commit**

```powershell
git add src/render/trail.ts src/render/scene.ts
git commit -m "feat: ball trail and landing marker"
```

---

### Task 13: Arcade HUD v1, prompts, settings panel

**Files:**
- Create: `src/ui/prompts.ts`, `src/ui/settings.ts`
- Modify: `src/ui/hud.ts` (full rewrite)
- Test: `src/ui/prompts.test.ts`

- [ ] **Step 1: Write the failing prompt test**

```ts
// src/ui/prompts.test.ts
import { describe, expect, it } from 'vitest';
import { PROMPTS } from './prompts';

describe('PROMPTS', () => {
  it('covers every scheme × stage with non-empty text (except swinging)', () => {
    for (const scheme of ['holdRelease', 'threeClick'] as const) {
      for (const stage of ['ready', 'charging', 'contact'] as const) {
        expect(PROMPTS[scheme][stage].length).toBeGreaterThan(0);
      }
      expect(PROMPTS[scheme].swinging).toBe('');
    }
  });
});
```

Run: `npx vitest run src/ui` → Expected: FAIL — cannot resolve `./prompts`.

- [ ] **Step 2: Implement `src/ui/prompts.ts`**

```ts
// src/ui/prompts.ts
import type { SwingStage } from '../input/holdRelease';
import type { InputScheme } from '../save/profile';

export const PROMPTS: Record<InputScheme, Record<SwingStage, string>> = {
  holdRelease: {
    ready: 'HOLD TO CHARGE',
    charging: 'RELEASE TO SET POWER',
    contact: 'TAP THE GREEN BAND',
    swinging: '',
  },
  threeClick: {
    ready: 'CLICK TO START YOUR SWING',
    charging: 'CLICK AT MAX POWER',
    contact: 'CLICK ON THE MARKER',
    swinging: '',
  },
};
```

Run: `npx vitest run src/ui` → 1 passed.

- [ ] **Step 3: Rewrite `src/ui/hud.ts`**

```ts
// src/ui/hud.ts
import type { GamePhase } from '../app/game';
import type { ClubId, HoleState } from '../sim/types';
import type { SwingStage } from '../input/holdRelease';
import type { InputScheme } from '../save/profile';
import { CLUBS } from '../sim/clubs';
import { SURFACE } from '../course/format';
import { PROMPTS } from './prompts';
import { scoreName } from '../sim/scoring';

const LIE_NAMES = ['Fairway', 'Rough', 'Green', 'Sand'] as const;
const CLUB_IDS: ClubId[] = ['driver', 'iron7', 'wedge', 'putter'];

export interface Hud {
  update(phase: GamePhase, hole: HoleState, club: ClubId): void;
  setMeter(value: number, stage: SwingStage, scheme: InputScheme): void;
  onClubSelect(cb: (club: ClubId) => void): void;
  onGear(cb: () => void): void;
}

const chip = 'background:rgba(38,50,56,.88);color:#fff;padding:7px 14px;border-radius:16px;font-size:14px;font-weight:600;';

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = `
    <div id="hud-top" style="position:absolute;top:12px;left:12px;${chip}"></div>
    <div id="hud-lie" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);${chip}color:#ffca28;"></div>
    <button id="hud-gear" style="position:absolute;top:12px;right:12px;${chip}border:none;pointer-events:auto;cursor:pointer;">⚙</button>
    <div id="hud-msg" style="position:absolute;top:38%;width:100%;text-align:center;color:#fff;font-size:46px;font-weight:800;text-shadow:0 3px 10px rgba(0,0,0,.45);display:none;"></div>
    <div id="hud-clubs" style="position:absolute;bottom:84px;left:12px;display:flex;gap:6px;pointer-events:auto;"></div>
    <div id="hud-prompt" style="position:absolute;bottom:52px;left:12px;width:260px;text-align:center;color:#ffca28;font-size:13px;font-weight:800;letter-spacing:.05em;text-shadow:0 1px 4px rgba(0,0,0,.5);animation:hudpulse 1.2s ease-in-out infinite;"></div>
    <div id="hud-meter" style="position:absolute;bottom:18px;left:12px;width:260px;height:22px;background:#263238;border-radius:11px;border:2px solid rgba(255,255,255,.25);">
      <div id="hud-meter-band" style="position:absolute;left:44%;width:12%;top:0;height:100%;background:rgba(102,187,106,.55);border-radius:4px;display:none;"></div>
      <div id="hud-meter-target" style="position:absolute;left:10%;top:-4px;width:3px;height:28px;background:#ffca28;"></div>
      <div id="hud-meter-fill" style="position:absolute;left:0;top:0;height:100%;width:0%;background:linear-gradient(90deg,#66bb6a,#ffca28,#ef5350);border-radius:9px;"></div>
    </div>
    <div id="hud-help" style="position:absolute;bottom:18px;right:12px;color:rgba(255,255,255,.9);font-size:12px;text-align:right;">←/→ aim · 1-4 club</div>
    <style>@keyframes hudpulse{0%,100%{opacity:1}50%{opacity:.55}}</style>
  `;
  const get = (id: string) => root.querySelector(id) as HTMLElement;
  const top = get('#hud-top'), lieEl = get('#hud-lie'), msg = get('#hud-msg');
  const prompt = get('#hud-prompt'), fill = get('#hud-meter-fill');
  const band = get('#hud-meter-band'), target = get('#hud-meter-target');
  const clubsEl = get('#hud-clubs'), gear = get('#hud-gear');

  let clubCb: (club: ClubId) => void = () => {};
  let gearCb: () => void = () => {};
  for (const id of CLUB_IDS) {
    const b = document.createElement('button');
    b.id = `club-${id}`;
    b.textContent = CLUBS[id].name;
    b.style.cssText = `${chip}border:none;cursor:pointer;font-size:12px;`;
    b.addEventListener('click', () => clubCb(id));
    clubsEl.appendChild(b);
  }
  gear.addEventListener('click', () => gearCb());

  return {
    update(phase, hole, club) {
      const dist = Math.hypot(hole.holePos.x - hole.ballPos.x, hole.holePos.z - hole.ballPos.z);
      top.textContent = `Par ${hole.hole.par} · Strokes: ${hole.strokes} · ⛳ ${dist.toFixed(0)} m`;
      top.dataset.strokes = String(hole.strokes);
      top.dataset.phase = phase;
      lieEl.textContent = LIE_NAMES[hole.lie] ?? '';
      lieEl.style.display = hole.lie === SURFACE.fairway || phase === 'holed' ? 'none' : 'block';
      msg.style.display = phase === 'holed' ? 'block' : 'none';
      msg.textContent = phase === 'holed' ? scoreName(hole.strokes, hole.hole.par) : '';
      for (const id of CLUB_IDS) {
        const b = root.querySelector(`#club-${id}`) as HTMLElement;
        b.style.background = id === club ? '#ffca28' : 'rgba(38,50,56,.88)';
        b.style.color = id === club ? '#263238' : '#fff';
      }
    },
    setMeter(value, stage, scheme) {
      fill.style.width = `${(value * 100).toFixed(1)}%`;
      fill.style.opacity = stage === 'ready' ? '0.35' : '1';
      prompt.textContent = PROMPTS[scheme][stage];
      band.style.display = stage === 'contact' && scheme === 'holdRelease' ? 'block' : 'none';
      target.style.display = scheme === 'threeClick' ? 'block' : 'none';
    },
    onClubSelect(cb) {
      clubCb = cb;
    },
    onGear(cb) {
      gearCb = cb;
    },
  };
}
```

- [ ] **Step 4: Implement `src/ui/settings.ts`**

```ts
// src/ui/settings.ts
import type { InputScheme } from '../save/profile';

export interface SettingsPanel {
  toggle(): void;
  setScheme(scheme: InputScheme): void;
}

export function createSettingsPanel(
  root: HTMLElement,
  initial: InputScheme,
  onChange: (scheme: InputScheme) => void,
): SettingsPanel {
  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.style.cssText =
    'position:absolute;top:52px;right:12px;background:rgba(38,50,56,.96);color:#fff;padding:16px;border-radius:12px;display:none;pointer-events:auto;font-size:14px;min-width:220px;';
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:10px;">Settings</div>
    <div style="margin-bottom:6px;color:#90a4ae;font-size:12px;">SWING INPUT</div>
    <label style="display:block;margin-bottom:6px;cursor:pointer;">
      <input type="radio" name="scheme" id="scheme-holdRelease" value="holdRelease"> Hold &amp; Release
    </label>
    <label style="display:block;cursor:pointer;">
      <input type="radio" name="scheme" id="scheme-threeClick" value="threeClick"> 3-Click Meter
    </label>
  `;
  root.appendChild(panel);

  const radios = panel.querySelectorAll<HTMLInputElement>('input[name="scheme"]');
  for (const r of radios) {
    r.checked = r.value === initial;
    r.addEventListener('change', () => {
      if (r.checked) onChange(r.value as InputScheme);
    });
  }

  return {
    toggle: () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    setScheme: (scheme) => {
      for (const r of radios) r.checked = r.value === scheme;
    },
  };
}
```

- [ ] **Step 5: Verify and commit**

`npm run typecheck` will flag `main.ts`'s old `hud.setMeter(visible, value)` calls — apply the minimal compile fix in main (`hud.setMeter(0, 'ready', 'holdRelease')` style); full rewiring is Task 15. Then: `npx vitest run`, lint, build all green.

```powershell
git add src/ui src/main.ts
git commit -m "feat: arcade hud, swing prompts, settings panel"
```

### Task 14: Game state machine upgrade

**Files:**
- Modify: `src/app/game.ts`, `src/app/game.test.ts`

- [ ] **Step 1: Write the failing tests** (full rewrite of `src/app/game.test.ts`)

```ts
// src/app/game.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { autoClub, Game, makeHoleState } from './game';
import { initPhysics } from '../sim/shot';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';

beforeAll(async () => {
  await initPhysics();
});

function makeGame(hole = flatHoleFile()) {
  return new Game(42, hole, {
    onStateChange: () => {},
    setBallPosition: () => {},
    setAimDir: () => {},
    frameBall: () => {},
    onLanding: () => {},
  });
}

describe('autoClub', () => {
  it('switches to putter on the green and off putter when leaving it', () => {
    expect(autoClub(SURFACE.green, 'iron7')).toBe('putter');
    expect(autoClub(SURFACE.fairway, 'putter')).toBe('iron7');
    expect(autoClub(SURFACE.rough, 'driver')).toBe('driver');
  });
});

describe('Game', () => {
  it('starts aiming from the tee with the driver', () => {
    const g = makeGame();
    expect(g.phase).toBe('aiming');
    expect(g.club).toBe('driver');
    expect(g.hole.strokes).toBe(0);
    expect(g.hole.ballPos).toEqual({ ...flatHoleFile().tee });
  });

  it('full drive flies, settles back to aiming, +1 stroke', () => {
    const g = makeGame();
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    expect(g.phase).toBe('flying');
    g.update(60);
    expect(g.phase).toBe('aiming');
    expect(g.hole.strokes).toBe(1);
    expect(g.hole.ballPos.z).toBeLessThan(-100);
  });

  it('re-entrant swing during flight is ignored', () => {
    const g = makeGame();
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    g.update(60);
    expect(g.hole.strokes).toBe(1);
  });

  it('putter power is rescaled: a full-bar 3 m putt stays near the hole', () => {
    const g = makeGame();
    g.hole.ballPos = { x: 0, y: 0, z: -147 };
    g.hole.lie = SURFACE.green;
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 1, contactError: 0 });
    g.update(60);
    const d = Math.hypot(g.hole.ballPos.x, g.hole.ballPos.z + 150);
    expect(g.hole.holedOut || d < 8).toBe(true); // without rescale, 12 m/s rolls ~40 m past
  });

  it('holing out reaches holed; club auto-switches to putter on the green', () => {
    const g = makeGame();
    g.hole.ballPos = { x: 0, y: 0, z: -148.5 };
    g.hole.lie = SURFACE.green;
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 0.6, contactError: 0 });
    g.update(60);
    expect(g.hole.holedOut).toBe(true);
    expect(g.phase).toBe('holed');
  });

  it('makeHoleState seeds state from a HoleFile', () => {
    const hole = flatHoleFile();
    const s = makeHoleState(hole, 7);
    expect(s.ballPos).toEqual({ ...hole.tee });
    expect(s.holePos).toEqual({ ...hole.pin });
    expect(s.hole).toBe(hole);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app` → Expected: FAIL (constructor signature, `autoClub`, `makeHoleState` missing).

- [ ] **Step 3: Rewrite `src/app/game.ts`**

```ts
// src/app/game.ts
import { resolveShot } from '../sim/shot';
import { CLUBS } from '../sim/clubs';
import { meterMaxSpeed } from '../sim/powerScale';
import { SURFACE, surfaceAt, type HoleFile, type Surface } from '../course/format';
import type { ClubId, HoleState, ShotIntent, Vec3 } from '../sim/types';
import { TrajectoryPlayback } from '../render/playback';

export type GamePhase = 'aiming' | 'metering' | 'flying' | 'holed';

/** Render-side callbacks; the Game never touches Three.js or the DOM. */
export interface GameView {
  onStateChange(phase: GamePhase, hole: HoleState, club: ClubId): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  frameBall(): void;
  onLanding(p: Vec3): void;
}

export function makeHoleState(hole: HoleFile, seed: number): HoleState {
  return {
    seed,
    ballPos: { ...hole.tee },
    holePos: { ...hole.pin },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
    hole,
    lie: surfaceAt(hole, hole.tee.x, hole.tee.z),
  };
}

/** Putter on the green; sensible swap when stepping off it; otherwise keep choice. */
export function autoClub(lie: Surface, current: ClubId): ClubId {
  if (lie === SURFACE.green) return 'putter';
  if (current === 'putter') return 'iron7';
  return current;
}

export class Game {
  phase: GamePhase = 'aiming';
  hole: HoleState;
  aimDir: number;
  club: ClubId = 'driver';
  /** approximate ball velocity during flight (for the chase camera) */
  flightVelocity: Vec3 | null = null;
  private playback: TrajectoryPlayback | null = null;
  private pendingState: HoleState | null = null;
  private prevPos: Vec3 | null = null;
  private landed = false;

  constructor(seed: number, holeFile: HoleFile, private readonly view: GameView) {
    this.hole = makeHoleState(holeFile, seed);
    this.aimDir = this.aimToHole();
    this.syncView();
  }

  aimToHole(): number {
    const dx = this.hole.holePos.x - this.hole.ballPos.x;
    const dz = this.hole.holePos.z - this.hole.ballPos.z;
    return Math.atan2(dx, -dz);
  }

  distToPin(): number {
    return Math.hypot(this.hole.holePos.x - this.hole.ballPos.x, this.hole.holePos.z - this.hole.ballPos.z);
  }

  adjustAim(deltaYaw: number): void {
    if (this.phase !== 'aiming') return;
    this.aimDir += deltaYaw;
    this.view.setAimDir(this.aimDir);
  }

  setClub(club: ClubId): void {
    if (this.phase === 'flying' || this.phase === 'holed') return;
    this.club = club;
    this.view.onStateChange(this.phase, this.hole, this.club);
  }

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.view.onStateChange(phase, this.hole, this.club);
  }

  performSwing(intent: ShotIntent): void {
    if (this.phase === 'flying' || this.phase === 'holed') return;
    const scaled: ShotIntent = {
      ...intent,
      power: intent.power * (meterMaxSpeed(intent.club, this.hole.lie, this.distToPin()) / CLUBS[intent.club].maxSpeed),
    };
    const result = resolveShot(this.hole, scaled);
    this.pendingState = result.newState;
    this.playback = new TrajectoryPlayback(result.trajectory);
    this.prevPos = { ...this.hole.ballPos };
    this.landed = false;
    this.setPhase('flying');
  }

  /** Advance playback by dt seconds (call from rAF loop or tests). */
  update(dt: number): void {
    if (this.phase !== 'flying' || !this.playback || !this.pendingState) return;
    const pos = this.playback.advance(dt);
    this.view.setBallPosition(pos);
    if (this.prevPos && dt > 0) {
      this.flightVelocity = { x: (pos.x - this.prevPos.x) / dt, y: (pos.y - this.prevPos.y) / dt, z: (pos.z - this.prevPos.z) / dt };
      if (!this.landed && this.flightVelocity.y < 0 && pos.y - this.pendingState.ballPos.y < 0.4) {
        this.landed = true;
        this.view.onLanding(pos);
      }
    }
    this.prevPos = { ...pos };
    if (this.playback.done) {
      this.hole = this.pendingState;
      this.playback = null;
      this.pendingState = null;
      this.flightVelocity = null;
      this.club = autoClub(this.hole.lie, this.club);
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
    this.view.onStateChange(this.phase, this.hole, this.club);
  }
}
```

(`makeFlatHole` is gone — Task 3 added it as a compile bridge; this rewrite removes it. The landing check compares against the FINAL rest height (`pendingState.ballPos.y`) as a cheap "near ground" proxy on flat-ish terrain; good enough for a visual pulse.)

- [ ] **Step 4: Fix `src/main.ts` compile** (minimal: new constructor arg + view fields; full rewiring next task)

```ts
const game = new Game(seed, hole, {
  onStateChange: (phase, holeState, activeClub) => hud.update(phase, holeState, activeClub),
  setBallPosition: (p) => scene.setBallPosition(p),
  setAimDir: (yaw) => scene.setAimDir(yaw),
  frameBall: () => scene.frameBall(),
  onLanding: (p) => scene.markLanding(p),
});
```

Remove main's own `club` variable usages that no longer compile (`game.club` replaces them); keep the rest as-is until Task 15.

- [ ] **Step 5: Run everything**

`npx vitest run` → all pass (the suite count grows to ~60 by here). Lint, typecheck, build green.

- [ ] **Step 6: Commit**

```powershell
git add src/app src/main.ts
git commit -m "feat: game owns club, auto-putter, power rescale, landing event"
```

---

### Task 15: Main wiring, dev gallery, test hooks

**Files:**
- Create: `src/dev/courses.ts`
- Modify: `src/main.ts` (full rewrite)

- [ ] **Step 1: Implement `src/dev/courses.ts`** (2D canvas — deterministic pixels, no WebGL)

```ts
// src/dev/courses.ts
import { generateHole } from '../course/generate';
import type { Surface } from '../course/format';

const CSS_COLORS: Record<Surface, string> = {
  0: '#7ec850', 1: '#4f7a33', 2: '#9fdc6a', 3: '#e8d28a',
};

export function renderCourseGallery(root: HTMLElement, count = 12): void {
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;padding:16px;background:#263238;min-height:100vh;align-content:flex-start;';
  for (let seed = 1; seed <= count; seed++) {
    const hole = generateHole(seed);
    const { width, depth } = hole.grid;
    const px = 2;
    const wrap = document.createElement('div');
    const canvas = document.createElement('canvas');
    canvas.width = width * px;
    canvas.height = depth * px;
    const ctx = canvas.getContext('2d')!;
    for (let iz = 0; iz < depth; iz++) {
      for (let ix = 0; ix < width; ix++) {
        ctx.fillStyle = CSS_COLORS[hole.surfaces[iz * width + ix]!];
        ctx.fillRect(ix * px, iz * px, px, px);
      }
    }
    const dot = (x: number, z: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((x / hole.grid.cellSize + width / 2) * px, (-z / hole.grid.cellSize) * px, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(hole.tee.x, hole.tee.z, '#ffffff');
    dot(hole.pin.x, hole.pin.z, '#ef5350');
    const len = Math.hypot(hole.pin.x - hole.tee.x, hole.pin.z - hole.tee.z);
    const caption = document.createElement('div');
    caption.textContent = `seed ${seed} · ${len.toFixed(0)} m · diff ${hole.difficulty.toFixed(2)}`;
    caption.style.cssText = 'color:#eceff1;font:12px system-ui;margin-top:4px;text-align:center;';
    wrap.append(canvas, caption);
    root.appendChild(wrap);
  }
}
```

- [ ] **Step 2: Rewrite `src/main.ts`**

```ts
// src/main.ts
import './style.css';
import { createScene } from './render/scene';
import { createHud } from './ui/hud';
import { createSettingsPanel } from './ui/settings';
import { Game, type GamePhase } from './app/game';
import { initPhysics } from './sim/shot';
import { ThreeClickMeter } from './input/threeClick';
import { HoldReleaseMeter } from './input/holdRelease';
import { generateHole } from './course/generate';
import { SURFACE, surfaceAt } from './course/format';
import { loadProfile, saveProfile, type InputScheme } from './save/profile';
import { renderCourseGallery } from './dev/courses';
import type { ClubId, HoleState, ShotIntent, Vec3 } from './sim/types';
import type { CameraMode } from './render/cameraRig';

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('dev') === 'courses') {
    renderCourseGallery(document.body);
    return;
  }

  await initPhysics();
  const seed = Number(params.get('seed') ?? 42);
  const instant = params.has('instant');

  const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const hudRoot = document.querySelector('#hud') as HTMLElement;

  const profile = loadProfile(localStorage);
  let scheme: InputScheme = profile.settings.inputScheme;

  const hole = generateHole(seed);
  const scene = createScene(canvas, hole);
  const hud = createHud(hudRoot);

  const threeClick = new ThreeClickMeter();
  const holdRelease = new HoldReleaseMeter();
  const meter = () => (scheme === 'holdRelease' ? holdRelease : threeClick);

  // `let` + definite-assignment: the Game constructor invokes view callbacks
  // synchronously, before the assignment completes — `const game` would throw
  // a TDZ ReferenceError inside setBallPosition. With `let`, the early calls
  // see `undefined` and the optional chain no-ops safely.
  let game!: Game;
  game = new Game(seed, hole, {
    onStateChange: (phase: GamePhase, h: HoleState, club: ClubId) => hud.update(phase, h, club),
    setBallPosition: (p) => {
      scene.setBallPosition(p);
      if ((game as Game | undefined)?.phase === 'flying') scene.trailPush(p);
    },
    setAimDir: (yaw) => scene.setAimDir(yaw),
    frameBall: () => scene.frameBall(),
    onLanding: (p) => scene.markLanding(p),
  });

  const settings = createSettingsPanel(hudRoot, scheme, (next) => {
    scheme = next;
    threeClick.reset();
    holdRelease.reset();
    saveProfile(localStorage, { version: 1, settings: { inputScheme: next } });
    hud.setMeter(0, 'ready', scheme);
  });
  hud.onGear(() => settings.toggle());
  hud.onClubSelect((club) => game.setClub(club));

  function fireSwing(power: number, contactError: number): void {
    scene.trailClear();
    game.performSwing({ club: game.club, aimDir: game.aimDir, power, contactError });
    if (instant) game.update(60);
  }

  function pressDown(): void {
    if (game.phase === 'holed' || game.phase === 'flying') return;
    if (scheme === 'holdRelease') {
      const m = holdRelease;
      if (m.phase === 'idle' && game.phase === 'aiming') {
        m.press(performance.now());
        game.setPhase('metering');
      } else if (m.phase === 'contact') {
        m.tap(performance.now());
        const r = m.result();
        m.reset();
        fireSwing(r.power, r.contactError);
      }
    } else {
      const m = threeClick;
      if (m.phase === 'idle' && game.phase === 'aiming') {
        m.begin(performance.now());
        game.setPhase('metering');
      } else if (m.phase === 'power' || m.phase === 'accuracy') {
        m.click(performance.now());
        if ((m.phase as string) === 'done') {
          const r = m.result();
          m.reset();
          fireSwing(r.power, r.contactError);
        }
      }
    }
  }

  function pressUp(): void {
    if (scheme === 'holdRelease' && holdRelease.phase === 'charging') {
      holdRelease.release(performance.now());
    }
  }

  const clubKeys: Record<string, ClubId> = { '1': 'driver', '2': 'iron7', '3': 'wedge', '4': 'putter' };
  let spaceHeld = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') game.adjustAim(-0.03);
    if (e.key === 'ArrowRight') game.adjustAim(0.03);
    if (e.key === ' ' && !spaceHeld) {
      e.preventDefault();
      spaceHeld = true;
      pressDown();
    }
    const c = clubKeys[e.key];
    if (c) game.setClub(c);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
      spaceHeld = false;
      pressUp();
    }
  });
  canvas.addEventListener('pointerdown', pressDown);
  canvas.addEventListener('pointerup', pressUp);
  window.addEventListener('resize', () => scene.resize());

  let last = performance.now();
  function frame(now: number) {
    const dt = (now - last) / 1000;
    last = now;
    const m = meter();
    hud.setMeter(m.value(now), game.phase === 'flying' ? 'swinging' : m.stage(), scheme);
    game.update(dt);
    const mode: CameraMode =
      game.phase === 'flying'
        ? 'flight'
        : game.hole.lie === SURFACE.green && !game.hole.holedOut
          ? 'putting'
          : 'aiming';
    scene.updateCamera(dt, mode, game.flightVelocity);
    scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Deterministic hooks for Playwright — not a public API.
  (window as unknown as Record<string, unknown>).__golfTest = {
    getState: () => ({
      phase: game.phase,
      strokes: game.hole.strokes,
      ballPos: game.hole.ballPos,
      holedOut: game.hole.holedOut,
      lie: game.hole.lie,
      distToPin: game.distToPin(),
      club: game.club,
    }),
    swing: (intent: Partial<ShotIntent>) => {
      threeClick.reset();
      holdRelease.reset();
      hud.setMeter(0, 'ready', scheme);
      game.performSwing({
        club: intent.club ?? game.club,
        aimDir: intent.aimDir ?? game.aimDir,
        power: intent.power ?? 1,
        contactError: intent.contactError ?? 0,
      });
      if (instant) game.update(60);
    },
    placeBall: (x: number, z: number) => {
      game.hole.ballPos = { x, y: 0, z };
      game.hole.lie = surfaceAt(game.hole.hole, x, z);
      game.club = game.hole.lie === SURFACE.green ? 'putter' : game.club;
      game.aimDir = game.aimToHole();
      // sync view + snap camera
      game.setPhase(game.phase);
      // direct view sync:
      scene.setAimDir(game.aimDir);
      scene.setBallPosition(game.hole.ballPos);
      scene.frameBall();
    },
    ready: true,
  };
}

void boot();
```

- [ ] **Step 3: Verify in the browser**

`npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` all green. Then `npm run dev`: play a full generated hole with hold-and-release (hold/release/tap), check prompts change per stage, camera chases the ball, trail draws, gear panel toggles schemes, `?dev=courses` shows 12 distinct course thumbnails.

- [ ] **Step 4: Commit**

```powershell
git add src/main.ts src/dev
git commit -m "feat: wire generated course, dual meters, camera, dev gallery"
```

---

### Task 16: e2e rework

**Files:**
- Modify: `e2e/playthrough.spec.ts` (full rewrite)
- Create: `e2e/prompts.spec.ts`, `e2e/settings.spec.ts`

- [ ] **Step 1: Rewrite `e2e/playthrough.spec.ts`**

```ts
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
```

- [ ] **Step 2: Write `e2e/prompts.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('hold-and-release prompts walk the stages', async ({ page }) => {
  await page.goto('/?seed=42');
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await expect(page.locator('#hud-prompt')).toHaveText('HOLD TO CHARGE');
  await page.locator('#game-canvas').dispatchEvent('pointerdown', { pointerId: 1 });
  await expect(page.locator('#hud-prompt')).toHaveText('RELEASE TO SET POWER');
  await page.locator('#game-canvas').dispatchEvent('pointerup', { pointerId: 1 });
  await expect(page.locator('#hud-prompt')).toHaveText('TAP THE GREEN BAND');
});
```

- [ ] **Step 3: Write `e2e/settings.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('input scheme switches and persists across reload', async ({ page }) => {
  await page.goto('/?seed=42');
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
```

- [ ] **Step 4: Run e2e twice**

Run: `npm run test:e2e` → Expected: 8 passed + 2 skipped visual, ×2 runs identical. If the playthrough fails to hole in 20: log `d, club, power, lie` per iteration and tune ONLY the caddie formulas/thresholds (the `0.47` driver sin(2·14°) term, lie compensations) — never the assertions. Note settings.spec persists localStorage — Playwright gives each test a fresh context, so no cross-test pollution.

- [ ] **Step 5: Commit**

```powershell
git add e2e
git commit -m "test: e2e for generated course, prompts, settings"
```

---

### Task 17: Visual snapshots, README, milestone wrap

**Files:**
- Modify: `e2e/visual.spec.ts`, `src/main.ts` (one hook field), `README.md`
- Delete: `e2e/visual.spec.ts-snapshots/` (stale M1 baselines)

- [ ] **Step 1: Expose the pin on the test hook**

In `src/main.ts`, add one field to the `__golfTest` object (after `placeBall`):

```ts
    pin: { x: hole.pin.x, z: hole.pin.z },
```

- [ ] **Step 2: Rewrite `e2e/visual.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test.skip(!process.env.CI && !process.env.RUN_VISUAL, 'visual snapshots run in CI (or RUN_VISUAL=1)');

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __golfTest?: { ready: boolean } }).__golfTest?.ready === true,
  );
  await page.waitForTimeout(800); // camera follower settles
}

test('aiming view on generated seed 42', async ({ page }) => {
  await page.goto('/?seed=42');
  await ready(page);
  await expect(page).toHaveScreenshot('aiming-gen-seed42.png');
});

test('putting view on seed 42', async ({ page }) => {
  await page.goto('/?seed=42');
  await ready(page);
  await page.evaluate(() => {
    const t = (window as unknown as {
      __golfTest: { pin: { x: number; z: number }; placeBall(x: number, z: number): void };
    }).__golfTest;
    t.placeBall(t.pin.x, t.pin.z + 3);
  });
  await page.waitForTimeout(800); // camera eases into the putting pose
  await expect(page).toHaveScreenshot('putting-seed42.png');
});

test('course gallery', async ({ page }) => {
  await page.goto('/?dev=courses');
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('dev-courses.png', { fullPage: true });
});
```

- [ ] **Step 3: Delete stale baselines** (scene changed completely; the CI visual gate self-deactivates until re-baselined)

```powershell
Remove-Item -Recurse -Force e2e\visual.spec.ts-snapshots
```

- [ ] **Step 4: Update `README.md` controls section**

Replace the Develop section's controls line with:

```markdown
- Controls: ←/→ aim · hold-release (default): hold to charge, release, tap the band · 1–4 or tap to select club · ⚙ settings (switch to 3-click)
- `?seed=N` fixes the course + RNG seed; `&instant=1` skips flight animation; `?dev=courses` shows the generator gallery
```

- [ ] **Step 5: Full local verification**

Run all: `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run test:e2e` (8 passed + 6 visual skipped locally), `npm run build`. All green.

- [ ] **Step 6: Commit**

```powershell
git add e2e src/main.ts README.md
git commit -m "test: m2 visual snapshot set; readme controls"
```

---

## End-of-milestone verification checklist

- [ ] All local gates green (unit suite fully passing, e2e 8 passed + 6 visual skipped locally, lint, typecheck, build)
- [ ] Manual: full hole with hold-and-release feels right; prompts never lie; camera chases and settles smoothly; putting mode engages on the green
- [ ] After merge to main + push: CI green (visual gate auto-skips — baselines deleted), THEN run the "Update visual snapshots" workflow, `git pull`, confirm next CI run hard-gates visuals again
- [ ] Live site updated; iPad manual check (hold-release is touch-native — this is the big one to feel)
- [ ] `?dev=courses` gallery looks varied and sane across 12 seeds




