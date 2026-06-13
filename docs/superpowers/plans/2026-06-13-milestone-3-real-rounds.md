# Milestone 3: Full Rounds & Progression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Procedurally generated 9-hole rounds with par-3/4/5 doglegs and a running scorecard, then an 8-club bag with four upgradeable stats per club funded by skill points earned per round.

**Architecture:** A multi-segment polyline generator extends the M2 par-3 corridor generator to doglegs; a `Round` orchestrates the existing single-hole `Game` across 9 holes and owns the scorecard; clubs become player-state-dependent via a `ClubLoadout` (base stats + upgrade levels) threaded into a now-parameterized `resolveShot`; progression lives in a v2 save profile. Spec: `docs/superpowers/specs/2026-06-13-milestone-3-design.md`.

**Tech Stack:** Existing M1+M2 stack (TypeScript, Vite, Three.js, `@dimforge/rapier3d-compat`, Vitest, Playwright, GitHub Actions/Pages).

**Sequencing (load-bearing):** Strands 1–2 make 9-hole rounds fully playable with the existing 4-club bag and no progression — that is the mid-milestone checkpoint. Strands 3–5 layer on the 8-club bag, stat upgrades, progression economy, curated course, and visual coverage.

---

## Conventions & decisions (read first)

- **All M1/M2 conventions hold:** meters, Y up, −Z downrange, `aimDir` → `(sin, 0, −cos)`, sim purity (no DOM/Three/`Math.random`/`Date.now` in `src/sim` or `src/course`), single-line commit messages, TDD per task.
- **Generated holes use `cellSize = 2`** (coarser than M2's fixtures, which stay `cellSize = 1`). The format functions (`heightAt`, `surfaceAt`, collider build) already read `cellSize` from the grid spec, so they are unaffected. Rationale: par-5 doglegs need a wide+long grid; `cellSize 2` keeps per-hole cell counts near M2's par-3 (≈15k cells) so generation and per-shot collider build stay fast, and coarser triangles reduce the triangle-edge artifacts the settle-lag hotfix addressed.
- **Centerline wander is bounded to |x| ≤ 30 m** so the world fits a `width = 50` cell grid (x ∈ [−50, 50] m at `cellSize 2`); depth is sized per hole.
- **Club-id migration:** the M2 id `wedge` is removed; the 8-club bag uses `pitchingWedge` and `sandWedge`. Every `'wedge'` reference (`lies.ts`, `powerScale.ts`, `game.ts` `autoClub`, `clubKeys` in `main.ts`, tests) migrates. The sand lie modifier keys on `sandWedge`.
- **`resolveShot` signature change:** `resolveShot(state, intent, loadout)` where `loadout: ClubLoadout` is the effective per-club stats. Strand 1–2 tasks that call `resolveShot` pass `BASE_LOADOUT` (all upgrade levels 0); Strand 3 introduces real loadouts.
- Work happens in a worktree branch created at execution time (orchestrator's job). All paths relative to repo root.

## File structure (new / modified)

```
STRAND 1 — generator
src/course/route.ts          # NEW: centerline polyline routing + corridor distance
src/course/generate.ts       # MODIFY: generateHole(seed, par) multi-segment; generateCourse 9 holes
src/course/route.test.ts     # NEW
src/course/generate.test.ts  # MODIFY: par-4/5 invariants, 9-hole assembly

STRAND 2 — round + scorecard + flow
src/sim/scorecard.ts         # NEW: scorecard data model (pure)
src/app/round.ts             # NEW: Round orchestrates Game across holes
src/ui/scorecard.ts          # NEW: scorecard DOM
src/ui/menu.ts               # NEW: menu + course-select + round-summary DOM
src/app/round.test.ts        # NEW
src/sim/scorecard.test.ts    # NEW
src/main.ts                  # MODIFY: app shell (menu → course-select → round → summary)
src/dev/courses.ts           # MODIFY: render full 9-hole courses
e2e/round.spec.ts            # NEW: full round playthrough

STRAND 3 — clubs + loadout + stat effects
src/sim/types.ts             # MODIFY: ClubId union (8), ClubLoadout, ClubLevels
src/sim/clubs.ts             # MODIFY: 8 clubs, base stats, BASE_LOADOUT, effectiveStats
src/sim/lies.ts              # MODIFY: sandWedge key
src/sim/powerScale.ts        # MODIFY: club-id migration, loadout-aware maxSpeed
src/sim/shot.ts              # MODIFY: resolveShot(state, intent, loadout); forgiveness/spin
src/app/game.ts              # MODIFY: hold a loadout, pass to resolveShot, autoClub ids
src/sim/clubs.test.ts        # MODIFY
src/sim/stateffects.test.ts  # NEW: power/accuracy/forgiveness/spin shot effects

STRAND 4 — progression + profile v2 + upgrade UI
src/save/profile.ts          # MODIFY: v2 (skillPoints, clubLevels, bestScores) + migration
src/sim/progression.ts       # NEW: award formula + upgrade cost curve (pure)
src/ui/upgrade.ts            # NEW: List+Detail upgrade screen DOM
src/save/profile.test.ts     # MODIFY
src/sim/progression.test.ts  # NEW
src/main.ts                  # MODIFY: menu→upgrade nav, award on round end, loadout from profile
e2e/upgrade.spec.ts          # NEW: earn→spend→reload persistence

STRAND 5 — curated course + visuals + wrap
src/course/curated.ts        # NEW: curated course registry ({ name, seed })
src/ui/menu.ts               # MODIFY: list curated courses in course-select
e2e/visual.spec.ts           # MODIFY: par-5, scorecard, upgrade, course-select, gallery
README.md                    # MODIFY
```

---

### Task 1: Centerline routing

**Files:**
- Create: `src/course/route.ts`, `src/course/route.test.ts`

The polyline centerline a hole is routed along. Par-3 = 1 segment (straight), par-4 = 2 (one dogleg), par-5 = 3 (up to two doglegs). Pure + deterministic.

- [ ] **Step 1: Write the failing tests**

```ts
// src/course/route.test.ts
import { describe, expect, it } from 'vitest';
import { routeCenterline, distanceToPolyline, parForLength, segmentCount } from './route';

describe('segmentCount', () => {
  it('maps par to segment count', () => {
    expect(segmentCount(3)).toBe(1);
    expect(segmentCount(4)).toBe(2);
    expect(segmentCount(5)).toBe(3);
  });
});

describe('routeCenterline', () => {
  it('par-3 is a single straight segment tee→green down -z', () => {
    const pts = routeCenterline(42, 3);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual({ x: 0, z: -10 });
    expect(pts[1]!.z).toBeLessThan(pts[0]!.z); // green is downrange
    expect(Math.abs(pts[1]!.x)).toBeLessThan(13); // par-3 pin offset stays modest
  });

  it('par-4 has 3 knees (2 segments) and bends', () => {
    const pts = routeCenterline(42, 4);
    expect(pts.length).toBe(3);
    // each knee progresses downrange
    expect(pts[1]!.z).toBeLessThan(pts[0]!.z);
    expect(pts[2]!.z).toBeLessThan(pts[1]!.z);
  });

  it('par-5 has 4 knees (3 segments)', () => {
    expect(routeCenterline(42, 5).length).toBe(4);
  });

  it('stays within the ±30 m lateral bound for many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const par of [3, 4, 5] as const) {
        for (const p of routeCenterline(seed, par)) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it('total routed length is in the expected band per par', () => {
    const len = (par: 3 | 4 | 5) => {
      const pts = routeCenterline(99, par);
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
      return d;
    };
    expect(len(3)).toBeGreaterThanOrEqual(85);
    expect(len(3)).toBeLessThanOrEqual(185);
    expect(len(4)).toBeGreaterThanOrEqual(260);
    expect(len(4)).toBeLessThanOrEqual(410);
    expect(len(5)).toBeGreaterThanOrEqual(440);
    expect(len(5)).toBeLessThanOrEqual(560);
  });

  it('is deterministic', () => {
    expect(routeCenterline(7, 5)).toEqual(routeCenterline(7, 5));
  });
});

describe('distanceToPolyline', () => {
  it('is zero on the line and grows with perpendicular offset', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -100 }];
    expect(distanceToPolyline(pts, 0, -50)).toBeCloseTo(0, 6);
    expect(distanceToPolyline(pts, 5, -50)).toBeCloseTo(5, 6);
    expect(distanceToPolyline(pts, -8, -50)).toBeCloseTo(8, 6);
  });
  it('measures distance to the nearest segment across a bend', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: 50, z: -50 }];
    // near the second segment (horizontal at z=-50)
    expect(distanceToPolyline(pts, 25, -47)).toBeCloseTo(3, 6);
  });
  it('clamps to segment endpoints', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -50 }];
    expect(distanceToPolyline(pts, 0, 10)).toBeCloseTo(10, 6); // beyond the tee end
  });
});

describe('parForLength', () => {
  it('classifies routed length into par buckets', () => {
    expect(parForLength(140)).toBe(3);
    expect(parForLength(340)).toBe(4);
    expect(parForLength(500)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/course/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement `src/course/route.ts`**

```ts
// src/course/route.ts
import { createRng } from '../sim/rng';

export interface Pt {
  x: number;
  z: number;
}

const LATERAL_BOUND = 30; // meters; keeps the hole inside a width-50 @ cellSize-2 grid
const MAX_DOGLEG = (28 * Math.PI) / 180; // radians per knee

export function segmentCount(par: 3 | 4 | 5): number {
  return par - 2; // 3→1, 4→2, 5→3
}

/** Length bands per par (meters). */
const LENGTH_BANDS: Record<3 | 4 | 5, [number, number]> = {
  3: [90, 180],
  4: [270, 400],
  5: [450, 550],
};

export function parForLength(length: number): 3 | 4 | 5 {
  if (length < 230) return 3;
  if (length < 430) return 4;
  return 5;
}

/**
 * Route a centerline as a polyline of knees from the tee downrange. Segments
 * head generally toward -z; each knee after the first turns by a bounded
 * dogleg angle, and the heading is nudged back toward the centerline whenever
 * lateral drift approaches the bound, so the whole hole fits the grid.
 */
export function routeCenterline(seed: number, par: 3 | 4 | 5): Pt[] {
  const rng = createRng(seed * 2654435761);
  const segs = segmentCount(par);
  const [lo, hi] = LENGTH_BANDS[par];
  const total = lo + rng() * (hi - lo);

  // distribute total length across segments with mild jitter
  const segLens: number[] = [];
  let remaining = total;
  for (let i = 0; i < segs; i++) {
    const left = segs - i;
    const base = remaining / left;
    const len = i === segs - 1 ? remaining : base * (0.8 + rng() * 0.4);
    segLens.push(len);
    remaining -= len;
  }

  const pts: Pt[] = [{ x: 0, z: -10 }];
  let heading = 0; // radians, 0 = -z
  for (let i = 0; i < segs; i++) {
    if (i > 0) {
      // turn by a dogleg, but bias back toward center if drifting out
      const cur = pts[pts.length - 1]!;
      const inwardBias = -Math.sign(cur.x) * Math.min(Math.abs(cur.x) / LATERAL_BOUND, 1);
      const turn = (rng() - 0.5) * 2 * MAX_DOGLEG + inwardBias * MAX_DOGLEG * 0.6;
      heading = Math.max(-MAX_DOGLEG * 1.5, Math.min(MAX_DOGLEG * 1.5, turn));
    }
    const prev = pts[pts.length - 1]!;
    let nx = prev.x + Math.sin(heading) * segLens[i]!;
    const nz = prev.z - Math.cos(heading) * segLens[i]!;
    nx = Math.max(-LATERAL_BOUND, Math.min(LATERAL_BOUND, nx));
    pts.push({ x: nx, z: nz });
  }
  return pts;
}

/** Shortest distance from (x,z) to the polyline (meters). */
export function distanceToPolyline(pts: Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/course/route.test.ts`
Expected: all pass. If the length-band test misses (segment jitter pushed total just outside), the final segment absorbs the remainder so `total` is exact — the band test uses the configured `LENGTH_BANDS`, so it cannot miss unless those constants change. The lateral-bound test is guarded by the clamp; if it ever fails, tighten `MAX_DOGLEG`, not the test.

- [ ] **Step 5: Commit**

```powershell
git add src/course/route.ts src/course/route.test.ts
git commit -m "feat: multi-segment centerline routing for doglegs"
```

### Task 2: Par 3/4/5 generator over the polyline

**Files:**
- Modify: `src/course/generate.ts`, `src/course/generate.test.ts`

- [ ] **Step 1: Rewrite the failing tests** (full replacement of `src/course/generate.test.ts`)

```ts
// src/course/generate.test.ts
import { describe, expect, it } from 'vitest';
import { generateCourse, generateHole } from './generate';
import { SURFACE, heightAt, surfaceAt } from './format';
import { routeCenterline } from './route';

describe('generateHole invariants (seeds 1..120, every par)', () => {
  for (const par of [3, 4, 5] as const) {
    it(`par-${par} holes satisfy invariants`, () => {
      for (let seed = 1; seed <= 120; seed++) {
        const h = generateHole(seed, par);
        expect(h.par).toBe(par);
        expect(h.grid.cellSize).toBe(2);
        expect(h.heights.length).toBe((h.grid.width + 1) * (h.grid.depth + 1));
        expect(h.surfaces.length).toBe(h.grid.width * h.grid.depth);
        // pin on green, tee not on sand
        expect(surfaceAt(h, h.pin.x, h.pin.z)).toBe(SURFACE.green);
        expect(surfaceAt(h, h.tee.x, h.tee.z)).not.toBe(SURFACE.sand);
        // difficulty in range, heights bounded
        expect(h.difficulty).toBeGreaterThanOrEqual(0);
        expect(h.difficulty).toBeLessThanOrEqual(1);
        expect(h.heights.every((v) => Math.abs(v) <= 6)).toBe(true);
        // tee/pin y sit on the surface
        expect(h.tee.y).toBeCloseTo(heightAt(h, h.tee.x, h.tee.z), 5);
        expect(h.pin.y).toBeCloseTo(heightAt(h, h.pin.x, h.pin.z), 5);
        // the whole centerline fits inside the grid
        const halfW = (h.grid.width * h.grid.cellSize) / 2;
        const farZ = -h.grid.depth * h.grid.cellSize;
        for (const p of routeCenterline(seed, par)) {
          expect(Math.abs(p.x)).toBeLessThan(halfW - 4);
          expect(p.z).toBeGreaterThan(farZ + 4);
        }
        // a continuous fairway exists (corridor cells present)
        const fairwayCells = h.surfaces.filter((s) => s === SURFACE.fairway).length;
        expect(fairwayCells).toBeGreaterThan(80);
      }
    });
  }
});

describe('generateCourse', () => {
  it('returns 9 holes with the fixed par-36 mix', () => {
    const course = generateCourse(42);
    expect(course.holes.length).toBe(9);
    const pars = course.holes.map((h) => h.par).sort();
    expect(pars).toEqual([3, 3, 4, 4, 4, 4, 4, 5, 5]);
    expect(course.holes.reduce((s, h) => s + h.par, 0)).toBe(36);
  });

  it('never places two par-5s adjacent', () => {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const pars = generateCourse(seed).holes.map((h) => h.par);
      for (let i = 1; i < pars.length; i++) {
        expect(pars[i] === 5 && pars[i - 1] === 5).toBe(false);
      }
    }
  });

  it('is deterministic (byte-identical) and seed-varying', () => {
    expect(JSON.stringify(generateCourse(42))).toEqual(JSON.stringify(generateCourse(42)));
    expect(JSON.stringify(generateCourse(1))).not.toEqual(JSON.stringify(generateCourse(2)));
  });

  it('holes are independently reproducible from their sub-seed', () => {
    const a = generateCourse(5).holes[3]!;
    const b = generateCourse(5).holes[3]!;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/course/generate.test.ts`
Expected: FAIL — `generateHole` arity/signature and `generateCourse` shape mismatch.

- [ ] **Step 3: Rewrite `src/course/generate.ts`**

```ts
// src/course/generate.ts
import { createRng } from '../sim/rng';
import { SURFACE, heightAt, type CourseFile, type HoleFile, type Surface } from './format';
import { distanceToPolyline, routeCenterline, type Pt } from './route';

const CELL = 2; // meters per cell (coarser than M2 fixtures; keeps long holes cheap)
const WIDTH = 50; // cells → x ∈ [-50, 50] m
const CORRIDOR_HALF = 12; // m fairway half-width
const NOISE_WAVELENGTH = 16; // cells
const NOISE_AMPLITUDE = 1.5; // m

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
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function generateHole(seed: number, par: 3 | 4 | 5): HoleFile {
  const rng = createRng(seed); // green + bunker params; routing uses its own rng internally
  const centerline = routeCenterline(seed, par);
  const tee = { x: centerline[0]!.x, y: 0, z: centerline[0]!.z };
  const greenPt = centerline[centerline.length - 1]!;
  const pin = { x: greenPt.x, y: 0, z: greenPt.z };

  const greenR = 8 + rng() * 4;
  const slopeDir = rng() * Math.PI * 2;
  const slopeMag = 0.2 + rng() * 0.3;

  const minZ = Math.min(...centerline.map((p) => p.z));
  const maxDepthM = -minZ + greenR + 30;
  const depth = Math.ceil(maxDepthM / CELL); // cells
  const row = WIDTH + 1;

  const heights = new Array<number>(row * (depth + 1));
  for (let iz = 0; iz <= depth; iz++) {
    for (let ix = 0; ix <= WIDTH; ix++) {
      const x = (ix - WIDTH / 2) * CELL;
      const z = -iz * CELL;
      let h = (valueNoise(seed, ix / NOISE_WAVELENGTH, iz / NOISE_WAVELENGTH) - 0.5) * 2 * NOISE_AMPLITUDE;
      const dTee = Math.hypot(x - tee.x, z - tee.z);
      const dPin = Math.hypot(x - pin.x, z - pin.z);
      const flat = Math.min(dTee / 15, 1) * Math.min(Math.max((dPin - greenR) / 12, 0), 1);
      h *= flat;
      if (dPin < greenR) {
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
      const dCorr = distanceToPolyline(centerline, x, z);
      const dPin = Math.hypot(x - pin.x, z - pin.z);
      let s: Surface = SURFACE.rough;
      if (dCorr < CORRIDOR_HALF && z <= tee.z + 8) s = SURFACE.fairway;
      if (dPin < greenR) s = SURFACE.green;
      surfaces[iz * WIDTH + ix] = s;
    }
  }

  // bunkers: green-side + one corner bunker per interior knee (inside the bend)
  const bunkers: { x: number; z: number; r: number }[] = [];
  const greenBunkerCount = 1 + Math.floor(rng() * 2);
  for (let b = 0; b < greenBunkerCount; b++) {
    const ang = rng() * Math.PI * 2;
    const dist = greenR + 3 + rng() * 4;
    bunkers.push({ x: pin.x + Math.cos(ang) * dist, z: pin.z + Math.sin(ang) * dist, r: 3 + rng() * 2 });
  }
  for (let k = 1; k < centerline.length - 1; k++) {
    const prev = centerline[k - 1]!, knee = centerline[k]!, next = centerline[k + 1]!;
    const inDir = norm(knee.x - prev.x, knee.z - prev.z);
    const outDir = norm(next.x - knee.x, next.z - knee.z);
    const cross = inDir.x * outDir.z - inDir.z * outDir.x; // turn sign
    const side = cross > 0 ? 1 : -1;
    // perpendicular to incoming direction, toward the inside of the turn
    const perp = { x: -inDir.z * side, z: inDir.x * side };
    const off = CORRIDOR_HALF + 4;
    bunkers.push({ x: knee.x + perp.x * off, z: knee.z + perp.z * off, r: 3 + rng() * 2 });
  }

  let bunkerArea = 0;
  for (const bk of bunkers) {
    if (Math.hypot(bk.x - tee.x, bk.z - tee.z) < 18) continue; // never near the tee
    bunkerArea += Math.PI * bk.r * bk.r;
    for (let iz = 0; iz < depth; iz++) {
      for (let ix = 0; ix < WIDTH; ix++) {
        const x = (ix + 0.5 - WIDTH / 2) * CELL;
        const z = -(iz + 0.5) * CELL;
        if (Math.hypot(x - bk.x, z - bk.z) < bk.r && surfaces[iz * WIDTH + ix] !== SURFACE.green) {
          surfaces[iz * WIDTH + ix] = SURFACE.sand;
        }
      }
    }
  }

  const hole: HoleFile = {
    par,
    grid: { width: WIDTH, depth, cellSize: CELL },
    heights,
    surfaces,
    tee,
    pin,
    difficulty: 0,
  };
  hole.tee.y = heightAt(hole, tee.x, tee.z);
  hole.pin.y = heightAt(hole, pin.x, pin.z);

  let length = 0;
  for (let i = 1; i < centerline.length; i++) {
    length += Math.hypot(centerline[i]!.x - centerline[i - 1]!.x, centerline[i]!.z - centerline[i - 1]!.z);
  }
  const lengthNorm = Math.min((length - 90) / 460, 1); // 0 at par-3 short, 1 at par-5 long
  hole.difficulty = Math.min(
    1,
    0.5 * lengthNorm + 0.35 * Math.min(bunkerArea / 200, 1) + 0.15 * (1 - (greenR - 8) / 4),
  );
  return hole;
}

function norm(x: number, z: number): { x: number; z: number } {
  const m = Math.hypot(x, z) || 1;
  return { x: x / m, z: z / m };
}

const PAR_MIX: (3 | 4 | 5)[] = [3, 3, 4, 4, 4, 4, 4, 5, 5];

/** A 9-hole course: fixed par-36 mix, shuffled per seed, no adjacent par-5s. */
export function generateCourse(seed: number): CourseFile {
  const rng = createRng(seed ^ 0x9e3779b9);
  const order = shuffleNoAdjacentFives(PAR_MIX, rng);
  const holes = order.map((par, i) => generateHole((seed * 131 + i * 977) >>> 0, par));
  return { version: 1, name: `Round ${seed}`, seed, holes };
}

function shuffleNoAdjacentFives(mix: (3 | 4 | 5)[], rng: () => number): (3 | 4 | 5)[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = [...mix];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    let ok = true;
    for (let i = 1; i < a.length; i++) if (a[i] === 5 && a[i - 1] === 5) ok = false;
    if (ok) return a;
  }
  return [3, 4, 5, 4, 3, 4, 5, 4, 4]; // deterministic fallback (no adjacent fives)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/course/generate.test.ts`
Expected: all pass. If `fairwayCells > 80` fails for a par-5 (a long hole's corridor uses few cells at cellSize 2), lower the threshold or widen `CORRIDOR_HALF` slightly — never weaken the pin-on-green / fits-grid invariants. If a generated hole's centerline clips the grid edge, the lateral bound in Task 1 guarantees fit; investigate `routeCenterline` before touching grid size.

- [ ] **Step 5: Minimal interim compile fixes (keep the tree green)**

Three callers break on the new signature. Apply the smallest fixes; full rewiring is Strand 2.
- `src/sim/landing.test.ts`: change every `generateHole(seed)` → `generateHole(seed, 4)` (par-4 holes are long enough for the drives these tunneling tests fire).
- `src/main.ts`: the boot line `const hole = generateHole(seed);` → `const hole = generateHole(seed, 3);` (single-hole interim play continues until the Round shell lands in Strand 2).
- `src/dev/courses.ts`: in the gallery loop, `generateHole(seed)` → `generateHole(seed, 3)`.

- [ ] **Step 6: Verify green**

Run: `npx vitest run` (all pass — generator tests updated, sim green, no other test depended on the old signature), `npm run lint`, `npm run typecheck`, `npm run build` — all clean.

- [ ] **Step 7: Commit**

```powershell
git add src/course/generate.ts src/course/generate.test.ts src/sim/landing.test.ts src/main.ts src/dev/courses.ts
git commit -m "feat: par 3/4/5 generator and 9-hole course assembly"
```

### Task 3: Scorecard data model

**Files:**
- Create: `src/sim/scorecard.ts`, `src/sim/scorecard.test.ts`

Pure data (no DOM). Lives in `src/sim` because it's pure logic the Round and UI both consume.

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/scorecard.test.ts
import { describe, expect, it } from 'vitest';
import {
  makeScorecard, recordHole, totalStrokes, parThroughPlayed, relativeToPar, formatRelative,
} from './scorecard';

const PARS = [4, 3, 5, 4, 4, 3, 5, 4, 4] as const;

describe('scorecard', () => {
  it('starts with all holes unplayed', () => {
    const c = makeScorecard([...PARS]);
    expect(c.holes.length).toBe(9);
    expect(c.holes.every((h) => h.strokes === null)).toBe(true);
    expect(totalStrokes(c)).toBe(0);
  });

  it('records strokes immutably', () => {
    const c0 = makeScorecard([...PARS]);
    const c1 = recordHole(c0, 0, 5);
    expect(c0.holes[0]!.strokes).toBeNull(); // original untouched
    expect(c1.holes[0]!.strokes).toBe(5);
    expect(totalStrokes(c1)).toBe(5);
  });

  it('computes par through played holes and relative score', () => {
    let c = makeScorecard([...PARS]);
    c = recordHole(c, 0, 5); // par 4 → +1
    c = recordHole(c, 1, 2); // par 3 → -1
    expect(parThroughPlayed(c)).toBe(7); // 4 + 3
    expect(totalStrokes(c)).toBe(7);
    expect(relativeToPar(c)).toBe(0); // E
  });

  it('formats relative to par', () => {
    expect(formatRelative(0)).toBe('E');
    expect(formatRelative(3)).toBe('+3');
    expect(formatRelative(-2)).toBe('-2');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/scorecard.test.ts` → FAIL (cannot resolve `./scorecard`).

- [ ] **Step 3: Implement `src/sim/scorecard.ts`**

```ts
// src/sim/scorecard.ts
export interface HoleScore {
  par: 3 | 4 | 5;
  /** null until the hole is completed */
  strokes: number | null;
}

export interface Scorecard {
  holes: HoleScore[];
}

export function makeScorecard(pars: (3 | 4 | 5)[]): Scorecard {
  return { holes: pars.map((par) => ({ par, strokes: null })) };
}

export function recordHole(card: Scorecard, index: number, strokes: number): Scorecard {
  return {
    holes: card.holes.map((h, i) => (i === index ? { ...h, strokes } : h)),
  };
}

export function totalStrokes(card: Scorecard): number {
  return card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0);
}

export function parThroughPlayed(card: Scorecard): number {
  return card.holes.reduce((s, h) => s + (h.strokes !== null ? h.par : 0), 0);
}

export function relativeToPar(card: Scorecard): number {
  return totalStrokes(card) - parThroughPlayed(card);
}

export function formatRelative(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sim/scorecard.test.ts` → 4 passed. Full `npx vitest run`, lint, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/scorecard.ts src/sim/scorecard.test.ts
git commit -m "feat: scorecard data model"
```

---

### Task 4: Round orchestration

**Files:**
- Create: `src/app/round.ts`, `src/app/round.test.ts`

The Round drives the existing single-hole `Game` across the 9 holes and owns the scorecard. Headless — tested with a fake view.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/round.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { Round, type RoundView } from './round';
import { initPhysics } from '../sim/shot';
import { generateCourse } from '../course/generate';

beforeAll(async () => {
  await initPhysics();
});

function makeRound(events: string[]) {
  const course = generateCourse(42);
  const view: RoundView = {
    onStateChange: () => {},
    setBallPosition: () => {},
    setAimDir: () => {},
    frameBall: () => {},
    onLanding: () => {},
    onHoleComplete: (i, strokes) => events.push(`hole ${i} done in ${strokes}`),
    onRoundComplete: () => events.push('round done'),
  };
  return { round: new Round(course, view), course };
}

describe('Round', () => {
  it('starts on hole 0, playing, with a fresh scorecard', () => {
    const { round } = makeRound([]);
    expect(round.index).toBe(0);
    expect(round.phase).toBe('playing');
    expect(round.card.holes.length).toBe(9);
    expect(round.card.holes.every((h) => h.strokes === null)).toBe(true);
    expect(round.game.hole.hole.par).toBe(round.course.holes[0]!.par);
  });

  it('records the score and goes to hole-complete when the hole is holed out', () => {
    const events: string[] = [];
    const { round } = makeRound(events);
    // drive the underlying game to hole-out: place near pin and putt in
    const g = round.game;
    g.hole.ballPos = { x: g.hole.holePos.x, y: 0, z: g.hole.holePos.z + 1.0 };
    g.hole.lie = 2; // green
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 0.5, contactError: 0 });
    g.update(60);
    expect(g.phase).toBe('holed');
    round.onHoleSettled(); // app calls this when it observes the holed phase
    expect(round.phase).toBe('hole-complete');
    expect(round.card.holes[0]!.strokes).toBeGreaterThan(0);
    expect(events[0]).toContain('hole 0 done');
  });

  it('advances to the next hole and finishes after 9', () => {
    const events: string[] = [];
    const { round } = makeRound(events);
    for (let i = 0; i < 9; i++) {
      expect(round.index).toBe(i);
      // simulate completing the hole in 4 strokes via the test seam
      round.completeHoleForTest(4);
      expect(round.phase).toBe('hole-complete');
      round.nextHole();
    }
    expect(round.phase).toBe('round-complete');
    expect(round.card.holes.every((h) => h.strokes === 4)).toBe(true);
    expect(events[events.length - 1]).toBe('round done');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/round.test.ts` → FAIL (cannot resolve `./round`).

- [ ] **Step 3: Implement `src/app/round.ts`**

```ts
// src/app/round.ts
import { Game, type GameView } from './game';
import { makeScorecard, recordHole, type Scorecard } from '../sim/scorecard';
import type { CourseFile } from '../course/format';

export type RoundPhase = 'playing' | 'hole-complete' | 'round-complete';

/** App-level view: per-hole Game callbacks plus round-level events. */
export interface RoundView extends GameView {
  onHoleComplete(index: number, strokes: number, card: Scorecard): void;
  onRoundComplete(card: Scorecard): void;
}

export class Round {
  phase: RoundPhase = 'playing';
  index = 0;
  card: Scorecard;
  game: Game;

  constructor(
    public readonly course: CourseFile,
    private readonly view: RoundView,
  ) {
    this.card = makeScorecard(course.holes.map((h) => h.par));
    this.game = this.makeGame(0);
  }

  private makeGame(index: number): Game {
    const holeFile = this.course.holes[index]!;
    return new Game(this.course.seed * 1000 + index, holeFile, {
      onStateChange: (phase, hole, club) => this.view.onStateChange(phase, hole, club),
      setBallPosition: (p) => this.view.setBallPosition(p),
      setAimDir: (yaw) => this.view.setAimDir(yaw),
      frameBall: () => this.view.frameBall(),
      onLanding: (p) => this.view.onLanding(p),
    });
  }

  /** The app calls this once it has observed game.phase === 'holed' and finished the celebration. */
  onHoleSettled(): void {
    if (this.phase !== 'playing' || this.game.phase !== 'holed') return;
    this.recordAndComplete(this.game.hole.strokes);
  }

  private recordAndComplete(strokes: number): void {
    this.card = recordHole(this.card, this.index, strokes);
    this.phase = 'hole-complete';
    this.view.onHoleComplete(this.index, strokes, this.card);
  }

  /** Test seam: record a score without driving physics. */
  completeHoleForTest(strokes: number): void {
    if (this.phase !== 'playing') return;
    this.recordAndComplete(strokes);
  }

  nextHole(): void {
    if (this.phase !== 'hole-complete') return;
    if (this.index === this.course.holes.length - 1) {
      this.phase = 'round-complete';
      this.view.onRoundComplete(this.card);
      return;
    }
    this.index += 1;
    this.game = this.makeGame(this.index);
    this.phase = 'playing';
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/round.test.ts` → 3 passed. (The "holed out" test relies on the M2 green putt physics; if the putt doesn't drop in this exact setup, nudge the placement to `holePos.z + 0.6` — the assertion only needs `phase === 'holed'`.) Full `npx vitest run`, lint, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/app/round.ts src/app/round.test.ts
git commit -m "feat: round orchestration across nine holes"
```

### Task 5: Scorecard UI

**Files:**
- Create: `src/ui/scorecard.ts`
- Test: `src/ui/scorecard.test.ts`

DOM builder (jsdom-testable for content, like M2's prompts). Renders the 9-hole grid into a container.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/scorecard.test.ts
import { describe, expect, it } from 'vitest';
import { renderScorecard } from './scorecard';
import { makeScorecard, recordHole } from '../sim/scorecard';

describe('renderScorecard', () => {
  it('shows par row, played strokes, blanks for unplayed, and total', () => {
    const root = document.createElement('div');
    let c = makeScorecard([4, 3, 5, 4, 4, 3, 5, 4, 4]);
    c = recordHole(c, 0, 5);
    c = recordHole(c, 1, 2);
    renderScorecard(root, c, 1);
    const text = root.textContent ?? '';
    expect(text).toContain('5'); // hole 1 strokes
    expect(text).toContain('2'); // hole 2 strokes
    expect(root.querySelector('#sc-total')?.textContent).toContain('7'); // total strokes
    expect(root.querySelector('#sc-relative')?.textContent).toBe('E'); // 7 vs par 7
    // current hole highlighted
    expect(root.querySelector('[data-current="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/scorecard.test.ts` → FAIL (cannot resolve `./scorecard`).

- [ ] **Step 3: Implement `src/ui/scorecard.ts`**

```ts
// src/ui/scorecard.ts
import { type Scorecard, totalStrokes, relativeToPar, formatRelative } from '../sim/scorecard';

/** Render the scorecard grid into `root`. `currentIndex` highlights the active hole (-1 = none). */
export function renderScorecard(root: HTMLElement, card: Scorecard, currentIndex: number): void {
  const cell = 'flex:1;text-align:center;padding:6px 0;font-size:13px;';
  const cols = card.holes
    .map((h, i) => {
      const cur = i === currentIndex;
      const strokes = h.strokes === null ? '·' : String(h.strokes);
      const tone = h.strokes === null ? '#90a4ae' : h.strokes <= h.par ? '#66bb6a' : '#ef5350';
      return `
        <div ${cur ? 'data-current="true"' : ''} style="${cell}${cur ? 'background:rgba(255,202,40,.18);border-radius:6px;' : ''}">
          <div style="color:#90a4ae;font-size:10px;">${i + 1}</div>
          <div style="color:#cfd8dc;font-size:10px;">P${h.par}</div>
          <div style="color:${tone};font-weight:700;">${strokes}</div>
        </div>`;
    })
    .join('');
  root.innerHTML = `
    <div style="background:rgba(38,50,56,.95);border-radius:12px;padding:10px 12px;color:#fff;">
      <div style="display:flex;gap:2px;">${cols}</div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px;border-top:1px solid #455a64;padding-top:6px;">
        <span>Total: <b id="sc-total">${totalStrokes(card)}</b></span>
        <span id="sc-relative" style="font-weight:800;color:#ffca28;">${formatRelative(relativeToPar(card))}</span>
      </div>
    </div>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/scorecard.test.ts` → 1 passed. Full suite, lint, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/scorecard.ts src/ui/scorecard.test.ts
git commit -m "feat: scorecard ui"
```

---

### Task 6: Menu, course-select, round-summary, hole-complete UI

**Files:**
- Create: `src/ui/menu.ts`, `src/ui/menu.test.ts`

A small screen library: full-screen overlays with click callbacks. No physics. Tested for content + callback wiring in jsdom.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/menu.test.ts
import { describe, expect, it, vi } from 'vitest';
import { showMenu, showCourseSelect, showRoundSummary, showHoleComplete } from './menu';
import { makeScorecard, recordHole } from '../sim/scorecard';

function root() {
  const r = document.createElement('div');
  document.body.appendChild(r);
  return r;
}

describe('menu screens', () => {
  it('menu fires Play / Upgrade / Settings callbacks', () => {
    const r = root();
    const onPlay = vi.fn(), onUpgrade = vi.fn(), onSettings = vi.fn();
    showMenu(r, { onPlay, onUpgrade, onSettings });
    (r.querySelector('#menu-play') as HTMLElement).click();
    (r.querySelector('#menu-upgrade') as HTMLElement).click();
    (r.querySelector('#menu-settings') as HTMLElement).click();
    expect(onPlay).toHaveBeenCalled();
    expect(onUpgrade).toHaveBeenCalled();
    expect(onSettings).toHaveBeenCalled();
  });

  it('course-select offers curated and random with a seed', () => {
    const r = root();
    const onCourse = vi.fn();
    showCourseSelect(r, [{ name: 'Seagrass Links', seed: 777 }], onCourse);
    (r.querySelector('#course-0') as HTMLElement).click();
    expect(onCourse).toHaveBeenCalledWith(777);
    (r.querySelector('#course-random') as HTMLElement).click();
    expect(onCourse).toHaveBeenCalledTimes(2);
    expect(typeof onCourse.mock.calls[1]![0]).toBe('number');
  });

  it('round summary shows totals and fires continue', () => {
    const r = root();
    let c = makeScorecard([4, 3, 5, 4, 4, 3, 5, 4, 4]);
    c.holes.forEach((_, i) => (c = recordHole(c, i, 4)));
    const onContinue = vi.fn();
    showRoundSummary(r, c, 12, onContinue);
    expect(r.textContent).toContain('12'); // skill points earned
    (r.querySelector('#summary-continue') as HTMLElement).click();
    expect(onContinue).toHaveBeenCalled();
  });

  it('hole-complete shows the score name and fires next', () => {
    const r = root();
    const onNext = vi.fn();
    showHoleComplete(r, 0, 3, 4, onNext); // hole 1, 3 strokes on par 4 → Birdie
    expect(r.textContent).toContain('Birdie');
    (r.querySelector('#hole-next') as HTMLElement).click();
    expect(onNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/menu.test.ts` → FAIL (cannot resolve `./menu`).

- [ ] **Step 3: Implement `src/ui/menu.ts`**

```ts
// src/ui/menu.ts
import { scoreName } from '../sim/scoring';
import { type Scorecard, totalStrokes, relativeToPar, formatRelative } from '../sim/scorecard';
import { renderScorecard } from './scorecard';

const overlay =
  'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:linear-gradient(180deg,#6fc3f0,#cdeefb);pointer-events:auto;font-family:system-ui,sans-serif;';
const btn =
  'background:#1b5e20;color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:18px;font-weight:700;cursor:pointer;min-width:220px;';

export interface MenuCallbacks {
  onPlay(): void;
  onUpgrade(): void;
  onSettings(): void;
}

export function showMenu(root: HTMLElement, cb: MenuCallbacks): void {
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:46px;font-weight:900;color:#1b5e20;text-shadow:0 2px 0 #fff;">⛳ Goofy Golf</div>
      <button id="menu-play" style="${btn}">Play a Round</button>
      <button id="menu-upgrade" style="${btn}background:#37474f;">Upgrade Clubs</button>
      <button id="menu-settings" style="${btn}background:#546e7a;">Settings</button>
    </div>`;
  (root.querySelector('#menu-play') as HTMLElement).onclick = cb.onPlay;
  (root.querySelector('#menu-upgrade') as HTMLElement).onclick = cb.onUpgrade;
  (root.querySelector('#menu-settings') as HTMLElement).onclick = cb.onSettings;
}

export interface CuratedEntry {
  name: string;
  seed: number;
}

export function showCourseSelect(
  root: HTMLElement,
  curated: CuratedEntry[],
  onCourse: (seed: number) => void,
): void {
  const cards = curated
    .map((c, i) => `<button id="course-${i}" style="${btn}">${c.name}</button>`)
    .join('');
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:30px;font-weight:800;color:#1b5e20;">Choose a Course</div>
      ${cards}
      <button id="course-random" style="${btn}background:#37474f;">Random Round 🎲</button>
    </div>`;
  curated.forEach((c, i) => {
    (root.querySelector(`#course-${i}`) as HTMLElement).onclick = () => onCourse(c.seed);
  });
  // Deterministic-ish random seed from the wall clock, hashed to a small int.
  (root.querySelector('#course-random') as HTMLElement).onclick = () =>
    onCourse((Date.now() % 100000) + 1);
}

export function showHoleComplete(
  root: HTMLElement,
  index: number,
  strokes: number,
  par: number,
  onNext: () => void,
): void {
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:40px;font-weight:900;color:#1b5e20;">${scoreName(strokes, par)}</div>
      <div style="font-size:20px;color:#37474f;">Hole ${index + 1} · ${strokes} strokes (par ${par})</div>
      <button id="hole-next" style="${btn}">${index === 8 ? 'Finish Round' : 'Next Hole'}</button>
    </div>`;
  (root.querySelector('#hole-next') as HTMLElement).onclick = onNext;
}

export function showRoundSummary(
  root: HTMLElement,
  card: Scorecard,
  skillPointsEarned: number,
  onContinue: () => void,
): void {
  const scWrap = document.createElement('div');
  scWrap.style.cssText = 'width:min(92vw,640px);';
  renderScorecard(scWrap, card, -1);
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:34px;font-weight:900;color:#1b5e20;">Round Complete</div>
      <div style="font-size:20px;color:#37474f;">${totalStrokes(card)} strokes · ${formatRelative(relativeToPar(card))}</div>
      <div id="summary-card"></div>
      <div style="font-size:22px;font-weight:800;color:#ff6f00;">+${skillPointsEarned} ⭐ skill points</div>
      <button id="summary-continue" style="${btn}">Continue</button>
    </div>`;
  (root.querySelector('#summary-card') as HTMLElement).appendChild(scWrap);
  (root.querySelector('#summary-continue') as HTMLElement).onclick = onContinue;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/menu.test.ts` → 4 passed. Full suite, lint, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/menu.ts src/ui/menu.test.ts
git commit -m "feat: menu, course-select, hole-complete, round-summary screens"
```

### Task 7: App shell — full round flow in `main.ts` + dev gallery

**Files:**
- Modify: `src/main.ts` (rewrite the boot into a screen state machine), `src/dev/courses.ts`

The M2 `main.ts` boots straight into one hole. M3 wraps the in-hole loop (scene, HUD, meters, input, camera — all unchanged) in a screen state machine: `menu → course-select → round (play hole → hole-complete) → round-summary → menu`. The in-hole rendering/input code is lifted into a `playHole(holeFile, onHoledOut)` helper the Round drives.

- [ ] **Step 1: Rewrite `src/main.ts`**

Replace the file with the structure below. The in-hole loop is the M2 loop verbatim except it now targets the Round's current Game and reports hole-out upward. Read the current `src/main.ts` for the exact M2 input/camera/HUD wiring and preserve it inside `mountHole`.

```ts
// src/main.ts
import './style.css';
import { createScene } from './render/scene';
import { createHud } from './ui/hud';
import { createSettingsPanel } from './ui/settings';
import { renderScorecard } from './ui/scorecard';
import { showMenu, showCourseSelect, showHoleComplete, showRoundSummary, type CuratedEntry } from './ui/menu';
import { Round } from './app/round';
import { type GamePhase } from './app/game';
import { initPhysics } from './sim/shot';
import { ThreeClickMeter } from './input/threeClick';
import { HoldReleaseMeter } from './input/holdRelease';
import { generateCourse } from './course/generate';
import { SURFACE } from './course/format';
import { loadProfile, saveProfile, type InputScheme } from './save/profile';
import { renderCourseGallery } from './dev/courses';
import type { ClubId, HoleState, ShotIntent } from './sim/types';
import type { CameraMode } from './render/cameraRig';

const CURATED: CuratedEntry[] = []; // filled in Strand 5

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('dev') === 'courses') {
    renderCourseGallery(document.body);
    return;
  }

  await initPhysics();
  const instant = params.has('instant');
  const canvas = document.querySelector('#game-canvas') as HTMLCanvasElement;
  const hudRoot = document.querySelector('#hud') as HTMLElement;
  const screenRoot = document.createElement('div');
  screenRoot.id = 'screens';
  screenRoot.style.cssText = 'position:fixed;inset:0;z-index:10;';
  document.body.appendChild(screenRoot);
  const scoreStrip = document.createElement('div');
  scoreStrip.id = 'scorestrip';
  scoreStrip.style.cssText = 'position:absolute;top:54px;left:50%;transform:translateX(-50%);width:min(94vw,560px);pointer-events:none;display:none;';
  hudRoot.appendChild(scoreStrip);

  const profile = loadProfile(localStorage);
  let scheme: InputScheme = profile.settings.inputScheme;

  let round: Round | null = null;
  let active: { update(dt: number): void; teardown(): void } | null = null;

  function clearScreens() {
    screenRoot.innerHTML = '';
    screenRoot.style.pointerEvents = 'none';
  }
  function screen() {
    screenRoot.style.pointerEvents = 'auto';
    return screenRoot;
  }

  function toMenu() {
    active?.teardown();
    active = null;
    scoreStrip.style.display = 'none';
    showMenu(screen(), {
      onPlay: () => showCourseSelect(screen(), CURATED, startRound),
      onUpgrade: () => {/* Strand 4 wires the upgrade screen here */ showMenuBackHint(); },
      onSettings: () => {/* settings panel toggles in-hole; from menu just go back */ toMenu(); },
    });
  }
  function showMenuBackHint() { toMenu(); }

  function startRound(seed: number) {
    clearScreens();
    scoreStrip.style.display = 'block';
    round = new Round(generateCourse(seed), {
      onStateChange: () => {},
      setBallPosition: () => {},
      setAimDir: () => {},
      frameBall: () => {},
      onLanding: () => {},
      onHoleComplete: (index, _strokes, card) => {
        renderScorecard(scoreStrip, card, -1);
        showHoleComplete(screen(), index, card.holes[index]!.strokes!, card.holes[index]!.par, () => {
          clearScreens();
          round!.nextHole();
          if (round!.phase === 'round-complete') return; // onRoundComplete handles it
          mountCurrentHole();
        });
      },
      onRoundComplete: (card) => {
        scoreStrip.style.display = 'none';
        const earned = 10; // Strand 4 replaces with the real award
        showRoundSummary(screen(), card, earned, toMenu);
      },
    });
    mountCurrentHole();
  }

  function mountCurrentHole() {
    active?.teardown();
    active = mountHole();
  }

  /**
   * Mounts the in-hole loop against round.game. Returns update+teardown.
   * This body is the M2 main loop: scene/hud/meters/input/camera, but driven by
   * the Round's current Game and reporting hole-out via round.onHoleSettled().
   */
  function mountHole() {
    const game = round!.game;
    const hole = game.hole.hole;
    const scene = createScene(canvas, hole);
    const hud = createHud(hudRoot);
    const threeClick = new ThreeClickMeter();
    const holdRelease = new HoldReleaseMeter();
    const meter = () => (scheme === 'holdRelease' ? holdRelease : threeClick);

    // Re-bind the Game's view to this scene/hud (Round created the Game with app-level passthroughs;
    // here we attach the concrete renderer by wrapping its callbacks).
    bindGameView(game, scene, hud, () => scheme);

    const settings = createSettingsPanel(hudRoot, scheme, (next) => {
      scheme = next;
      threeClick.reset();
      holdRelease.reset();
      saveProfile(localStorage, { ...profile, settings: { inputScheme: next } });
      hud.setMeter(0, 'ready', scheme);
    });
    hud.onGear(() => settings.toggle());
    hud.onClubSelect((club) => game.setClub(club));
    game.syncToView(); // re-emit current state to freshly-mounted scene/hud

    const onInput = makeInputHandlers(game, scene, hud, meter, () => scheme, instant);
    onInput.attach(canvas);

    let last = performance.now();
    let raf = 0;
    function frame(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      const m = meter();
      hud.setMeter(m.value(now), game.phase === 'flying' ? 'swinging' : m.stage(), scheme);
      game.update(dt);
      const mode: CameraMode =
        game.phase === 'flying' ? 'flight'
        : game.hole.lie === SURFACE.green && !game.hole.holedOut ? 'putting'
        : 'aiming';
      scene.updateCamera(dt, mode, game.flightVelocity);
      scene.render();
      // hole-out detection → tell the Round (once)
      if (game.phase === 'holed' && round!.phase === 'playing') {
        round!.onHoleSettled();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    exposeTestHooks(game, () => round, () => scheme);

    return {
      update: () => {},
      teardown: () => {
        cancelAnimationFrame(raf);
        onInput.detach(canvas);
        settings.destroy();
      },
    };
  }

  toMenu();
}

void boot();
```

This task also requires small **support functions** that factor the M2 wiring so `mountHole` stays readable. Add them to `src/main.ts` (below `boot`). Their bodies are lifted verbatim from the current M2 `main.ts` — read it and move the code:
- `bindGameView(game, scene, hud, getScheme)` — wraps `game`'s view callbacks to drive `scene`/`hud` (the M2 `new Game(..., { onStateChange, setBallPosition, setAimDir, frameBall, onLanding })` object, applied to the existing game via a small setter).
- `makeInputHandlers(game, scene, hud, meter, getScheme, instant)` — the M2 `pressDown`/`pressUp`/keydown/keyup/pointer handlers, returning `{ attach, detach }`.
- `exposeTestHooks(game, getRound, getScheme)` — the M2 `window.__golfTest` plus `round` accessors (extended in Task 8).

Because the M2 `Game` created its view in its constructor, add two tiny methods to `src/app/game.ts` to support re-binding and re-sync:

```ts
// in Game:
rebindView(view: GameView): void {
  (this as { view: GameView }).view = view;
}
syncToView(): void {
  this.syncView();
}
```

(Change `private readonly view` to `private view` so `rebindView` can replace it. `syncView` already exists as private; `syncToView` exposes it.)

- [ ] **Step 2: Extend the dev gallery to 9-hole courses (`src/dev/courses.ts`)**

Rewrite `renderCourseGallery` to render full courses (one row of 9 mini-maps per seed) instead of 12 single par-3s:

```ts
// src/dev/courses.ts
import { generateCourse } from '../course/generate';
import type { HoleFile, Surface } from '../course/format';

const CSS_COLORS: Record<Surface, string> = { 0: '#7ec850', 1: '#4f7a33', 2: '#9fdc6a', 3: '#e8d28a' };

function drawHole(hole: HoleFile, px: number): HTMLCanvasElement {
  const { width, depth, cellSize } = hole.grid;
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
    ctx.arc((x / cellSize + width / 2) * px, (-z / cellSize) * px, 3, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(hole.tee.x, hole.tee.z, '#ffffff');
  dot(hole.pin.x, hole.pin.z, '#ef5350');
  return canvas;
}

export function renderCourseGallery(root: HTMLElement, seeds = [1, 2, 3, 4]): void {
  root.innerHTML = '';
  root.style.cssText = 'background:#263238;min-height:100vh;padding:16px;';
  for (const seed of seeds) {
    const course = generateCourse(seed);
    const rowWrap = document.createElement('div');
    rowWrap.style.cssText = 'margin-bottom:18px;';
    const label = document.createElement('div');
    label.textContent = `course ${seed} · par ${course.holes.reduce((s, h) => s + h.par, 0)}`;
    label.style.cssText = 'color:#eceff1;font:13px system-ui;margin-bottom:6px;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;overflow-x:auto;';
    course.holes.forEach((h, i) => {
      const cell = document.createElement('div');
      const c = drawHole(h, 1);
      c.style.cssText = 'width:70px;height:auto;image-rendering:pixelated;border:1px solid #455a64;';
      const cap = document.createElement('div');
      cap.textContent = `${i + 1} · P${h.par}`;
      cap.style.cssText = 'color:#90a4ae;font:10px system-ui;text-align:center;';
      cell.append(c, cap);
      row.appendChild(cell);
    });
    rowWrap.append(label, row);
    root.appendChild(rowWrap);
  }
}
```

- [ ] **Step 3: Verify in the browser**

Run `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` — all green. Then `npm run dev`: from the menu, Play → pick Random Round → play a hole out, see the hole-complete card and the scorecard strip, advance, and (fastest check) confirm the flow reaches the round-summary after 9 holes. `?dev=courses` shows four 9-hole rows with mixed-par doglegs. The orchestrator does the visual browser pass.

- [ ] **Step 4: Commit**

```powershell
git add src/main.ts src/dev/courses.ts src/app/game.ts
git commit -m "feat: app shell with full round flow and 9-hole dev gallery"
```

> **Implementation note:** Task 7 is the milestone's biggest integration step. The `bindGameView` / `makeInputHandlers` / `exposeTestHooks` factoring exists only to keep `mountHole` readable — the actual behavior must match M2's `main.ts` exactly (same input scheme handling, same camera mode selection, same `instant` fast-forward). If the implementer finds it cleaner to inline these rather than factor them, that is acceptable as long as in-hole behavior is identical to M2 and the round flow works.

---

### Task 8: e2e — full round playthrough

**Files:**
- Create: `e2e/round.spec.ts`
- Modify: `src/main.ts` (`exposeTestHooks` gains round-level hooks)

- [ ] **Step 1: Extend `window.__golfTest` in `exposeTestHooks`**

The hook object (built in `mountHole`/`exposeTestHooks`) gains round-aware members alongside the M2 ones:

```ts
// inside exposeTestHooks, extend the object assigned to window.__golfTest:
//   ...M2 getState/swing/placeBall/pin/loadHole...
  roundState: () => {
    const r = getRound();
    return r ? { phase: r.phase, index: r.index, total: r.card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0), pars: r.card.holes.map((h) => h.par) } : null;
  },
  nextHole: () => { const r = getRound(); if (r && r.phase === 'hole-complete') { /* click-through */ document.querySelector<HTMLElement>('#hole-next')?.click(); } },
```

Also add a top-level helper to start a round headlessly from the URL: if `?round=<seed>` is present, `boot` should call `startRound(seed)` directly (skipping the menu) after init. Add that branch in `boot` right after `await initPhysics()`:

```ts
  if (params.has('round')) {
    // deferred until after the scene/screen scaffolding is set up; set a flag
  }
```

Simplest: after `toMenu()` at the end of `boot`, add:

```ts
  if (params.has('round')) startRound(Number(params.get('round')));
```

- [ ] **Step 2: Write `e2e/round.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __golfTest: {
      ready: boolean;
      getState(): { phase: string; holedOut: boolean; lie: number; distToPin: number; club: string; ballPos: { x: number; y: number; z: number } };
      swing(intent: { club?: string; power?: number; contactError?: number }): void;
      roundState(): { phase: string; index: number; total: number; pars: number[] } | null;
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
    await page.waitForFunction(() => window.__golfTest.getState() && window.__golfTest.roundState()?.phase === 'playing');
    await holeOutCurrent(page);
    // advance past the hole-complete card
    await page.evaluate(() => window.__golfTest.nextHole());
  }

  await expect(page.locator('#summary-continue')).toBeVisible({ timeout: 15000 });
  const rs = await page.evaluate(() => window.__golfTest.roundState());
  expect(rs?.phase).toBe('round-complete');
  expect(rs?.total).toBeGreaterThan(20); // 9 holes, several strokes each
});
```

- [ ] **Step 3: Run e2e twice**

Run: `npm run test:e2e` → the round playthrough passes on both projects, twice identically. The M2 specs (`playthrough.spec.ts`, `prompts.spec.ts`, `settings.spec.ts`) still pass — they load single holes via `?seed=`, which now boots into the menu then a single generated hole; **update those three specs** to drive through the new shell: they should navigate `?round=<seed>` or click `#menu-play` → `#course-random` as needed. If the M2 single-hole `?seed=` entry no longer exists, repoint those specs at `?round=` and the first hole, or delete the now-redundant `playthrough.spec.ts` (the round spec supersedes it) — keep `prompts.spec.ts` and `settings.spec.ts`, repointed to start a round first. State exactly what you changed.

If the auto-caddie fails to hole out a long par-5 within 30 swings, log `d/club/power/lie` and tune the caddie club thresholds/power only (these clubs are the 8-club ids from Strand 3 — see note below).

> **Ordering note:** the caddie above uses the **M2 4-club ids** (`driver`/`iron7`/`wedge`/`putter`) because Task 8 lands at the Strand-2 checkpoint, before the 8-club expansion. The club-id migration (Task 9) updates the `wedge` reference here to `sandWedge`, and Task 11 Step 6 broadens the caddie to the full 8-club bag for better long-hole play. The `getState()` typing also omits `club`'s value-set, so no id literal needs the union type.

- [ ] **Step 4: Commit**

```powershell
git add e2e/round.spec.ts src/main.ts e2e/prompts.spec.ts e2e/settings.spec.ts
git commit -m "test: full 9-hole round e2e playthrough"
```

**▶ CHECKPOINT — 9-hole rounds are now fully playable with the M2 4-club bag and no progression. A natural place to merge-to-main and play before Strand 3.**

### Task 9: Expand to the 8-club bag (club-id migration)

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/clubs.ts`, `src/sim/lies.ts`, `src/sim/powerScale.ts`, `src/app/game.ts`, `src/sim/clubs.test.ts`
- Touch (id updates): any test referencing `'wedge'`

- [ ] **Step 1: Extend `ClubId` and `ClubStats` in `src/sim/types.ts`**

```ts
export type ClubId =
  | 'driver' | 'wood3' | 'iron5' | 'iron7' | 'iron9'
  | 'pitchingWedge' | 'sandWedge' | 'putter';

export interface ClubStats {
  name: string;
  /** ball speed in m/s at power = 1 (Power stat) */
  maxSpeed: number;
  /** launch angle in degrees */
  launchDeg: number;
  /** yaw-dispersion scale in radians; lower = tighter (Accuracy stat) */
  accuracy: number;
  /** 0..1, higher = mishits punished less (Forgiveness stat) */
  forgiveness: number;
  /** 0..1, higher = more greenside check / less roll-out on green (Spin stat) */
  spin: number;
}
```

- [ ] **Step 2: Rewrite the `CLUBS` table in `src/sim/clubs.ts`** (base stats for all 8; `launchVelocity` unchanged for now)

```ts
export const CLUBS: Record<ClubId, ClubStats> = {
  driver:        { name: 'Driver',     maxSpeed: 70, launchDeg: 14, accuracy: 0.12, forgiveness: 0.15, spin: 0.1 },
  wood3:         { name: '3 Wood',     maxSpeed: 62, launchDeg: 16, accuracy: 0.11, forgiveness: 0.2,  spin: 0.15 },
  iron5:         { name: '5 Iron',     maxSpeed: 55, launchDeg: 20, accuracy: 0.09, forgiveness: 0.25, spin: 0.3 },
  iron7:         { name: '7 Iron',     maxSpeed: 50, launchDeg: 22, accuracy: 0.08, forgiveness: 0.3,  spin: 0.4 },
  iron9:         { name: '9 Iron',     maxSpeed: 44, launchDeg: 28, accuracy: 0.07, forgiveness: 0.35, spin: 0.5 },
  pitchingWedge: { name: 'Pitching W', maxSpeed: 36, launchDeg: 38, accuracy: 0.06, forgiveness: 0.4,  spin: 0.65 },
  sandWedge:     { name: 'Sand W',     maxSpeed: 30, launchDeg: 48, accuracy: 0.06, forgiveness: 0.4,  spin: 0.8 },
  putter:        { name: 'Putter',     maxSpeed: 12, launchDeg: 0,  accuracy: 0.02, forgiveness: 0.5,  spin: 0 },
};
```

Update `clubs.test.ts`: existing cases use `CLUBS.driver`/`CLUBS.iron7`/`CLUBS.putter` (unchanged ids) and `CLUBS.wedge` (→ `CLUBS.sandWedge` or `CLUBS.pitchingWedge`). The launch-math assertions still hold (the new fields don't affect `launchVelocity` yet). Fix any `wedge` reference; add a smoke assertion that all 8 ids exist:

```ts
it('has eight clubs', () => {
  expect(Object.keys(CLUBS).length).toBe(8);
});
```

- [ ] **Step 3: Migrate `'wedge'` references**
- `src/sim/lies.ts`: sand branch `club === 'wedge'` → `club === 'sandWedge'`.
- `src/sim/powerScale.ts`: chip branch `club === 'wedge'` → `club === 'sandWedge' || club === 'pitchingWedge'`; `CLUBS.wedge.maxSpeed` → `CLUBS[club].maxSpeed`.
- `src/app/game.ts`: `autoClub` off-green default `'iron7'` stays valid; no `'wedge'` there.
- `src/main.ts`: `clubKeys` maps number keys 1–4 to `driver`/`iron7`/`sandWedge`/`putter` (valid ids only; the on-screen selector covers the rest).
- `src/ui/hud.ts`: `CLUB_IDS` list (the club selector) → the 8 ids in bag order. The selector row will be wider; that's fine.
- `e2e/round.spec.ts`: the Strand-2 caddie's sand club `'wedge'` → `'sandWedge'` (Task 11 Step 6 later broadens the whole caddie; this migration just keeps the id valid).
- Confirm none remains: `grep -rn "'wedge'" src e2e` → no matches.

- [ ] **Step 4: Verify**

Run `grep -rn "'wedge'" src` → no matches. Run `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run build` — all green. (No `resolveShot` signature change yet; sim behavior is identical except sand recovery now keys on `sandWedge`.)

- [ ] **Step 5: Commit**

```powershell
git add src
git commit -m "feat: expand to eight-club bag, migrate wedge ids"
```

---

### Task 10: Club loadout (player-dependent stats) threaded into `resolveShot`

**Files:**
- Modify: `src/sim/types.ts`, `src/sim/clubs.ts`, `src/sim/shot.ts`, `src/app/game.ts`
- Test: `src/sim/clubs.test.ts` (effectiveStats), update sim shot tests to pass `BASE_LOADOUT`

- [ ] **Step 1: Add loadout types to `src/sim/types.ts`**

```ts
export interface ClubLevels {
  power: number;
  accuracy: number;
  forgiveness: number;
  spin: number;
}

/** Effective per-club stats for the current player (base + upgrades). */
export type ClubLoadout = Record<ClubId, ClubStats>;

export type ClubLevelMap = Record<ClubId, ClubLevels>;
```

- [ ] **Step 2: Add `effectiveStats` and `BASE_LOADOUT` to `src/sim/clubs.ts`**

Write the failing test first (in `src/sim/clubs.test.ts`):

```ts
import { CLUBS, effectiveStats, BASE_LOADOUT } from './clubs';

describe('effectiveStats', () => {
  it('zero levels equals base', () => {
    expect(effectiveStats('driver', { power: 0, accuracy: 0, forgiveness: 0, spin: 0 })).toEqual(CLUBS.driver);
  });
  it('power raises max speed; accuracy tightens dispersion', () => {
    const s = effectiveStats('iron7', { power: 3, accuracy: 2, forgiveness: 0, spin: 0 });
    expect(s.maxSpeed).toBeGreaterThan(CLUBS.iron7.maxSpeed);
    expect(s.accuracy).toBeLessThan(CLUBS.iron7.accuracy);
  });
  it('forgiveness and spin rise but stay clamped ≤ 0.95', () => {
    const s = effectiveStats('sandWedge', { power: 0, accuracy: 0, forgiveness: 20, spin: 20 });
    expect(s.forgiveness).toBeLessThanOrEqual(0.95);
    expect(s.spin).toBeLessThanOrEqual(0.95);
  });
  it('BASE_LOADOUT is all clubs at base', () => {
    expect(BASE_LOADOUT.driver).toEqual(CLUBS.driver);
    expect(Object.keys(BASE_LOADOUT).length).toBe(8);
  });
});
```

Implement:

```ts
// src/sim/clubs.ts (additions)
import type { ClubId, ClubLevels, ClubLoadout, ClubStats, ShotIntent, Vec3 } from './types';

const POWER_PER_LEVEL = 1.6;      // m/s
const ACCURACY_PER_LEVEL = 0.07;  // fractional tightening
const FORGIVE_PER_LEVEL = 0.05;
const SPIN_PER_LEVEL = 0.04;

export function effectiveStats(club: ClubId, levels: ClubLevels): ClubStats {
  const base = CLUBS[club];
  return {
    name: base.name,
    launchDeg: base.launchDeg,
    maxSpeed: base.maxSpeed + levels.power * POWER_PER_LEVEL,
    accuracy: base.accuracy * Math.max(0.3, 1 - levels.accuracy * ACCURACY_PER_LEVEL),
    forgiveness: Math.min(0.95, base.forgiveness + levels.forgiveness * FORGIVE_PER_LEVEL),
    spin: Math.min(0.95, base.spin + levels.spin * SPIN_PER_LEVEL),
  };
}

const ZERO: ClubLevels = { power: 0, accuracy: 0, forgiveness: 0, spin: 0 };
export const BASE_LOADOUT: ClubLoadout = Object.fromEntries(
  (Object.keys(CLUBS) as ClubId[]).map((id) => [id, effectiveStats(id, ZERO)]),
) as ClubLoadout;
```

- [ ] **Step 3: Change `resolveShot` to take a loadout (`src/sim/shot.ts`)**

Signature: `export function resolveShot(state: HoleState, intent: ShotIntent, loadout: ClubLoadout): ShotResult`. Inside, replace `CLUBS[intent.club]` with `loadout[intent.club]`:

```ts
const club = loadout[intent.club];
const mod = strikeModifier(lieAtStrike, intent.club, rng());
const adjusted: ShotIntent = { ...intent, power: intent.power * mod.powerMul, contactError: Math.max(-1, Math.min(1, intent.contactError * mod.errorMul)) };
const v = launchVelocity(club, adjusted, rng());
```

Add `import type { ClubLoadout } from './types';` and drop the now-unused `CLUBS` import if present.

- [ ] **Step 4: Update sim tests that call `resolveShot`**

Every `resolveShot(state, intent)` call across `src/sim/*.test.ts` (shot, holeout, surfaces, lies, powerScale, heightfield, landing) and `src/app/*.test.ts` (game, round) gains a third arg `BASE_LOADOUT` (import from `../sim/clubs`). The numbers are unchanged because `BASE_LOADOUT[id]` equals `CLUBS[id]`.

- [ ] **Step 5: Thread loadout through `src/app/game.ts`**

`Game` gains a `loadout: ClubLoadout` field (constructor param, defaulting to `BASE_LOADOUT`), and `performSwing` passes it: `resolveShot(this.hole, scaled, this.loadout)`. Also `meterMaxSpeed` uses base club max speed; keep it using `CLUBS` (the meter scale doesn't need upgrades for M3 — power upgrades raise the ceiling via `maxSpeed` in the loadout, but the meter bar maps 0..1 to the loadout's max so a power-upgraded driver hits farther at full bar). Update `performSwing`'s scale divisor from `CLUBS[intent.club].maxSpeed` to `this.loadout[intent.club].maxSpeed` so the bar maps to the upgraded ceiling:

```ts
power: intent.power * (meterMaxSpeed(intent.club, this.hole.lie, this.distToPin()) / this.loadout[intent.club].maxSpeed),
```

and `meterMaxSpeed` itself stays loadout-free for putter/chip (those use base distances; acceptable for M3). Constructor:

```ts
constructor(seed: number, holeFile: HoleFile, private readonly view: GameView, private readonly loadout: ClubLoadout = BASE_LOADOUT) { ... }
```

`Round.makeGame` passes a loadout through (add a `loadout` param to `Round`, default `BASE_LOADOUT`; Strand 4 supplies the real one).

- [ ] **Step 6: Verify**

Run `npx vitest run` (all green — values unchanged under BASE_LOADOUT), twice (determinism), `npm run lint`, `npm run typecheck`, `npm run build`.

- [ ] **Step 7: Commit**

```powershell
git add src
git commit -m "feat: club loadout threaded into resolveShot"
```

---

### Task 11: Forgiveness and Spin shot effects

**Files:**
- Modify: `src/sim/clubs.ts` (`launchVelocity` uses forgiveness), `src/sim/shot.ts` (spin green-check)
- Test: `src/sim/stateffects.test.ts`
- Modify: `e2e/round.spec.ts` (caddie club ids → 8-club)

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/stateffects.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { effectiveStats, BASE_LOADOUT } from './clubs';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import type { ClubLoadout, HoleState, ShotIntent } from './types';

beforeAll(async () => { await initPhysics(); });

function loadoutWith(club: 'iron7' | 'sandWedge', levels: Partial<{ power: number; accuracy: number; forgiveness: number; spin: number }>): ClubLoadout {
  return { ...BASE_LOADOUT, [club]: effectiveStats(club, { power: 0, accuracy: 0, forgiveness: 0, spin: 0, ...levels }) };
}
function state(fill = SURFACE.fairway, z = -20): HoleState {
  const hole = flatHoleFile(fill);
  return { seed: 4, ballPos: { x: 0, y: 0, z }, holePos: hole.pin, holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: fill };
}

describe('Power', () => {
  it('a power-upgraded club carries farther at full power', () => {
    const intent: ShotIntent = { club: 'iron7', aimDir: 0, power: 1, contactError: 0 };
    const base = resolveShot(state(), intent, BASE_LOADOUT).newState.ballPos.z;
    const up = resolveShot(state(), intent, loadoutWith('iron7', { power: 6 })).newState.ballPos.z;
    expect(Math.abs(up)).toBeGreaterThan(Math.abs(base) + 5);
  });
});

describe('Forgiveness', () => {
  it('a mishit lands closer to the aim line with high forgiveness', () => {
    const mishit: ShotIntent = { club: 'iron7', aimDir: 0, power: 1, contactError: 0.8 };
    const base = Math.abs(resolveShot(state(), mishit, BASE_LOADOUT).newState.ballPos.x);
    const forgiving = Math.abs(resolveShot(state(), mishit, loadoutWith('iron7', { forgiveness: 10 })).newState.ballPos.x);
    expect(forgiving).toBeLessThan(base);
  });
});

describe('Spin', () => {
  it('a high-spin approach checks up: less roll-out after landing on the green', () => {
    // fire a wedge onto an all-green surface; measure total travel
    const intent: ShotIntent = { club: 'sandWedge', aimDir: 0, power: 1, contactError: 0 };
    const lowSpin = { ...BASE_LOADOUT, sandWedge: effectiveStats('sandWedge', { power: 0, accuracy: 0, forgiveness: 0, spin: 0 }) };
    const hiSpin = loadoutWith('sandWedge', { spin: 10 });
    const lo = Math.abs(resolveShot(state(SURFACE.green, -10), intent, lowSpin).newState.ballPos.z) - 10;
    const hi = Math.abs(resolveShot(state(SURFACE.green, -10), intent, hiSpin).newState.ballPos.z) - 10;
    expect(hi).toBeLessThan(lo);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/stateffects.test.ts` → forgiveness/spin tests FAIL (effects not wired); power test may already pass.

- [ ] **Step 3: Forgiveness in `launchVelocity` (`src/sim/clubs.ts`)**

Scale the mishit contribution by `(1 - forgiveness)`:

```ts
export function launchVelocity(club: ClubStats, intent: ShotIntent, wobble: number): Vec3 {
  const ce = intent.contactError * (1 - club.forgiveness); // forgiveness softens mishits
  const speed = club.maxSpeed * intent.power;
  const yaw = intent.aimDir + ce * club.accuracy * (0.5 + 0.5 * wobble);
  const pitch = club.launchDeg * DEG2RAD * (1 - 0.2 * Math.abs(ce));
  return {
    x: speed * Math.cos(pitch) * Math.sin(yaw),
    y: speed * Math.sin(pitch),
    z: -speed * Math.cos(pitch) * Math.cos(yaw),
  };
}
```

- [ ] **Step 4: Spin green-check in `src/sim/shot.ts`**

The roll loop already computes `surf` and per-surface damping. When the ball is on the green, multiply its grounded damping by a spin factor from the shot's club so high-spin approaches stop faster. Read the club spin once before the loop:

```ts
const shotSpin = loadout[intent.club].spin; // 0..0.95
```

In the grounded-damping branch, for green only:

```ts
const greenBite = surf === SURFACE.green ? 1 + shotSpin * 2.5 : 1; // spin → extra check
body.setLinearDamping(
  grounded
    ? Math.max(
        (speed < settleGate ? GROUND_DAMPING_SLOW : SURFACE_PHYSICS[surf].damping) * greenBite,
        settleRamp,
      )
    : AIR_DAMPING,
);
```

(Putter spin is 0 → `greenBite = 1`, so putting is unchanged. Determinism holds — `shotSpin` is a pure function of the loadout passed in.)

- [ ] **Step 5: Verify**

Run `npx vitest run` (all green, including the 3 new effect tests), twice for determinism. Lint, typecheck, build clean.

- [ ] **Step 6: Update the e2e caddie to the 8-club ids**

In `e2e/round.spec.ts`, the caddie was written with M2 ids for the Strand 2 checkpoint. Now switch to the 8-club ids: `driver` (d>200), `iron5` (d>130), `iron9` (d>60), `pitchingWedge` (chip), `sandWedge` (sand), `putter` (green) — matching the ids already shown in Task 8's spec. Re-run `npm run test:e2e` twice; tune club thresholds/power only if a par-5 fails to hole in 30 swings.

- [ ] **Step 7: Commit**

```powershell
git add src e2e/round.spec.ts
git commit -m "feat: forgiveness and spin club-stat effects"
```

### Task 12: Save profile v2 (skill points, club levels, best scores)

**Files:**
- Modify: `src/save/profile.ts`, `src/save/profile.test.ts`

- [ ] **Step 1: Write the failing tests** (extend `src/save/profile.test.ts`)

```ts
import { DEFAULT_PROFILE, loadProfile, saveProfile, type Profile } from './profile';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe('profile v2', () => {
  it('default profile is v2 with zeroed progression', () => {
    expect(DEFAULT_PROFILE.version).toBe(2);
    expect(DEFAULT_PROFILE.skillPoints).toBe(0);
    expect(DEFAULT_PROFILE.clubLevels.driver).toEqual({ power: 0, accuracy: 0, forgiveness: 0, spin: 0 });
    expect(Object.keys(DEFAULT_PROFILE.clubLevels).length).toBe(8);
  });

  it('migrates a v1 profile, preserving input scheme and zeroing progression', () => {
    const v1 = JSON.stringify({ version: 1, settings: { inputScheme: 'threeClick' } });
    const p = loadProfile(fakeStorage({ 'golf-profile': v1 }));
    expect(p.version).toBe(2);
    expect(p.settings.inputScheme).toBe('threeClick');
    expect(p.skillPoints).toBe(0);
  });

  it('missing or corrupt → default v2', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE);
    expect(loadProfile(fakeStorage({ 'golf-profile': '{bad' }))).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips a v2 profile with progression', () => {
    const s = fakeStorage();
    const p: Profile = { ...DEFAULT_PROFILE, skillPoints: 12, clubLevels: { ...DEFAULT_PROFILE.clubLevels, driver: { power: 3, accuracy: 1, forgiveness: 0, spin: 0 } }, bestScores: { 'seed:42': 38 } };
    saveProfile(s, p);
    expect(loadProfile(s)).toEqual(p);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/save/profile.test.ts` → FAIL.

- [ ] **Step 3: Rewrite `src/save/profile.ts`**

```ts
import type { ClubId, ClubLevelMap, ClubLevels } from '../sim/types';

export type InputScheme = 'holdRelease' | 'threeClick';

export interface Profile {
  version: 2;
  settings: { inputScheme: InputScheme };
  skillPoints: number;
  clubLevels: ClubLevelMap;
  bestScores: Record<string, number>;
}

const CLUB_IDS: ClubId[] = ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'pitchingWedge', 'sandWedge', 'putter'];
const ZERO: ClubLevels = { power: 0, accuracy: 0, forgiveness: 0, spin: 0 };

function zeroLevels(): ClubLevelMap {
  return Object.fromEntries(CLUB_IDS.map((id) => [id, { ...ZERO }])) as ClubLevelMap;
}

export const DEFAULT_PROFILE: Profile = {
  version: 2,
  settings: { inputScheme: 'holdRelease' },
  skillPoints: 0,
  clubLevels: zeroLevels(),
  bestScores: {},
};

const KEY = 'golf-profile';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadProfile(storage: StorageLike): Profile {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw) as Partial<Profile> & { version?: number; settings?: { inputScheme?: string } };
    const scheme = parsed.settings?.inputScheme === 'threeClick' ? 'threeClick' : 'holdRelease';
    if (parsed.version === 2 && parsed.clubLevels && typeof parsed.skillPoints === 'number') {
      // trust a well-formed v2, but backfill any missing club entries
      const clubLevels = zeroLevels();
      for (const id of CLUB_IDS) {
        const lv = (parsed.clubLevels as ClubLevelMap)[id];
        if (lv) clubLevels[id] = { power: lv.power | 0, accuracy: lv.accuracy | 0, forgiveness: lv.forgiveness | 0, spin: lv.spin | 0 };
      }
      return { version: 2, settings: { inputScheme: scheme }, skillPoints: parsed.skillPoints, clubLevels, bestScores: parsed.bestScores ?? {} };
    }
    if (parsed.version === 1) {
      return { ...structuredClone(DEFAULT_PROFILE), settings: { inputScheme: scheme } };
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

- [ ] **Step 4: Verify**

Run `npx vitest run` — all green (the M2 `main.ts` `saveProfile(localStorage, { ...profile, settings... })` spread still type-checks since `profile` is now v2; verify `main.ts`'s settings-save still compiles, adjusting the spread to keep all v2 fields). Lint, typecheck, build clean.

- [ ] **Step 5: Commit**

```powershell
git add src/save/profile.ts src/save/profile.test.ts src/main.ts
git commit -m "feat: save profile v2 with progression + v1 migration"
```

---

### Task 13: Progression economy (award + upgrade cost)

**Files:**
- Create: `src/sim/progression.ts`, `src/sim/progression.test.ts`

Pure. All constants in one tunable block (the "C with B default" — generous).

- [ ] **Step 1: Write the failing tests**

```ts
// src/sim/progression.test.ts
import { describe, expect, it } from 'vitest';
import { awardPoints, upgradeCost, buyUpgrade, loadoutFromProfile } from './progression';
import { DEFAULT_PROFILE } from '../save/profile';
import { CLUBS } from './clubs';

describe('awardPoints', () => {
  it('always pays a generous baseline, scaled up by difficulty and good scores', () => {
    const easyPar = awardPoints(0.2, 0);     // easy course, even par
    const hardUnder = awardPoints(0.9, -4);  // hard course, 4 under
    const blowup = awardPoints(0.5, 12);     // big over-par
    expect(easyPar).toBeGreaterThanOrEqual(20);
    expect(hardUnder).toBeGreaterThan(easyPar);
    expect(blowup).toBeGreaterThanOrEqual(10); // never punishing-to-zero
  });
});

describe('upgradeCost', () => {
  it('ramps with level', () => {
    expect(upgradeCost(0)).toBeLessThan(upgradeCost(3));
    expect(upgradeCost(0)).toBeGreaterThan(0);
  });
});

describe('buyUpgrade', () => {
  it('spends points and raises the level when affordable', () => {
    const p = { ...DEFAULT_PROFILE, skillPoints: 100 };
    const next = buyUpgrade(p, 'driver', 'power');
    expect(next).not.toBeNull();
    expect(next!.clubLevels.driver.power).toBe(1);
    expect(next!.skillPoints).toBe(100 - upgradeCost(0));
  });
  it('returns null when unaffordable', () => {
    const p = { ...DEFAULT_PROFILE, skillPoints: 0 };
    expect(buyUpgrade(p, 'driver', 'power')).toBeNull();
  });
  it('caps at the max level', () => {
    let p = { ...DEFAULT_PROFILE, skillPoints: 100000, clubLevels: { ...DEFAULT_PROFILE.clubLevels, driver: { power: 10, accuracy: 0, forgiveness: 0, spin: 0 } } };
    expect(buyUpgrade(p, 'driver', 'power')).toBeNull(); // already at cap
  });
});

describe('loadoutFromProfile', () => {
  it('base profile yields base stats; upgrades raise them', () => {
    const base = loadoutFromProfile(DEFAULT_PROFILE);
    expect(base.driver.maxSpeed).toBe(CLUBS.driver.maxSpeed);
    const up = loadoutFromProfile({ ...DEFAULT_PROFILE, clubLevels: { ...DEFAULT_PROFILE.clubLevels, driver: { power: 5, accuracy: 0, forgiveness: 0, spin: 0 } } });
    expect(up.driver.maxSpeed).toBeGreaterThan(CLUBS.driver.maxSpeed);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/sim/progression.test.ts` → FAIL (cannot resolve `./progression`).

- [ ] **Step 3: Implement `src/sim/progression.ts`**

```ts
// src/sim/progression.ts
import { effectiveStats } from './clubs';
import type { ClubId, ClubLoadout, ClubLevels } from './types';
import type { Profile } from '../save/profile';

// ── Tunable economy block (generous "B" default) ──────────────────────────
const AWARD_BASE = 30;          // baseline points for finishing a round
const DIFFICULTY_BONUS = 1.0;   // ×(1 + DIFFICULTY_BONUS·difficulty)
const SCORE_SLOPE = 0.08;       // each stroke under par adds, over par removes
const SCORE_FLOOR = 0.4;        // score multiplier never below this
const UPGRADE_BASE_COST = 2;    // cost of the first level
const UPGRADE_COST_SLOPE = 2;   // +slope per existing level
export const MAX_STAT_LEVEL = 10;
// ──────────────────────────────────────────────────────────────────────────

/** Points for a completed round. `difficulty` 0..1 avg; `relativeToPar` total strokes − par. */
export function awardPoints(difficulty: number, relativeToPar: number): number {
  const scoreMul = Math.max(SCORE_FLOOR, 1.5 - relativeToPar * SCORE_SLOPE);
  return Math.round(AWARD_BASE * (1 + DIFFICULTY_BONUS * difficulty) * scoreMul);
}

export function upgradeCost(currentLevel: number): number {
  return UPGRADE_BASE_COST + currentLevel * UPGRADE_COST_SLOPE;
}

export type StatKey = keyof ClubLevels;

/** Returns a new profile with the upgrade applied, or null if unaffordable / capped. */
export function buyUpgrade(profile: Profile, club: ClubId, stat: StatKey): Profile | null {
  const cur = profile.clubLevels[club][stat];
  if (cur >= MAX_STAT_LEVEL) return null;
  const cost = upgradeCost(cur);
  if (profile.skillPoints < cost) return null;
  return {
    ...profile,
    skillPoints: profile.skillPoints - cost,
    clubLevels: {
      ...profile.clubLevels,
      [club]: { ...profile.clubLevels[club], [stat]: cur + 1 },
    },
  };
}

export function loadoutFromProfile(profile: Profile): ClubLoadout {
  const ids = Object.keys(profile.clubLevels) as ClubId[];
  return Object.fromEntries(ids.map((id) => [id, effectiveStats(id, profile.clubLevels[id])])) as ClubLoadout;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/sim/progression.test.ts` → all pass. Full suite, lint, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/sim/progression.ts src/sim/progression.test.ts
git commit -m "feat: skill-point award and upgrade economy"
```

---

### Task 14: Upgrade screen (List + Detail)

**Files:**
- Create: `src/ui/upgrade.ts`, `src/ui/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/upgrade.test.ts
import { describe, expect, it, vi } from 'vitest';
import { showUpgradeScreen } from './upgrade';
import { DEFAULT_PROFILE } from '../save/profile';

describe('upgrade screen', () => {
  it('shows the SP balance, club list, and fires buy with the selected club+stat', () => {
    const root = document.createElement('div');
    const onBuy = vi.fn();
    const onClose = vi.fn();
    const profile = { ...DEFAULT_PROFILE, skillPoints: 50 };
    showUpgradeScreen(root, profile, { onBuy, onClose });
    expect(root.textContent).toContain('50'); // SP balance
    // select 7 iron, then buy Power
    (root.querySelector('#club-iron7') as HTMLElement).click();
    (root.querySelector('#buy-power') as HTMLElement).click();
    expect(onBuy).toHaveBeenCalledWith('iron7', 'power');
    (root.querySelector('#upgrade-close') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/upgrade.test.ts` → FAIL (cannot resolve `./upgrade`).

- [ ] **Step 3: Implement `src/ui/upgrade.ts`**

```ts
// src/ui/upgrade.ts
import { CLUBS } from '../sim/clubs';
import { upgradeCost, MAX_STAT_LEVEL, type StatKey } from '../sim/progression';
import type { ClubId } from '../sim/types';
import type { Profile } from '../save/profile';

const CLUB_IDS: ClubId[] = ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'pitchingWedge', 'sandWedge', 'putter'];
const STATS: { key: StatKey; label: string; color: string }[] = [
  { key: 'power', label: 'Power', color: '#66bb6a' },
  { key: 'accuracy', label: 'Accuracy', color: '#4fc3f7' },
  { key: 'forgiveness', label: 'Forgiveness', color: '#ffca28' },
  { key: 'spin', label: 'Spin', color: '#ba68c8' },
];

export interface UpgradeCallbacks {
  onBuy(club: ClubId, stat: StatKey): void;
  onClose(): void;
}

export function showUpgradeScreen(root: HTMLElement, profile: Profile, cb: UpgradeCallbacks, selected: ClubId = 'driver'): void {
  const overlay = 'position:absolute;inset:0;background:linear-gradient(180deg,#37474f,#263238);color:#fff;pointer-events:auto;font-family:system-ui,sans-serif;display:flex;flex-direction:column;padding:14px;gap:10px;';
  const list = CLUB_IDS.map((id) => {
    const on = id === selected;
    return `<button id="club-${id}" style="text-align:left;background:${on ? '#1b5e20' : '#455a64'};color:#fff;border:none;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:${on ? 700 : 400};cursor:pointer;">${CLUBS[id].name}</button>`;
  }).join('');
  const lv = profile.clubLevels[selected];
  const detail = STATS.map((s) => {
    const level = lv[s.key];
    const cost = upgradeCost(level);
    const maxed = level >= MAX_STAT_LEVEL;
    const afford = profile.skillPoints >= cost && !maxed;
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;"><span style="color:#b0bec5;">${s.label}</span><span>Lv ${level}</span></div>
        <div style="height:10px;background:#1b2327;border-radius:5px;margin:4px 0;overflow:hidden;"><div style="width:${(level / MAX_STAT_LEVEL) * 100}%;height:100%;background:${s.color};"></div></div>
        <button id="buy-${s.key}" ${maxed ? 'disabled' : ''} style="width:100%;background:${afford ? '#ffca28' : '#546e7a'};color:#263238;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:800;cursor:${afford ? 'pointer' : 'default'};">${maxed ? 'MAX' : `+ ${s.label} · ${cost} ⭐`}</button>
      </div>`;
  }).join('');
  root.innerHTML = `
    <div style="${overlay}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:22px;font-weight:800;">Upgrade Clubs</div>
        <div style="font-size:16px;font-weight:800;color:#ffca28;">⭐ ${profile.skillPoints} SP</div>
        <button id="upgrade-close" style="background:#546e7a;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;">Done</button>
      </div>
      <div style="display:flex;gap:10px;flex:1;min-height:0;">
        <div style="width:40%;display:flex;flex-direction:column;gap:4px;overflow:auto;">${list}</div>
        <div style="flex:1;background:#1b2327;border-radius:10px;padding:12px;overflow:auto;">
          <div style="font-weight:800;margin-bottom:10px;">${CLUBS[selected].name}</div>
          ${detail}
        </div>
      </div>
    </div>`;
  for (const id of CLUB_IDS) {
    (root.querySelector(`#club-${id}`) as HTMLElement).onclick = () => showUpgradeScreen(root, profile, cb, id);
  }
  for (const s of STATS) {
    const b = root.querySelector(`#buy-${s.key}`) as HTMLButtonElement;
    if (!b.disabled) b.onclick = () => cb.onBuy(selected, s.key);
  }
  (root.querySelector('#upgrade-close') as HTMLElement).onclick = cb.onClose;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/upgrade.test.ts` → 1 passed. Full suite, lint, typecheck clean.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/upgrade.ts src/ui/upgrade.test.ts
git commit -m "feat: list+detail club upgrade screen"
```

---

### Task 15: Wire progression into the app

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Build the loadout from the profile and pass it to the Round**

In `boot`, after loading `profile`, derive the loadout and keep a mutable profile reference:

```ts
import { loadoutFromProfile, awardPoints, buyUpgrade } from './sim/progression';
import { showUpgradeScreen } from './ui/upgrade';
// ...
let profile = loadProfile(localStorage);
let loadout = loadoutFromProfile(profile);
```

`startRound` passes `loadout` to `new Round(course, view, loadout)` (add the `loadout` param to `Round` and `Round.makeGame` → `new Game(seed, holeFile, view, loadout)`).

- [ ] **Step 2: Award real points on round completion**

Replace the placeholder `earned = 10` in `onRoundComplete` with the real award. The course's average difficulty and the scorecard's relative-to-par drive it:

```ts
onRoundComplete: (card) => {
  scoreStrip.style.display = 'none';
  const avgDifficulty = round!.course.holes.reduce((s, h) => s + h.difficulty, 0) / round!.course.holes.length;
  const rel = card.holes.reduce((s, h) => s + ((h.strokes ?? 0) - h.par), 0);
  const earned = awardPoints(avgDifficulty, rel);
  profile = { ...profile, skillPoints: profile.skillPoints + earned };
  // record best score per course
  const key = `seed:${round!.course.seed}`;
  const total = card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0);
  if (profile.bestScores[key] === undefined || total < profile.bestScores[key]!) {
    profile = { ...profile, bestScores: { ...profile.bestScores, [key]: total } };
  }
  saveProfile(localStorage, profile);
  showRoundSummary(screen(), card, earned, toMenu);
},
```

- [ ] **Step 3: Wire the menu's Upgrade button to the upgrade screen**

Replace the `onUpgrade` stub in `toMenu`:

```ts
onUpgrade: () => openUpgrade(),
// ...
function openUpgrade() {
  showUpgradeScreen(screen(), profile, {
    onBuy: (club, stat) => {
      const next = buyUpgrade(profile, club, stat);
      if (next) {
        profile = next;
        loadout = loadoutFromProfile(profile);
        saveProfile(localStorage, profile);
        openUpgrade(); // re-render with new balance/levels
      }
    },
    onClose: toMenu,
  });
}
```

- [ ] **Step 4: Expose profile state to the test hook**

In `exposeTestHooks`, add:

```ts
profileState: () => ({ skillPoints: profile.skillPoints, driverPower: profile.clubLevels.driver.power }),
```

- [ ] **Step 5: Verify in the browser**

`npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` green. Then `npm run dev`: play a round → round summary shows real points → menu → Upgrade Clubs → buy a Power level on the driver (balance drops, bar fills) → Done → play again and the driver hits farther. The orchestrator does the visual pass.

- [ ] **Step 6: Commit**

```powershell
git add src/main.ts
git commit -m "feat: wire skill-point award, persistence, and upgrades into the app"
```

---

### Task 16: Upgrade-and-persist e2e

**Files:**
- Create: `e2e/upgrade.spec.ts`

- [ ] **Step 1: Write `e2e/upgrade.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __golfTest: {
      ready: boolean;
      grantPoints?(n: number): void;
      profileState(): { skillPoints: number; driverPower: number };
    };
  }
}

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
```

- [ ] **Step 2: Add the `grantPoints` test hook in `src/main.ts`**

In `exposeTestHooks`, add (test-only — mutates the profile + persists):

```ts
grantPoints: (n: number) => { profile = { ...profile, skillPoints: profile.skillPoints + n }; saveProfile(localStorage, profile); },
```

Note: `exposeTestHooks` runs inside `mountHole`, but the menu/upgrade screens exist before any hole is mounted. Move the `__golfTest` assignment so it is set up once in `boot` (not per-hole), closing over `getRound`/`profile` accessors, so `grantPoints`/`profileState` are available on the menu screen. Refactor `exposeTestHooks(getGame, getRound, getProfile, setProfile, getScheme)` to be called once in `boot`, reading the current game via `() => round?.game`.

- [ ] **Step 3: Run e2e twice**

Run: `npm run test:e2e` → the upgrade spec passes on both projects, twice. The round and M2 specs still pass. Visual specs skip locally.

- [ ] **Step 4: Commit**

```powershell
git add e2e/upgrade.spec.ts src/main.ts
git commit -m "test: upgrade-and-persist e2e"
```

### Task 17: Curated course

**Files:**
- Create: `src/course/curated.ts`, `src/course/curated.test.ts`
- Modify: `src/main.ts` (populate `CURATED`)

A curated course is a named seed (per the spec: pick a strong generator output; no hand-tuned blob unless needed). Loaded by regenerating from the seed — identical path to a random round.

- [ ] **Step 1: Pick a good seed**

Run `npm run dev` → `?dev=courses` and review several seeds. Pick one whose 9 holes look varied and fair (mix of dogleg directions, no degenerate holes, greens reachable). Verify it plays by starting `?round=<seed>` and playing a few holes. Record the chosen seed (call it `SEAGRASS_SEED`).

- [ ] **Step 2: Write the failing test**

```ts
// src/course/curated.test.ts
import { describe, expect, it } from 'vitest';
import { CURATED_COURSES } from './curated';
import { generateCourse } from './generate';

describe('curated courses', () => {
  it('lists at least one named course with a valid seed', () => {
    expect(CURATED_COURSES.length).toBeGreaterThanOrEqual(1);
    for (const c of CURATED_COURSES) {
      expect(c.name.length).toBeGreaterThan(0);
      const course = generateCourse(c.seed);
      expect(course.holes.length).toBe(9);
      expect(course.holes.reduce((s, h) => s + h.par, 0)).toBe(36);
    }
  });
});
```

- [ ] **Step 3: Implement `src/course/curated.ts`**

```ts
// src/course/curated.ts
export interface CuratedCourse {
  name: string;
  seed: number;
}

/** Curated 9-hole courses: hand-picked generator seeds. (More is a later pass.) */
export const CURATED_COURSES: CuratedCourse[] = [
  { name: 'Seagrass Links', seed: /* SEAGRASS_SEED from Step 1 */ 12345 },
];
```

(Replace `12345` with the seed chosen in Step 1.)

- [ ] **Step 4: Populate `CURATED` in `src/main.ts`**

```ts
import { CURATED_COURSES } from './course/curated';
const CURATED: CuratedEntry[] = CURATED_COURSES;
```

- [ ] **Step 5: Verify**

Run `npx vitest run`, lint, typecheck, build. `npm run dev` → menu → Play → "Seagrass Links" appears and starts a playable round.

- [ ] **Step 6: Commit**

```powershell
git add src/course/curated.ts src/course/curated.test.ts src/main.ts
git commit -m "feat: curated course registry (Seagrass Links)"
```

---

### Task 18: Visual snapshots & README

**Files:**
- Modify: `e2e/visual.spec.ts`, `src/main.ts` (test hooks for screen navigation if needed), `README.md`
- Delete: stale `e2e/visual.spec.ts-snapshots/` (the generator + cellSize change shifts every terrain render)

- [ ] **Step 1: Rewrite `e2e/visual.spec.ts`**

```ts
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
```

> The mid-round scorecard snapshot is awkward to stabilize deterministically; the spec above snapshots **course-select** instead and leaves the scorecard to unit coverage (`scorecard.test.ts`). If a stable mid-round scorecard snapshot is wanted, add a `__golfTest.holeComplete()` hook that records a fixed score and shows the card, then snapshot it — only if it proves stable in CI.

- [ ] **Step 2: Delete stale baselines**

```powershell
Remove-Item -Recurse -Force e2e\visual.spec.ts-snapshots
```

(The CI visual gate self-skips when the snapshot dir is absent — same self-activating pattern as M2. Re-baseline after merge.)

- [ ] **Step 3: Update `README.md`**

Replace the Develop/controls section to reflect rounds + progression:

```markdown
## Develop

- `npm install` then `npm run dev`
- Menu → Play a Round (curated course or random) → 9 holes with a scorecard → round summary
- Menu → Upgrade Clubs spends skill points earned per round on the 8-club bag
- Controls in a hole: ←/→ aim · hold-release (default): hold to charge, release, tap the band · 1–4 or tap to select club · ⚙ settings
- `?round=N` boots straight into a round on seed N; `&instant=1` skips flight animation; `?dev=courses` shows the generator gallery

## Architecture

See `docs/superpowers/specs/`. Load-bearing rules: `src/sim/` and `src/course/` never import DOM/Three and never call `Math.random()`/`Date.now()`; `resolveShot` is deterministic given `(state, intent, loadout)`; the `Round` orchestrates the single-hole `Game`; progression lives in the versioned save profile.
```

- [ ] **Step 4: Full verification**

`npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run test:e2e` (visual skipped locally), `npm run build` — all green.

- [ ] **Step 5: Commit**

```powershell
git add e2e README.md src/main.ts
git commit -m "test: m3 visual snapshot set; readme update"
```

---

## End-of-milestone verification checklist

- [ ] All local gates green: full unit suite, `npm run test:e2e` (round + upgrade + M2 specs pass, visual skipped locally), lint, typecheck, build.
- [ ] Manual: a full 9-hole round plays start to finish with a running scorecard; par-4/5 holes show real doglegs; the round summary awards points; the upgrade screen spends them and a power-upgraded driver visibly hits farther next round; settings still toggle swing scheme.
- [ ] Determinism: a fixed round seed produces identical holes and identical shot results (given the same loadout) on re-run and in CI.
- [ ] Post-merge: push → CI green (visual gate self-skips, baselines deleted) → run the "Update visual snapshots" workflow → `git pull` → empty commit to re-trigger CI → confirm the visual gate hard-passes and Pages deploys. (Same flow as M1/M2.)
- [ ] iPad manual check: round flow, scorecard, and upgrade screen are usable at the iPad viewport (List+Detail upgrade layout was chosen for exactly this).
- [ ] `?dev=courses` shows varied, fair 9-hole courses across seeds.

## Notes on sequencing & green-between-strands

- **Strand 1 → 2:** Task 2 includes interim `main.ts`/`dev` compile fixes so every commit is green; Strand 2 then restores the real app shell.
- **Strand 2 → 3:** the **checkpoint** after Task 8 is fully playable rounds with the 4-club bag — a good merge/play point. Task 8's e2e caddie uses M2 club ids there and is updated to 8-club ids in Task 11 Step 6.
- **Strand 3 → 4 → 5:** each task keeps the tree green (BASE_LOADOUT / profile migration / additive UI). The curated seed (Task 17) and visual baselines (Task 18) are the only steps needing human/CI judgment, mirroring M2.







