// src/app/game.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { Game } from './game';
import { initPhysics } from '../sim/shot';

beforeAll(async () => {
  await initPhysics();
});

function makeGame() {
  return new Game(42, {
    onStateChange: () => {},
    setBallPosition: () => {},
    setAimDir: () => {},
    frameBall: () => {},
  });
}

describe('Game', () => {
  it('starts in aiming with 0 strokes, ball on tee', () => {
    const g = makeGame();
    expect(g.phase).toBe('aiming');
    expect(g.hole.strokes).toBe(0);
    expect(g.hole.ballPos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('default aim points at the hole', () => {
    const g = makeGame();
    expect(g.aimDir).toBeCloseTo(0, 5);
  });

  it('performSwing flies the ball, then settles back to aiming with +1 stroke', () => {
    const g = makeGame();
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    expect(g.phase).toBe('flying');
    g.update(60); // advance well past flight duration
    expect(g.phase).toBe('aiming');
    expect(g.hole.strokes).toBe(1);
    expect(g.hole.ballPos.z).toBeLessThan(-100);
  });

  it('holing out reaches the holed phase', () => {
    const g = makeGame();
    g.hole.ballPos = { x: 0, y: 0, z: -148.5 };
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 0.25, contactError: 0 });
    g.update(60);
    expect(g.phase).toBe('holed');
    expect(g.hole.holedOut).toBe(true);
  });

  it('adjustAim rotates and re-aims', () => {
    const g = makeGame();
    g.adjustAim(0.2);
    expect(g.aimDir).toBeCloseTo(0.2, 5);
  });
});
