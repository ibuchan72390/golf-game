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
  const rng = createRng(Math.imul(seed, 2654435761) >>> 0);
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
