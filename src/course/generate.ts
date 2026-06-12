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
