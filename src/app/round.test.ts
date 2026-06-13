// src/app/round.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { Round, type RoundView } from './round';
import { initPhysics } from '../sim/shot';
import { generateCourse } from '../course/generate';

beforeAll(async () => {
  await initPhysics();
});

function makeRound(events: string[]) {
  const course = generateCourse(42);
  const view: RoundView = {
    onStateChange: () => {},
    setBallPosition: () => {},
    setAimDir: () => {},
    frameBall: () => {},
    onLanding: () => {},
    onHoleComplete: (i, strokes) => events.push(`hole ${i} done in ${strokes}`),
    onRoundComplete: () => events.push('round done'),
  };
  return { round: new Round(course, view), course };
}

describe('Round', () => {
  it('starts on hole 0, playing, with a fresh scorecard', () => {
    const { round } = makeRound([]);
    expect(round.index).toBe(0);
    expect(round.phase).toBe('playing');
    expect(round.card.holes.length).toBe(9);
    expect(round.card.holes.every((h) => h.strokes === null)).toBe(true);
    expect(round.game.hole.hole.par).toBe(round.course.holes[0]!.par);
  });

  it('records the score and goes to hole-complete when the hole is holed out', () => {
    const events: string[] = [];
    const { round } = makeRound(events);
    // drive the underlying game to hole-out: place near pin and putt in
    const g = round.game;
    g.hole.ballPos = { x: g.hole.holePos.x, y: 0, z: g.hole.holePos.z + 0.6 };
    g.hole.lie = 2; // green
    g.performSwing({ club: 'putter', aimDir: g.aimToHole(), power: 0.5, contactError: 0 });
    g.update(60);
    expect(g.phase).toBe('holed');
    round.onHoleSettled(); // app calls this when it observes the holed phase
    expect(round.phase).toBe('hole-complete');
    expect(round.card.holes[0]!.strokes).toBeGreaterThan(0);
    expect(events[0]).toContain('hole 0 done');
  });

  it('advances to the next hole and finishes after 9', () => {
    const events: string[] = [];
    const { round } = makeRound(events);
    for (let i = 0; i < 9; i++) {
      expect(round.index).toBe(i);
      // simulate completing the hole in 4 strokes via the test seam
      round.completeHoleForTest(4);
      expect(round.phase).toBe('hole-complete');
      round.nextHole();
    }
    expect(round.phase).toBe('round-complete');
    expect(round.card.holes.every((h) => h.strokes === 4)).toBe(true);
    expect(events[events.length - 1]).toBe('round done');
  });
});
