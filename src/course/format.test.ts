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
