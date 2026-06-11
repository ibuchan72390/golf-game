import type { TrajectorySample, Vec3 } from '../sim/types';

/** Replays a sim trajectory in wall-clock time; the renderer never simulates. */
export class TrajectoryPlayback {
  done = false;
  private elapsed = 0;

  constructor(private readonly samples: TrajectorySample[]) {
    if (samples.length === 0) throw new Error('empty trajectory');
  }

  /** Advance by dt seconds, returning the interpolated ball position. */
  advance(dt: number): Vec3 {
    this.elapsed += dt;
    const last = this.samples[this.samples.length - 1]!;
    if (this.samples.length === 1 || this.elapsed >= last.t) {
      this.done = true;
      return { ...last.pos };
    }
    let i = 0;
    while (i < this.samples.length - 1 && this.samples[i + 1]!.t < this.elapsed) i++;
    const a = this.samples[i]!;
    const b = this.samples[i + 1]!;
    const span = b.t - a.t || 1;
    const f = Math.min(Math.max((this.elapsed - a.t) / span, 0), 1);
    return {
      x: a.pos.x + (b.pos.x - a.pos.x) * f,
      y: a.pos.y + (b.pos.y - a.pos.y) * f,
      z: a.pos.z + (b.pos.z - a.pos.z) * f,
    };
  }
}
