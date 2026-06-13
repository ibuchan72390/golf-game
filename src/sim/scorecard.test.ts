import { describe, expect, it } from 'vitest';
import {
  makeScorecard, recordHole, totalStrokes, parThroughPlayed, relativeToPar, formatRelative,
} from './scorecard';

const PARS = [4, 3, 5, 4, 4, 3, 5, 4, 4] as const;

describe('scorecard', () => {
  it('starts with all holes unplayed', () => {
    const c = makeScorecard([...PARS]);
    expect(c.holes.length).toBe(9);
    expect(c.holes.every((h) => h.strokes === null)).toBe(true);
    expect(totalStrokes(c)).toBe(0);
  });

  it('records strokes immutably', () => {
    const c0 = makeScorecard([...PARS]);
    const c1 = recordHole(c0, 0, 5);
    expect(c0.holes[0]!.strokes).toBeNull(); // original untouched
    expect(c1.holes[0]!.strokes).toBe(5);
    expect(totalStrokes(c1)).toBe(5);
  });

  it('computes par through played holes and relative score', () => {
    let c = makeScorecard([...PARS]);
    c = recordHole(c, 0, 5); // par 4 → +1
    c = recordHole(c, 1, 2); // par 3 → -1
    expect(parThroughPlayed(c)).toBe(7); // 4 + 3
    expect(totalStrokes(c)).toBe(7);
    expect(relativeToPar(c)).toBe(0); // E
  });

  it('formats relative to par', () => {
    expect(formatRelative(0)).toBe('E');
    expect(formatRelative(3)).toBe('+3');
    expect(formatRelative(-2)).toBe('-2');
  });
});
