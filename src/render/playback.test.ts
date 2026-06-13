import { describe, expect, it } from 'vitest';
import { TrajectoryPlayback } from './playback';
import type { TrajectorySample } from '../sim/types';

const samples: TrajectorySample[] = [
  { t: 0, pos: { x: 0, y: 0, z: 0 } },
  { t: 1, pos: { x: 0, y: 10, z: -50 } },
  { t: 2, pos: { x: 0, y: 0, z: -100 } },
];

describe('TrajectoryPlayback', () => {
  it('interpolates between samples', () => {
    const p = new TrajectoryPlayback(samples);
    expect(p.advance(0.5)).toEqual({ x: 0, y: 5, z: -25 });
    expect(p.done).toBe(false);
  });

  it('finishes at the last sample and reports done', () => {
    const p = new TrajectoryPlayback(samples);
    const end = p.advance(10);
    expect(end).toEqual({ x: 0, y: 0, z: -100 });
    expect(p.done).toBe(true);
  });

  it('handles a single-sample trajectory', () => {
    const p = new TrajectoryPlayback([{ t: 0.1, pos: { x: 1, y: 0, z: 2 } }]);
    expect(p.advance(0.01)).toEqual({ x: 1, y: 0, z: 2 });
    expect(p.done).toBe(true);
  });

  it('accelerates a long slow tail so playback ends sooner than sim time', () => {
    // 12 s trajectory: 4 s flight covering 150 m, then 8 s of slow creep over 1.5 m
    const slow: TrajectorySample[] = [];
    for (let t = 0; t <= 4; t += 0.25) {
      slow.push({ t, pos: { x: 0, y: 0, z: -t * 37.5 } });
    }
    for (let t = 4.25; t <= 12; t += 0.25) {
      slow.push({ t, pos: { x: 0, y: 0, z: -150 - ((t - 4) / 8) * 1.5 } });
    }
    const p = new TrajectoryPlayback(slow);
    let wall = 0;
    while (!p.done && wall < 20) {
      p.advance(1 / 60);
      wall += 1 / 60;
    }
    expect(p.done).toBe(true);
    expect(wall).toBeLessThan(8); // ~12 s of sim plays back well under 8 s
  });

  it('does not accelerate early flight or short putts', () => {
    // early flight: plenty of distance remaining → unscaled
    const p = new TrajectoryPlayback(samples);
    expect(p.advance(0.5)).toEqual({ x: 0, y: 5, z: -25 }); // identical to unscaled
    // a 3 s putt (short remaining distance but young playback) → unscaled
    const putt: TrajectorySample[] = [
      { t: 0, pos: { x: 0, y: 0, z: 0 } },
      { t: 3, pos: { x: 0, y: 0, z: -1.5 } },
    ];
    const q = new TrajectoryPlayback(putt);
    expect(q.advance(1.5)).toEqual({ x: 0, y: 0, z: -0.75 });
  });
});
