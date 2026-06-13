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
