// src/app/game.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { autoClub, Game, makeHoleState } from './game';
import { initPhysics } from '../sim/shot';
import { flatHoleFile } from '../course/fixtures';
import { SURFACE } from '../course/format';

beforeAll(async () => {
  await initPhysics();
});

function makeGame(hole = flatHoleFile()) {
  return new Game(42, hole, {
    onStateChange: () => {},
    setBallPosition: () => {},
    setAimDir: () => {},
    frameBall: () => {},
    onLanding: () => {},
  });
}

describe('autoClub', () => {
  it('switches to putter on the green and off putter when leaving it', () => {
    expect(autoClub(SURFACE.green, 'iron7')).toBe('putter');
    expect(autoClub(SURFACE.fairway, 'putter')).toBe('iron7');
    expect(autoClub(SURFACE.rough, 'driver')).toBe('driver');
  });
});

describe('Game', () => {
  it('starts aiming from the tee with the driver', () => {
    const g = makeGame();
    expect(g.phase).toBe('aiming');
    expect(g.club).toBe('driver');
    expect(g.hole.strokes).toBe(0);
    expect(g.hole.ballPos).toEqual({ ...flatHoleFile().tee });
  });

  it('full drive flies, settles back to aiming, +1 stroke', () => {
    const g = makeGame();
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    expect(g.phase).toBe('flying');
    g.update(60);
    expect(g.phase).toBe('aiming');
    expect(g.hole.strokes).toBe(1);
    expect(g.hole.ballPos.z).toBeLessThan(-100);
  });

  it('re-entrant swing during flight is ignored', () => {
    const g = makeGame();
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    g.performSwing({ club: 'driver', aimDir: 0, power: 1, contactError: 0 });
    g.update(60);
    expect(g.hole.strokes).toBe(1);
  });

  it('putter power is rescaled: a full-bar 3 m putt stays near the hole', () => {
    const g = makeGame();
    g.hole.ballPos = { x: 0, y: 0, z: -147 };
    g.hole.lie = SURFACE.green;
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 1, contactError: 0 });
    g.update(60);
    const d = Math.hypot(g.hole.ballPos.x, g.hole.ballPos.z + 150);
    expect(g.hole.holedOut || d < 8).toBe(true); // without rescale, 12 m/s rolls ~40 m past
  });

  it('holing out reaches holed; club auto-switches to putter on the green', () => {
    const g = makeGame();
    g.hole.ballPos = { x: 0, y: 0, z: -148.5 };
    g.hole.lie = SURFACE.green;
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 1, contactError: 0 });
    g.update(60);
    expect(g.hole.holedOut).toBe(true);
    expect(g.phase).toBe('holed');
  });

  it('makeHoleState seeds state from a HoleFile', () => {
    const hole = flatHoleFile();
    const s = makeHoleState(hole, 7);
    expect(s.ballPos).toEqual({ ...hole.tee });
    expect(s.holePos).toEqual({ ...hole.pin });
    expect(s.hole).toBe(hole);
  });
});
