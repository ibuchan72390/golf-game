import { describe, expect, it } from 'vitest';
import { scoreName } from './scoring';

describe('scoreName', () => {
  it('names the classics', () => {
    expect(scoreName(1, 3)).toBe('Ace!');
    expect(scoreName(1, 5)).toBe('Ace!');
    expect(scoreName(2, 5)).toBe('Albatross!');
    expect(scoreName(3, 5)).toBe('Eagle!');
    expect(scoreName(2, 3)).toBe('Birdie!');
    expect(scoreName(3, 3)).toBe('Par');
    expect(scoreName(4, 3)).toBe('Bogey');
    expect(scoreName(5, 3)).toBe('Double Bogey');
    expect(scoreName(7, 3)).toBe('+4');
  });
});
