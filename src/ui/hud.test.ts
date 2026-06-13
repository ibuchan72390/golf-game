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
