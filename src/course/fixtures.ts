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

/** Ramp rising +0.02 m per -z meter — z-mirror of the collider fill cannot pass this. */
export function zRampHoleFile(): HoleFile {
  const base = flatHoleFile();
  // Move pin off-grid so probe points are never captured before settling.
  base.pin = { x: 0, y: 0, z: -1 };
  for (let iz = 0; iz <= base.grid.depth; iz++) {
    for (let ix = 0; ix <= base.grid.width; ix++) {
      base.heights[iz * (base.grid.width + 1) + ix] = iz * base.grid.cellSize * 0.02;
    }
  }
  return base;
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
