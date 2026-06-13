// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { showMenu, showCourseSelect, showRoundSummary, showHoleComplete } from './menu';
import { makeScorecard, recordHole } from '../sim/scorecard';

function root() {
  const r = document.createElement('div');
  document.body.appendChild(r);
  return r;
}

describe('menu screens', () => {
  it('menu fires Play / Upgrade / Settings callbacks', () => {
    const r = root();
    const onPlay = vi.fn(), onUpgrade = vi.fn(), onSettings = vi.fn();
    showMenu(r, { onPlay, onUpgrade, onSettings });
    (r.querySelector('#menu-play') as HTMLElement).click();
    (r.querySelector('#menu-upgrade') as HTMLElement).click();
    (r.querySelector('#menu-settings') as HTMLElement).click();
    expect(onPlay).toHaveBeenCalled();
    expect(onUpgrade).toHaveBeenCalled();
    expect(onSettings).toHaveBeenCalled();
  });

  it('course-select offers curated and random with a seed', () => {
    const r = root();
    const onCourse = vi.fn();
    showCourseSelect(r, [{ name: 'Seagrass Links', seed: 777 }], onCourse);
    (r.querySelector('#course-0') as HTMLElement).click();
    expect(onCourse).toHaveBeenCalledWith(777);
    (r.querySelector('#course-random') as HTMLElement).click();
    expect(onCourse).toHaveBeenCalledTimes(2);
    expect(typeof onCourse.mock.calls[1]![0]).toBe('number');
  });

  it('round summary shows totals and fires continue', () => {
    const r = root();
    let c = makeScorecard([4, 3, 5, 4, 4, 3, 5, 4, 4]);
    c.holes.forEach((_, i) => (c = recordHole(c, i, 4)));
    const onContinue = vi.fn();
    showRoundSummary(r, c, 12, onContinue);
    expect(r.textContent).toContain('12'); // skill points earned
    (r.querySelector('#summary-continue') as HTMLElement).click();
    expect(onContinue).toHaveBeenCalled();
  });

  it('hole-complete shows the score name and fires next', () => {
    const r = root();
    const onNext = vi.fn();
    showHoleComplete(r, 0, 3, 4, onNext); // hole 1, 3 strokes on par 4 → Birdie
    expect(r.textContent).toContain('Birdie');
    (r.querySelector('#hole-next') as HTMLElement).click();
    expect(onNext).toHaveBeenCalled();
  });
});
