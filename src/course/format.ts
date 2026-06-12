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
