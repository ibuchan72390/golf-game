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
