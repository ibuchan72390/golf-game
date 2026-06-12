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
        expect(h.heights.every((v) => Math.abs(v) <= 6)).toBe(true);
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
