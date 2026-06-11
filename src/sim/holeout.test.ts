import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import type { HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

function onGreen(metersFromHole: number): HoleState {
  return {
    seed: 7,
    ballPos: { x: 0, y: 0, z: -150 + metersFromHole },
    holePos: { x: 0, y: 0, z: -150 },
    holeRadius: 0.15,
    strokes: 2,
    holedOut: false,
  };
}

describe('hole-out', () => {
  it('a firm short putt drops', () => {
    const { newState } = resolveShot(onGreen(1.5), {
      club: 'putter',
      aimDir: 0,
      power: 0.25,
      contactError: 0,
    });
    expect(newState.holedOut).toBe(true);
    expect(newState.ballPos).toEqual({ x: 0, y: 0, z: -150 });
    expect(newState.strokes).toBe(3);
  });

  it('a blasted putt skips the cup', () => {
    const { newState } = resolveShot(onGreen(1.5), {
      club: 'putter',
      aimDir: 0,
      power: 1,
      contactError: 0,
    });
    expect(newState.holedOut).toBe(false);
    expect(newState.ballPos.z).toBeLessThan(-150.5); // rolled past
  });

  it('a putt aimed sideways misses', () => {
    const { newState } = resolveShot(onGreen(1.5), {
      club: 'putter',
      aimDir: Math.PI / 4,
      power: 0.25,
      contactError: 0,
    });
    expect(newState.holedOut).toBe(false);
  });
});
