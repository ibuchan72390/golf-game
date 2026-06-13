// Regression tests for the landing-tunnel bug: high-speed landings passed
// through the thin heightfield (CCD miss), leaving the ball sinking below
// terrain until the 30 s sim cap — felt as a long post-shot "lag" in game.
// Root fix: cartoon-sized physics ball (BALL_RADIUS 0.1) so per-step travel
// is ~1 diameter. These tests sweep a broad seed range so a regression can't
// hide behind lucky seeds, and assert the ball truly RESTS (end speed), on
// the surface, within a bounded time.
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, resolveShot } from './shot';
import { generateHole } from '../course/generate';
import { heightAt } from '../course/format';
import { makeHoleState } from '../app/game';
import type { ShotIntent } from './types';

beforeAll(async () => {
  await initPhysics();
});

const drive: ShotIntent = { club: 'driver', aimDir: 0, power: 1, contactError: 0 };
const wedgeFull: ShotIntent = { club: 'wedge', aimDir: 0, power: 1, contactError: 0 };

function check(seed: number, intent: ShotIntent) {
  const hole = generateHole(seed, 4);
  const { trajectory, newState } = resolveShot(makeHoleState(hole, seed), intent);

  // Never tunnels below the terrain mid-flight. A high-speed impact may
  // penetrate for a frame or two before the solver recovers (invisible — the
  // renderer clamps to ground) — what must never happen is SUSTAINED sinking.
  let minBelow = 0;
  let maxConsecutiveBelow = 0;
  let run = 0;
  for (const s of trajectory) {
    const below = s.pos.y - heightAt(hole, s.pos.x, s.pos.z);
    minBelow = Math.min(minBelow, below);
    run = below < -0.15 ? run + 1 : 0;
    maxConsecutiveBelow = Math.max(maxConsecutiveBelow, run);
  }
  expect(minBelow, `seed ${seed} deep tunnel`).toBeGreaterThan(-0.35);
  expect(maxConsecutiveBelow, `seed ${seed} sustained sinking`).toBeLessThanOrEqual(3);

  // rests ON the surface, not under or above it
  const restGround = heightAt(hole, newState.ballPos.x, newState.ballPos.z);
  expect(
    Math.abs(newState.ballPos.y - restGround),
    `seed ${seed} rest height off`,
  ).toBeLessThanOrEqual(0.15);

  // genuinely at rest — not frozen mid-motion by a settle cap
  const n = trajectory.length;
  if (!newState.holedOut && n >= 3) {
    const a = trajectory[n - 3]!;
    const b = trajectory[n - 2]!; // last sample before the appended rest point
    const endSpeed =
      Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y, b.pos.z - a.pos.z) / (b.t - a.t);
    expect(endSpeed, `seed ${seed} frozen mid-motion`).toBeLessThan(0.25);
  }

  // within a sane playback budget (was hitting the 30 s cap)
  expect(trajectory[n - 1]!.t, `seed ${seed} too slow to settle`).toBeLessThan(15);
}

describe('high-speed landings settle on the terrain', () => {
  for (const batchStart of [1, 11, 21, 31]) {
    it(`drives, seeds ${batchStart}..${batchStart + 9}`, () => {
      for (let seed = batchStart; seed < batchStart + 10; seed++) check(seed, drive);
    });
  }
  it('full wedges, seeds 1..20', () => {
    for (let seed = 1; seed <= 20; seed++) check(seed, wedgeFull);
  });
  it('original report seeds 42, 7, 13 (drive + wedge)', () => {
    for (const seed of [42, 7, 13]) {
      check(seed, drive);
      check(seed, wedgeFull);
    }
  });
});
