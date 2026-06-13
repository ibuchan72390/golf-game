import type { TrajectorySample, Vec3 } from '../sim/types';

/**
 * Replays a sim trajectory in wall-clock time; the renderer never simulates.
 * Long slow tails (a ball trickling its last meters) play back at 2–4× so the
 * player isn't left watching a creeping ball — flight and putts are unscaled.
 */
export class TrajectoryPlayback {
  done = false;
  private elapsed = 0;
  /** remaining path length (m) from each sample to the end */
  private readonly remaining: number[];

  constructor(private readonly samples: TrajectorySample[]) {
    if (samples.length === 0) throw new Error('empty trajectory');
    this.remaining = new Array<number>(samples.length);
    this.remaining[samples.length - 1] = 0;
    for (let i = samples.length - 2; i >= 0; i--) {
      const a = samples[i]!.pos;
      const b = samples[i + 1]!.pos;
      this.remaining[i] = this.remaining[i + 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
  }

  /** Advance by dt seconds (wall clock), returning the interpolated ball position. */
  advance(dt: number): Vec3 {
    this.elapsed += dt * this.timeScale();
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

  /** 1× during flight and short shots; 2×/4× once a mature playback is just trickling out. */
  private timeScale(): number {
    if (this.elapsed < 4) return 1;
    let i = 0;
    while (i < this.samples.length - 1 && this.samples[i + 1]!.t < this.elapsed) i++;
    const left = this.remaining[i]!;
    if (left > 2) return 1;
    return left > 0.5 ? 2 : 4;
  }
}
