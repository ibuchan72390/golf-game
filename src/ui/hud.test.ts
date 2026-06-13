// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createHud } from './hud';
import { BASE_LOADOUT } from '../sim/clubs';

describe('hud distance readout', () => {
  it('setLoadout writes approximate carry onto full-swing club buttons, not the putter', () => {
    const root = document.createElement('div');
    const hud = createHud(root);
    hud.setLoadout(BASE_LOADOUT);
    const driver = root.querySelector('#club-driver') as HTMLElement;
    const putter = root.querySelector('#club-putter') as HTMLElement;
    expect(driver.textContent).toMatch(/\d+\s*m/); // e.g. "Driver · ≈190 m"
    expect(putter.textContent).not.toMatch(/\d+\s*m/); // putter shows no carry
    expect(putter.textContent).toContain('Putter');
  });
});

describe('hud aim arrows', () => {
  it('fires onAim with direction on pointerdown of an arrow', () => {
    const root = document.createElement('div');
    const hud = createHud(root);
    const dirs: number[] = [];
    hud.onAim((dir) => dirs.push(dir));
    const right = root.querySelector('#aim-right') as HTMLElement;
    right.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    // stop the repeat so the test doesn't leave a timer running
    right.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs[0]).toBe(1);
  });

  it('shows arrows only while aiming', () => {
    const root = document.createElement('div');
    const hud = createHud(root);
    const wrap = root.querySelector('#aim-controls') as HTMLElement;
    // update() drives visibility by phase; build a minimal hole state
    const hole = { par: 3 } as never;
    const state = { strokes: 0, holePos: { x: 0, y: 0, z: -10 }, ballPos: { x: 0, y: 0, z: 0 }, lie: 0, hole } as never;
    hud.update('aiming', state, 'driver');
    expect(wrap.style.display).not.toBe('none');
    hud.update('flying', state, 'driver');
    expect(wrap.style.display).toBe('none');
  });
});
