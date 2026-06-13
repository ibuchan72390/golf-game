// src/sim/surfaces.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { BASE_LOADOUT } from './clubs';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE, type Surface } from '../course/format';
import type { HoleState } from './types';

beforeAll(async () => {
  await initPhysics();
});

function rollFrom(fill: Surface): number {
  const hole = flatHoleFile(fill);
  const state: HoleState = {
    seed: 3, ballPos: { x: 0, y: 0, z: -20 }, holePos: { x: 0, y: 0, z: -190 }, // pin far away: pure roll test, no capture
    holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: fill,
  };
  // putter strike has no lie power penalty on green/fairway; use fairway-vs-green-vs-rough relative roll
  const { newState } = resolveShot(state, { club: 'putter', aimDir: 0, power: 0.6, contactError: 0 }, BASE_LOADOUT);
  return Math.abs(newState.ballPos.z) - 20;
}

describe('per-surface roll', () => {
  it('green rolls farther than fairway, fairway farther than rough', () => {
    const green = rollFrom(SURFACE.green);
    const fairway = rollFrom(SURFACE.fairway);
    const rough = rollFrom(SURFACE.rough);
    expect(green).toBeGreaterThan(fairway * 1.15);
    expect(fairway).toBeGreaterThan(rough * 1.5);
  });
  it('sand stops the ball almost immediately', () => {
    expect(rollFrom(SURFACE.sand)).toBeLessThan(2);
  });
});
