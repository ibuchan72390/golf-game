// src/render/cameraRig.ts — pure math, no Three.js imports (unit-testable)
import type { Vec3 } from '../sim/types';

export type CameraMode = 'aiming' | 'putting' | 'flight';

export interface CameraGoal {
  pos: Vec3;
  look: Vec3;
}

export function cameraGoal(mode: CameraMode, ball: Vec3, aimDir: number, velocity: Vec3 | null): CameraGoal {
  if (mode === 'flight' && velocity) {
    const h = Math.hypot(velocity.x, velocity.z);
    if (h > 0.5) {
      const dx = velocity.x / h, dz = velocity.z / h;
      return {
        pos: { x: ball.x - dx * 10, y: ball.y + 4, z: ball.z - dz * 10 },
        look: { x: ball.x + dx * 5, y: ball.y, z: ball.z + dz * 5 },
      };
    }
  }
  const dx = Math.sin(aimDir), dz = -Math.cos(aimDir);
  const back = mode === 'putting' ? 4 : 8;
  const up = mode === 'putting' ? 1.2 : 3;
  const ahead = mode === 'putting' ? 10 : 20;
  return {
    pos: { x: ball.x - dx * back, y: ball.y + up, z: ball.z - dz * back },
    look: { x: ball.x + dx * ahead, y: ball.y, z: ball.z + dz * ahead },
  };
}

const RATE = 4; // higher = snappier

export class CameraFollower {
  constructor(public pos: Vec3, public look: Vec3) {}

  update(dt: number, goal: CameraGoal): void {
    const f = 1 - Math.exp(-RATE * dt);
    for (const k of ['x', 'y', 'z'] as const) {
      this.pos[k] += (goal.pos[k] - this.pos[k]) * f;
      this.look[k] += (goal.look[k] - this.look[k]) * f;
    }
  }

  snap(goal: CameraGoal): void {
    this.pos = { ...goal.pos };
    this.look = { ...goal.look };
  }
}
