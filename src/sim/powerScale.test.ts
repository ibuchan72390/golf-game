// src/sim/powerScale.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { meterMaxSpeed, PUTT_DECEL } from './powerScale';
import { CLUBS } from './clubs';
import { SURFACE } from '../course/format';
import { initPhysics, resolveShot } from './shot';
import { flatHoleFile } from '../course/fixtures';
import type { HoleState } from './types';

describe('meterMaxSpeed', () => {
  it('putter full bar scales with distance (touch on short putts)', () => {
    const short = meterMaxSpeed('putter', SURFACE.green, 3);
    const long = meterMaxSpeed('putter', SURFACE.green, 15);
    expect(short).toBeLessThan(long);
    expect(short).toBeGreaterThanOrEqual(2); // enough to reach + drop
    expect(long).toBeLessThanOrEqual(CLUBS.putter.maxSpeed);
  });
  it('a full-bar putt at 10 m would roll past but not absurdly far', () => {
    // measured green physics: roll ≈ v0 / PUTT_DECEL (Task 5 review)
    const v0 = meterMaxSpeed('putter', SURFACE.green, 10);
    const roll = v0 / PUTT_DECEL;
    expect(roll).toBeGreaterThan(10);
    expect(roll).toBeLessThan(20);
  });
  it('wedge chips rescale inside 40 m off-green', () => {
    const chip = meterMaxSpeed('sandWedge', SURFACE.fairway, 20);
    expect(chip).toBeLessThan(CLUBS.sandWedge.maxSpeed);
    expect(chip).toBeGreaterThan(5);
  });
  it('full swings are untouched', () => {
    expect(meterMaxSpeed('driver', SURFACE.fairway, 200)).toBe(CLUBS.driver.maxSpeed);
    expect(meterMaxSpeed('sandWedge', SURFACE.fairway, 80)).toBe(CLUBS.sandWedge.maxSpeed);
    expect(meterMaxSpeed('sandWedge', SURFACE.green, 20)).toBe(CLUBS.sandWedge.maxSpeed); // on green you'd putt; no chip rescale
  });
});

describe('meterMaxSpeed integration', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('integration: a full-bar putt scaled by meterMaxSpeed reaches past a 6 m pin but stays within 2x', async () => {
    const hole = flatHoleFile(SURFACE.green);
    const state: HoleState = {
      seed: 5, ballPos: { x: 0, y: 0, z: -144 }, holePos: { x: 0, y: 0, z: -190 },
      holeRadius: 0.15, strokes: 0, holedOut: false, hole, lie: SURFACE.green,
    };
    const v0 = meterMaxSpeed('putter', SURFACE.green, 6);
    const { newState } = resolveShot(state, { club: 'putter', aimDir: 0, power: v0 / CLUBS.putter.maxSpeed, contactError: 0 });
    const traveled = Math.abs(newState.ballPos.z) - 144;
    expect(traveled).toBeGreaterThan(6);
    expect(traveled).toBeLessThan(12);
  });
});
