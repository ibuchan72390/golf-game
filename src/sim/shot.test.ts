import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import type { HoleState, ShotIntent } from './types';

function flatHole(): HoleState {
  return {
    seed: 42,
    ballPos: { x: 0, y: 0, z: 0 },
    holePos: { x: 0, y: 0, z: -150 },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
  };
}

const fullDrive: ShotIntent = { club: 'driver', aimDir: 0, power: 1, contactError: 0 };

beforeAll(async () => {
  await initPhysics();
});

describe('resolveShot', () => {
  it('is deterministic: identical state + intent → identical trajectory', () => {
    const a = resolveShot(flatHole(), fullDrive);
    const b = resolveShot(flatHole(), fullDrive);
    expect(JSON.stringify(a.trajectory)).toEqual(JSON.stringify(b.trajectory));
    expect(a.newState).toEqual(b.newState);
  });

  it('a pure full drive flies far, straight, and comes to rest', () => {
    const { newState, trajectory } = resolveShot(flatHole(), fullDrive);
    expect(newState.ballPos.z).toBeLessThan(-120);
    expect(newState.ballPos.z).toBeGreaterThan(-320);
    expect(Math.abs(newState.ballPos.x)).toBeLessThan(0.5);
    expect(newState.strokes).toBe(1);
    expect(newState.holedOut).toBe(false);
    expect(trajectory.length).toBeGreaterThan(10);
    const peak = Math.max(...trajectory.map((s) => s.pos.y));
    expect(peak).toBeGreaterThan(5);
  });

  it('different seeds disperse a mishit differently', () => {
    const mishit: ShotIntent = { club: 'driver', aimDir: 0, power: 1, contactError: 0.8 };
    const a = resolveShot({ ...flatHole(), seed: 1 }, mishit);
    const b = resolveShot({ ...flatHole(), seed: 2 }, mishit);
    expect(a.newState.ballPos.x).not.toEqual(b.newState.ballPos.x);
  });

  it('increments strokes and preserves hole identity fields', () => {
    const { newState } = resolveShot(flatHole(), fullDrive);
    expect(newState.seed).toBe(42);
    expect(newState.holePos).toEqual({ x: 0, y: 0, z: -150 });
  });
});
