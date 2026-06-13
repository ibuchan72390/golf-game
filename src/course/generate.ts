// src/course/generate.ts
import { createRng } from '../sim/rng';
import { SURFACE, heightAt, type CourseFile, type HoleFile, type Surface } from './format';
import { distanceToPolyline, routeCenterline } from './route';

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
