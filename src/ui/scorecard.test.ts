// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderScorecard } from './scorecard';
import { makeScorecard, recordHole } from '../sim/scorecard';

describe('renderScorecard', () => {
  it('shows par row, played strokes, blanks for unplayed, and total', () => {
    const root = document.createElement('div');
    let c = makeScorecard([4, 3, 5, 4, 4, 3, 5, 4, 4]);
    c = recordHole(c, 0, 5);
    c = recordHole(c, 1, 2);
    renderScorecard(root, c, 1);
    const text = root.textContent ?? '';
    expect(text).toContain('5'); // hole 1 strokes
    expect(text).toContain('2'); // hole 2 strokes
    expect(root.querySelector('#sc-total')?.textContent).toContain('7'); // total strokes
    expect(root.querySelector('#sc-relative')?.textContent).toBe('E'); // 7 vs par 7
    // current hole highlighted
    expect(root.querySelector('[data-current="true"]')).not.toBeNull();
  });
});
