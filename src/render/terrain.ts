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
