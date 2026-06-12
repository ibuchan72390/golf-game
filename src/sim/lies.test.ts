// src/sim/lies.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { strikeModifier } from './lies';
import { initPhysics, resolveShot } from './shot';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import type { HoleState, ShotIntent } from './types';

beforeAll(async () => {
  await initPhysics();
});

describe('strikeModifier', () => {
  it('fairway and green are neutral', () => {
    expect(strikeModifier(SURFACE.fairway, 'driver', 0.5)).toEqual({ powerMul: 1, errorMul: 1 });
    expect(strikeModifier(SURFACE.green, 'putter', 0.5)).toEqual({ powerMul: 1, errorMul: 1 });
  });
  it('rough costs 20-35% power across the roll range', () => {
    expect(strikeModifier(SURFACE.rough, 'iron7', 0).powerMul).toBeCloseTo(0.8);
    expect(strikeModifier(SURFACE.rough, 'iron7', 1).powerMul).toBeCloseTo(0.65);
    expect(strikeModifier(SURFACE.rough, 'iron7', 0.5).errorMul).toBeGreaterThan(1);
  });
  it('sand is brutal without the wedge, manageable with it', () => {
    const bare = strikeModifier(SURFACE.sand, 'iron7', 0.5);
    const wedge = strikeModifier(SURFACE.sand, 'wedge', 0.5);
    expect(bare.powerMul).toBeLessThan(0.55);
    expect(wedge.powerMul).toBeGreaterThan(0.75);
    expect(bare.errorMul).toBeGreaterThan(wedge.errorMul);
  });
});

describe('resolveShot applies lie at strike', () => {
  function from(fill: Parameters<typeof flatHoleFile>[0]): HoleState {
    const hole = flatHoleFile(fill);
    return { seed: 11, ballPos: { x: 0, y: 0, z: -20 }, holePos: hole.pin, holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: fill ?? SURFACE.fairway };
  }
  const swing: ShotIntent = { club: 'iron7', aimDir: 0, power: 1, contactError: 0 };
  it('the same swing travels measurably shorter from rough', () => {
    const fairway = resolveShot(from(SURFACE.fairway), swing).newState.ballPos.z;
    const rough = resolveShot(from(SURFACE.rough), swing).newState.ballPos.z;
    expect(Math.abs(rough)).toBeLessThan(Math.abs(fairway) * 0.9);
  });
  it('sand without wedge barely advances; wedge mostly recovers', () => {
    const bare = resolveShot(from(SURFACE.sand), swing).newState.ballPos.z;
    const wedge = resolveShot(from(SURFACE.sand), { ...swing, club: 'wedge' }).newState.ballPos.z;
    const clean = resolveShot(from(SURFACE.fairway), { ...swing, club: 'wedge' }).newState.ballPos.z;
    expect(Math.abs(bare)).toBeLessThan(Math.abs(resolveShot(from(SURFACE.fairway), swing).newState.ballPos.z) * 0.55);
    expect(Math.abs(wedge)).toBeGreaterThan(Math.abs(clean) * 0.7);
  });
});
