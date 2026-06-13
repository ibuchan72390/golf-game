// src/sim/carry.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { approxCarry, BASE_LOADOUT } from './clubs';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';
import type { ClubId, HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

// full-power flat-fairway carry+roll for a club, measured from the sim
function realCarry(club: ClubId): number {
  const hole = flatHoleFile(SURFACE.fairway);
  const state: HoleState = {
    seed: 1, ballPos: { x: 0, y: 0, z: -5 }, holePos: { x: 0, y: 0, z: -400 }, // pin far: no capture
    holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: SURFACE.fairway,
  };
  const { newState } = resolveShot(state, { club, aimDir: 0, power: 1, contactError: 0 }, BASE_LOADOUT);
  return Math.abs(newState.ballPos.z) - 5;
}

describe('approxCarry calibration (within 15% of the real sim, base loadout)', () => {
  for (const club of ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'pitchingWedge', 'sandWedge'] as const) {
    it(`${club}`, () => {
      const real = realCarry(club);
      const shown = approxCarry(club, BASE_LOADOUT[club]);
      expect(Math.abs(shown - real) / real).toBeLessThan(0.15);
    });
  }
});
