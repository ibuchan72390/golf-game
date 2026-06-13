import { describe, expect, it } from 'vitest';
import { routeCenterline, distanceToPolyline, parForLength, segmentCount } from './route';

describe('segmentCount', () => {
  it('maps par to segment count', () => {
    expect(segmentCount(3)).toBe(1);
    expect(segmentCount(4)).toBe(2);
    expect(segmentCount(5)).toBe(3);
  });
});

describe('routeCenterline', () => {
  it('par-3 is a single straight segment tee→green down -z', () => {
    const pts = routeCenterline(42, 3);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual({ x: 0, z: -10 });
    expect(pts[1]!.z).toBeLessThan(pts[0]!.z); // green is downrange
    expect(Math.abs(pts[1]!.x)).toBeLessThan(13); // par-3 pin offset stays modest
  });

  it('par-4 has 3 knees (2 segments) and bends', () => {
    const pts = routeCenterline(42, 4);
    expect(pts.length).toBe(3);
    // each knee progresses downrange
    expect(pts[1]!.z).toBeLessThan(pts[0]!.z);
    expect(pts[2]!.z).toBeLessThan(pts[1]!.z);
  });

  it('par-5 has 4 knees (3 segments)', () => {
    expect(routeCenterline(42, 5).length).toBe(4);
  });

  it('stays within the ±30 m lateral bound for many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const par of [3, 4, 5] as const) {
        for (const p of routeCenterline(seed, par)) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  it('total routed length is in the expected band per par', () => {
    const len = (par: 3 | 4 | 5) => {
      const pts = routeCenterline(99, par);
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
      return d;
    };
    expect(len(3)).toBeGreaterThanOrEqual(85);
    expect(len(3)).toBeLessThanOrEqual(185);
    expect(len(4)).toBeGreaterThanOrEqual(260);
    expect(len(4)).toBeLessThanOrEqual(410);
    expect(len(5)).toBeGreaterThanOrEqual(440);
    expect(len(5)).toBeLessThanOrEqual(560);
  });

  it('is deterministic', () => {
    expect(routeCenterline(7, 5)).toEqual(routeCenterline(7, 5));
  });
});

describe('distanceToPolyline', () => {
  it('is zero on the line and grows with perpendicular offset', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -100 }];
    expect(distanceToPolyline(pts, 0, -50)).toBeCloseTo(0, 6);
    expect(distanceToPolyline(pts, 5, -50)).toBeCloseTo(5, 6);
    expect(distanceToPolyline(pts, -8, -50)).toBeCloseTo(8, 6);
  });
  it('measures distance to the nearest segment across a bend', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -50 }, { x: 50, z: -50 }];
    // near the second segment (horizontal at z=-50)
    expect(distanceToPolyline(pts, 25, -47)).toBeCloseTo(3, 6);
  });
  it('clamps to segment endpoints', () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: -50 }];
    expect(distanceToPolyline(pts, 0, 10)).toBeCloseTo(10, 6); // beyond the tee end
  });
});

describe('parForLength', () => {
  it('classifies routed length into par buckets', () => {
    expect(parForLength(140)).toBe(3);
    expect(parForLength(340)).toBe(4);
    expect(parForLength(500)).toBe(5);
  });
});
