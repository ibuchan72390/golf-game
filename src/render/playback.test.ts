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
});
