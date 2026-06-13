// src/sim/heightfield.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { BASE_LOADOUT } from './clubs';
import { flatHoleFile, rampHoleFile, zRampHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import { heightAt } from '../course/format';
import type { HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

function stateAt(x: number, z: number, hole = rampHoleFile()): HoleState {
  return {
    seed: 9, ballPos: { x, y: 0, z }, holePos: hole.pin, holeRadius: 0.15,
    strokes: 0, holedOut: false, hole, lie: SURFACE.fairway,
  };
}

describe('heightfield collider orientation', () => {
  // A zero-power putt settles in place; rest height must match heightAt.
  for (const [x, z] of [[10, -30], [-20, -80], [25, -160]] as const) {
    it(`ball rests on terrain at (${x}, ${z})`, () => {
      const { newState } = resolveShot(stateAt(x, z), { club: 'putter', aimDir: 0, power: 0, contactError: 0 }, BASE_LOADOUT);
      expect(newState.ballPos.y).toBeCloseTo(heightAt(rampHoleFile(), newState.ballPos.x, newState.ballPos.z), 1);
      expect(Math.hypot(newState.ballPos.x - x, newState.ballPos.z - z)).toBeLessThan(3); // may roll a little downslope
    });
  }
  it('flat hole keeps resting at y≈0', () => {
    const { newState } = resolveShot(stateAt(0, -50, flatHoleFile()), { club: 'putter', aimDir: 0, power: 0, contactError: 0 }, BASE_LOADOUT);
    expect(newState.ballPos.y).toBeCloseTo(0, 1);
  });

  for (const [x, z, expected] of [[0, -30, 0.6], [0, -150, 3.0]] as const) {
    it(`z-ramp: ball rests at height ${expected} at z=${z}`, () => {
      const { newState } = resolveShot(stateAt(x, z, zRampHoleFile()), { club: 'putter', aimDir: 0, power: 0, contactError: 0 }, BASE_LOADOUT);
      expect(newState.ballPos.y).toBeCloseTo(expected, 1);
    });
  }
});
