import { describe, expect, it } from 'vitest';
import { CameraFollower, cameraGoal } from './cameraRig';

const ball = { x: 0, y: 0, z: -50 };

describe('cameraGoal', () => {
  it('aiming sits behind the ball against aimDir, above it', () => {
    const g = cameraGoal('aiming', ball, 0, null);
    expect(g.pos.z).toBeGreaterThan(ball.z); // behind = +z when aiming -z
    expect(g.pos.y).toBeGreaterThan(2);
    expect(g.look.z).toBeLessThan(ball.z); // looking down the line
  });
  it('putting is lower and closer than aiming', () => {
    const a = cameraGoal('aiming', ball, 0, null);
    const p = cameraGoal('putting', ball, 0, null);
    expect(p.pos.y).toBeLessThan(a.pos.y);
    expect(Math.abs(p.pos.z - ball.z)).toBeLessThan(Math.abs(a.pos.z - ball.z));
  });
  it('flight chases behind the velocity direction', () => {
    const g = cameraGoal('flight', ball, 0, { x: 0, y: 5, z: -30 });
    expect(g.pos.z).toBeGreaterThan(ball.z);
    expect(g.look.z).toBeLessThan(ball.z);
  });
  it('flight with near-zero velocity falls back to aimDir framing', () => {
    const g = cameraGoal('flight', ball, 0, { x: 0, y: 0, z: -0.001 });
    expect(Number.isFinite(g.pos.x)).toBe(true);
    expect(g.pos.z).toBeGreaterThan(ball.z);
  });
});

describe('CameraFollower', () => {
  it('converges to the goal without overshooting', () => {
    const f = new CameraFollower({ x: 0, y: 3, z: 8 }, { x: 0, y: 0, z: -20 });
    const goal = cameraGoal('aiming', { x: 0, y: 0, z: -100 }, 0, null);
    let prevDist = Infinity;
    for (let i = 0; i < 300; i++) {
      f.update(1 / 60, goal);
      const d = Math.hypot(f.pos.x - goal.pos.x, f.pos.y - goal.pos.y, f.pos.z - goal.pos.z);
      expect(d).toBeLessThanOrEqual(prevDist + 1e-9);
      prevDist = d;
    }
    expect(prevDist).toBeLessThan(0.05);
  });
  it('snap jumps instantly', () => {
    const f = new CameraFollower({ x: 0, y: 3, z: 8 }, { x: 0, y: 0, z: -20 });
    const goal = cameraGoal('aiming', ball, 0, null);
    f.snap(goal);
    expect(f.pos).toEqual(goal.pos);
    expect(f.look).toEqual(goal.look);
  });
});
