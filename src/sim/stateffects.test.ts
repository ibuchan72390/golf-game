// src/sim/stateffects.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { effectiveStats, BASE_LOADOUT } from './clubs';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE, type Surface } from '../course/format';
import type { ClubLoadout, HoleState, ShotIntent } from './types';

beforeAll(async () => { await initPhysics(); });

function loadoutWith(club: 'iron7' | 'sandWedge', levels: Partial<{ power: number; accuracy: number; forgiveness: number; spin: number }>): ClubLoadout {
  return { ...BASE_LOADOUT, [club]: effectiveStats(club, { power: 0, accuracy: 0, forgiveness: 0, spin: 0, ...levels }) };
}
function state(fill: Surface = SURFACE.fairway, z = -20): HoleState {
  const hole = flatHoleFile(fill);
  return { seed: 4, ballPos: { x: 0, y: 0, z }, holePos: hole.pin, holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: fill };
}

describe('Power', () => {
  it('a power-upgraded club carries farther at full power', () => {
    const intent: ShotIntent = { club: 'iron7', aimDir: 0, power: 1, contactError: 0 };
    const base = resolveShot(state(), intent, BASE_LOADOUT).newState.ballPos.z;
    const up = resolveShot(state(), intent, loadoutWith('iron7', { power: 6 })).newState.ballPos.z;
    expect(Math.abs(up)).toBeGreaterThan(Math.abs(base) + 5);
  });
});

describe('Forgiveness', () => {
  it('a mishit lands closer to the aim line with high forgiveness', () => {
    const mishit: ShotIntent = { club: 'iron7', aimDir: 0, power: 1, contactError: 0.8 };
    const base = Math.abs(resolveShot(state(), mishit, BASE_LOADOUT).newState.ballPos.x);
    const forgiving = Math.abs(resolveShot(state(), mishit, loadoutWith('iron7', { forgiveness: 10 })).newState.ballPos.x);
    expect(forgiving).toBeLessThan(base);
  });
});

describe('Spin', () => {
  it('a high-spin approach checks up: less roll-out after landing on the green', () => {
    // fire a wedge onto an all-green surface; measure total travel
    const intent: ShotIntent = { club: 'sandWedge', aimDir: 0, power: 1, contactError: 0 };
    const lowSpin = { ...BASE_LOADOUT, sandWedge: effectiveStats('sandWedge', { power: 0, accuracy: 0, forgiveness: 0, spin: 0 }) };
    const hiSpin = loadoutWith('sandWedge', { spin: 10 });
    const lo = Math.abs(resolveShot(state(SURFACE.green, -10), intent, lowSpin).newState.ballPos.z) - 10;
    const hi = Math.abs(resolveShot(state(SURFACE.green, -10), intent, hiSpin).newState.ballPos.z) - 10;
    expect(hi).toBeLessThan(lo);
  });
});
